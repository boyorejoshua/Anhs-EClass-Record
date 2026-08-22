/**
 * The grading engine.
 *
 * A PURE function: no I/O, no database, no globals. That is what lets
 * the identical module run in two places —
 *
 *   • in the browser, for instant recomputation as a teacher types
 *   • in a Deno Edge Function, as the authority on save
 *
 * One implementation, two runtimes, no drift. The alternative (plpgsql
 * on the server plus JavaScript in the client) guarantees two subtly
 * different formulas and a reconciliation problem nobody wants to own.
 */

import type {
  Assessment,
  ComponentResult,
  ComputeOptions,
  GradeComponent,
  GradeResult,
  GradingScheme,
  RoundingMode,
  Score,
} from './types';

export * from './types';

/** Rounds to `places` decimals under the school's configured rule. */
export function round(value: number, places: number, mode: RoundingMode): number {
  const f = 10 ** places;
  const scaled = value * f;

  switch (mode) {
    case 'truncate':
      return Math.trunc(scaled) / f;

    case 'half_even': {
      const floor = Math.floor(scaled);
      const diff = scaled - floor;
      if (Math.abs(diff - 0.5) > Number.EPSILON) return Math.round(scaled) / f;
      return (floor % 2 === 0 ? floor : floor + 1) / f;
    }

    case 'half_up':
    default:
      // Nudge against binary representation error: 8.245 is stored as
      // 8.2449999… and would otherwise round down.
      return Math.round(Number((scaled).toFixed(8))) / f;
  }
}

/**
 * Flattens the component tree to its leaves, converting each leaf's
 * parent-relative weight into a weight of the whole grade.
 *
 *   EX 30  ├─ ST1 30  →  effective 9
 *          ├─ ST2 30  →  effective 9
 *          └─ TE  40  →  effective 12
 */
export function flattenComponents(
  components: GradeComponent[],
): Array<GradeComponent & { effectiveWeight: number }> {
  const byParent = new Map<string | null, GradeComponent[]>();
  for (const c of components) {
    const key = c.parentId;
    const list = byParent.get(key);
    if (list) list.push(c);
    else byParent.set(key, [c]);
  }

  const leaves: Array<GradeComponent & { effectiveWeight: number }> = [];

  const walk = (parentId: string | null, carriedWeight: number): void => {
    const children = byParent.get(parentId);
    if (!children) return;
    for (const child of [...children].sort((a, b) => a.ordinal - b.ordinal)) {
      const effective = (carriedWeight * child.weight) / 100;
      const grandChildren = byParent.get(child.id);
      if (grandChildren && grandChildren.length > 0) {
        walk(child.id, effective);
      } else {
        leaves.push({ ...child, effectiveWeight: effective });
      }
    }
  };

  walk(null, 100);
  return leaves;
}

/** Applies the school's transmutation table, or rounds directly when there is none. */
export function transmute(
  initialGrade: number,
  scheme: Pick<GradingScheme, 'transmutation' | 'roundingMode' | 'decimalPlaces'>,
): number {
  // No table = zero-based grading (SY 2027-2028 onward). Not a special
  // case in the code — just an absent configuration row.
  if (!scheme.transmutation || scheme.transmutation.length === 0) {
    return round(initialGrade, scheme.decimalPlaces, scheme.roundingMode);
  }

  for (const band of scheme.transmutation) {
    if (initialGrade >= band.minInitial && initialGrade <= band.maxInitial) {
      return band.outputGrade;
    }
  }

  // Outside every band: clamp to the nearest edge rather than silently
  // returning the untransmuted value.
  const sorted = [...scheme.transmutation].sort((a, b) => a.minInitial - b.minInitial);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  if (lowest && initialGrade < lowest.minInitial) return lowest.outputGrade;
  if (highest && initialGrade > highest.maxInitial) return highest.outputGrade;
  return round(initialGrade, scheme.decimalPlaces, scheme.roundingMode);
}

export function describeGrade(
  grade: number,
  scheme: Pick<GradingScheme, 'descriptors'>,
): { label: string | null; remark: string | null } {
  for (const band of scheme.descriptors) {
    if (grade >= band.minGrade && grade <= band.maxGrade) {
      return { label: band.label, remark: band.remark };
    }
  }
  return { label: null, remark: null };
}

/**
 * Computes one learner's grade for one class for one period.
 */
export function compute(
  scheme: GradingScheme,
  assessments: Assessment[],
  scores: Score[],
  options: ComputeOptions = {},
): GradeResult {
  const includeUnscored = options.includeUnscored ?? false;

  const scoreByAssessment = new Map<string, Score>();
  for (const s of scores) scoreByAssessment.set(s.assessmentId, s);

  const leaves = flattenComponents(scheme.components);
  const assessmentsByComponent = new Map<string, Assessment[]>();
  for (const a of assessments) {
    const list = assessmentsByComponent.get(a.componentId);
    if (list) list.push(a);
    else assessmentsByComponent.set(a.componentId, [a]);
  }

  const raw: ComponentResult[] = leaves.map((leaf) => {
    const items = (assessmentsByComponent.get(leaf.id) ?? []).sort(
      (a, b) => a.ordinal - b.ordinal,
    );

    let totalRaw = 0;
    let totalPossible = 0;
    let scoredCount = 0;

    for (const item of items) {
      const score = scoreByAssessment.get(item.id);

      // An excused assessment never counts, in either mode. This is the
      // distinction V0 cannot make: it has no way to say "did not take
      // it, legitimately" as opposed to "not entered yet".
      if (score?.isExcused) continue;

      const hasScore = score != null && score.raw != null;
      if (hasScore) {
        totalRaw += score.raw as number;
        totalPossible += item.highestPossibleScore;
        scoredCount += 1;
      } else if (includeUnscored) {
        // Final mode: a missing score is a zero, and its maximum still
        // counts against the learner.
        totalPossible += item.highestPossibleScore;
      }
      // Running mode: skip entirely, so the grade reflects work returned
      // so far rather than punishing work not yet given.
    }

    const included = totalPossible > 0;
    const percentageScore = included ? (totalRaw / totalPossible) * 100 : null;

    return {
      componentId: leaf.id,
      code: leaf.code,
      name: leaf.name,
      effectiveWeight: leaf.effectiveWeight,
      appliedWeight: 0, // resolved below
      totalRaw,
      totalPossible,
      percentageScore,
      weightedScore: null,
      included,
      assessmentCount: items.length,
      scoredCount,
    };
  });

  // Redistribute the weight of excluded components across the included
  // ones, so a running grade is still expressed out of 100.
  const includedWeight = raw
    .filter((c) => c.included)
    .reduce((sum, c) => sum + c.effectiveWeight, 0);

  const isProvisional = raw.some((c) => !c.included) && includedWeight > 0;

  const components: ComponentResult[] = raw.map((c) => {
    if (!c.included || includedWeight === 0) {
      return { ...c, appliedWeight: 0, weightedScore: null };
    }
    const appliedWeight = (c.effectiveWeight / includedWeight) * 100;
    const weightedScore = ((c.percentageScore as number) * appliedWeight) / 100;
    return { ...c, appliedWeight, weightedScore };
  });

  if (includedWeight === 0) {
    return {
      components,
      initialGrade: null,
      periodGrade: null,
      descriptor: null,
      remark: null,
      passed: null,
      isProvisional: false,
    };
  }

  const initialGradeExact = components.reduce((sum, c) => sum + (c.weightedScore ?? 0), 0);
  const initialGrade = round(initialGradeExact, 2, scheme.roundingMode);
  const periodGrade = transmute(initialGrade, scheme);
  const { label, remark } = describeGrade(periodGrade, scheme);

  return {
    components,
    initialGrade,
    periodGrade,
    descriptor: label,
    remark,
    passed: periodGrade >= scheme.passMark,
    isProvisional,
  };
}

/** Aggregates period grades into a final subject grade. */
export function computeFinal(
  periodGrades: Array<number | null>,
  scheme: Pick<GradingScheme, 'roundingMode' | 'decimalPlaces' | 'passMark' | 'descriptors'>,
  weights?: number[],
): { finalGrade: number | null; descriptor: string | null; passed: boolean | null } {
  const present = periodGrades
    .map((g, i) => ({ g, w: weights?.[i] ?? 1 }))
    .filter((x): x is { g: number; w: number } => x.g != null);

  if (present.length === 0) {
    return { finalGrade: null, descriptor: null, passed: null };
  }

  const totalWeight = present.reduce((s, x) => s + x.w, 0);
  const weighted = present.reduce((s, x) => s + x.g * x.w, 0) / totalWeight;
  const finalGrade = round(weighted, scheme.decimalPlaces, scheme.roundingMode);
  const { label } = describeGrade(finalGrade, scheme);

  return { finalGrade, descriptor: label, passed: finalGrade >= scheme.passMark };
}
