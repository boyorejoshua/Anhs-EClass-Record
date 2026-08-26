import type { ParsedWorkbook } from './three-term';

/* ------------------------------------------------------------------ *
 * Counting what is in a workbook
 *
 * These live here rather than beside the parser because the parser
 * imports SheetJS, and SheetJS is 363 kB. Anything a screen needs
 * during RENDER must be reachable without dragging a spreadsheet
 * parser into the entry chunk with it.
 * ------------------------------------------------------------------ */

export function hasBlockingIssues(parsed: ParsedWorkbook): boolean {
  return parsed.issues.some((i) => i.severity === 'error');
}

/** How many marks the workbook actually carries, blanks excluded. */
export function markCount(parsed: ParsedWorkbook): number {
  return parsed.terms.reduce(
    (n, t) => n + t.marks.filter((m) => m.score !== null).length, 0);
}

/** How many assessments would be created or matched, across all terms. */
export function assessmentCount(parsed: ParsedWorkbook): number {
  return parsed.terms.reduce(
    (n, t) => n + t.components.reduce((m, c) => m + c.items.length, 0), 0);
}

/* ==================================================================== *
 * FROM A PARSED WORKBOOK TO A PLAN
 *
 * The parser says what is in the file. The server's resolution says
 * what the school already has. This module puts the two together and
 * produces two things:
 *
 *   • a SUMMARY, which is what the preview screen renders;
 *   • a PLAN, which is exactly what `import_commit` executes.
 *
 * Both are pure functions of their inputs, so the preview and the
 * commit cannot disagree: the screen shows a summary OF THE PLAN, not
 * a separate description of what an import might do.
 *
 * Nothing here matches names. Matching happened on the server, where
 * row-level security decides which learners the caller may even see,
 * and a browser-side matcher would be both a second implementation and
 * a way to probe for learners the caller cannot read.
 * ==================================================================== */

/** What the server said about one learner row. Mirrors the contract. */
export interface ResolvedLearner {
  row: number;
  raw: string;
  sex: 'male' | 'female' | null;
  status: 'matched' | 'ambiguous' | 'new';
  candidates: {
    studentId: string;
    enrollmentId: string;
    displayName: string;
    lrn: string | null;
    studentNumber: string | null;
  }[];
}

export interface ResolvedComponent {
  key: 'WW' | 'PT' | 'EX';
  /** Present for ST1 / ST2 / TE; null for the parent band itself. */
  itemCode: string | null;
  componentId: string | null;
  weight: number | null;
  status: 'matched' | 'missing';
}

export interface ResolvedAssessment {
  termOrdinal: number;
  componentKey: 'WW' | 'PT' | 'EX';
  itemCode: string;
  ordinal: number;
  newHps: number;
  assessmentId: string | null;
  currentHps: number | null;
  status: 'unchanged' | 'hpsChanged' | 'willCreate';
}

export interface ResolvedPeriod {
  ordinal: number;
  periodId: string;
  name: string;
  editable: boolean;
}

export interface ImportResolution {
  class: {
    status: 'matched' | 'willCreate' | 'unresolved';
    classId: string | null;
    academicYearId: string | null;
    gradeLevelId: string | null;
    sectionId: string | null;
    subjectId: string | null;
    gradingSchemeId: string | null;
    label: string | null;
    teacher: { userId: string; displayName: string } | null;
  };
  periods: ResolvedPeriod[];
  components: ResolvedComponent[];
  learners: ResolvedLearner[];
  assessments: ResolvedAssessment[];
  permissions: {
    runImport: boolean;
    createClass: boolean;
    createStudent: boolean;
    writeMarks: boolean;
  };
  issues: { severity: 'error' | 'warning'; code: string; message: string; where: string }[];
}

/**
 * What the person decided about one learner row.
 *
 * `skip` is a first-class outcome, not a failure. A workbook row that
 * cannot be resolved is left out of the import entirely — and, because
 * marks are keyed by row, that row's marks go with it rather than
 * landing on somebody else.
 */
export type LearnerChoice =
  | { action: 'link'; enrollmentId: string }
  | { action: 'create' }
  | { action: 'skip' };

export type Choices = Record<number, LearnerChoice>;

/**
 * The defaults the preview opens with.
 *
 *   matched   → link, because one candidate and one name is as close to
 *               certain as this workbook can get. Still shown as
 *               "matched by name", still a warning, still changeable.
 *   ambiguous → SKIP. Never a guess. Two learners with the same name is
 *               precisely the case where picking one silently puts a
 *               term's marks on the wrong child.
 *   new       → create where the account may, skip where it may not.
 */
export function defaultChoices(
  resolution: ImportResolution,
): Choices {
  const out: Choices = {};
  for (const l of resolution.learners) {
    if (l.status === 'matched' && l.candidates[0]) {
      out[l.row] = { action: 'link', enrollmentId: l.candidates[0].enrollmentId };
    } else if (l.status === 'new' && resolution.permissions.createStudent) {
      out[l.row] = { action: 'create' };
    } else {
      out[l.row] = { action: 'skip' };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export interface PlanLearner {
  row: number;
  action: 'link' | 'create' | 'skip';
  enrollmentId?: string;
  student?: {
    firstName: string; lastName: string; sex?: 'male' | 'female';
  };
}

export interface PlanAssessment {
  componentId: string;
  ordinal: number;
  title: null;
  highestPossibleScore: number;
}

export interface PlanMark {
  row: number;
  componentId: string;
  ordinal: number;
  raw: number | null;
}

export interface PlanPeriod {
  periodId: string;
  name: string;
  assessments: PlanAssessment[];
  marks: PlanMark[];
}

export interface ImportPlan {
  fileName: string;
  classId: string | null;
  academicYearId: string | null;
  gradeLevelId: string | null;
  sectionId: string | null;
  subjectId: string | null;
  teacherId: string | null;
  learners: PlanLearner[];
  periods: PlanPeriod[];
}

/**
 * Build the payload `import_commit` executes.
 *
 * Three rules are enforced here rather than left to the server, because
 * the preview must show the same thing the commit will do:
 *
 *   1. A period that is not editable contributes NOTHING. It is not
 *      partially imported and it is not silently overwritten.
 *   2. A component the scheme does not declare contributes nothing —
 *      there is no id to write against, and inventing one would rewrite
 *      the school's grading policy.
 *   3. A skipped learner's marks are dropped with them.
 */
export function buildPlan(
  parsed: ParsedWorkbook,
  resolution: ImportResolution,
  choices: Choices,
): ImportPlan {
  const componentId = new Map<string, string>();
  for (const c of resolution.components) {
    if (c.componentId) componentId.set(c.itemCode ?? c.key, c.componentId);
  }

  const periodByOrdinal = new Map(resolution.periods.map((p) => [p.ordinal, p]));
  const included = new Set(
    Object.entries(choices)
      .filter(([, c]) => c.action !== 'skip')
      .map(([row]) => Number(row)),
  );

  const learners: PlanLearner[] = resolution.learners.map((l) => {
    const choice = choices[l.row] ?? { action: 'skip' as const };
    if (choice.action === 'link') {
      return { row: l.row, action: 'link', enrollmentId: choice.enrollmentId };
    }
    if (choice.action === 'create') {
      const parsedRow = parsed.roster.find((r) => r.row === l.row);
      return {
        row: l.row,
        action: 'create',
        student: {
          lastName: parsedRow?.lastName ?? l.raw,
          firstName: parsedRow?.firstName ?? '',
          ...(l.sex ? { sex: l.sex } : {}),
        },
      };
    }
    return { row: l.row, action: 'skip' };
  });

  const periods: PlanPeriod[] = [];
  for (const term of parsed.terms) {
    const period = periodByOrdinal.get(term.ordinal);
    if (!period || !period.editable) continue;

    const assessments: PlanAssessment[] = [];
    const ordinalOf = new Map<string, number>();

    for (const component of term.components) {
      let ordinal = 0;
      for (const item of component.items) {
        const key = item.childComponentCode ?? component.key;
        const id = componentId.get(key);
        // A child component carries exactly one assessment, so its
        // ordinal is 1; a numbered band counts up. This must match the
        // ordinal the server's resolution reported, or the natural key
        // would point somewhere else.
        const n = item.childComponentCode ? 1 : (ordinal += 1);
        if (!id) continue;
        assessments.push({
          componentId: id, ordinal: n, title: null,
          highestPossibleScore: item.highestPossibleScore,
        });
        ordinalOf.set(`${component.key}:${item.code}`, n);
      }
    }

    const marks: PlanMark[] = [];
    for (const mark of term.marks) {
      if (!included.has(mark.row)) continue;
      const item = term.components
        .find((c) => c.key === mark.componentKey)
        ?.items.find((i) => i.code === mark.itemCode);
      const id = componentId.get(item?.childComponentCode ?? mark.componentKey);
      const ordinal = ordinalOf.get(`${mark.componentKey}:${mark.itemCode}`);
      if (!id || ordinal === undefined) continue;
      marks.push({ row: mark.row, componentId: id, ordinal, raw: mark.score });
    }

    periods.push({ periodId: period.periodId, name: period.name, assessments, marks });
  }

  return {
    fileName: parsed.fileName,
    classId: resolution.class.classId,
    academicYearId: resolution.class.academicYearId,
    gradeLevelId: resolution.class.gradeLevelId,
    sectionId: resolution.class.sectionId,
    subjectId: resolution.class.subjectId,
    teacherId: resolution.class.teacher?.userId ?? null,
    learners,
    periods,
  };
}

/* ------------------------------------------------------------------ *
 * The summary the preview renders
 * ------------------------------------------------------------------ */

export interface PlanSummary {
  classLabel: string;
  classAction: 'update an existing class' | 'create a class' | 'do nothing — the class is unresolved';
  learners: { matched: number; created: number; ambiguous: number; skipped: number };
  assessments: { unchanged: number; changed: number; created: number };
  marks: { total: number; blank: number };
  periods: { name: string; included: boolean; reason?: string }[];
  /** Everything that would stop the import, in the order a person reads. */
  blockers: string[];
  /** Worth knowing, but not a reason to stop. */
  warnings: string[];
}

export function summarise(
  parsed: ParsedWorkbook,
  resolution: ImportResolution,
  choices: Choices,
  plan: ImportPlan,
): PlanSummary {
  const counts = { matched: 0, created: 0, ambiguous: 0, skipped: 0 };
  for (const l of resolution.learners) {
    const choice = choices[l.row]?.action ?? 'skip';
    if (choice === 'link') counts.matched += 1;
    else if (choice === 'create') counts.created += 1;
    else if (l.status === 'ambiguous') counts.ambiguous += 1;
    else counts.skipped += 1;
  }

  const includedPeriods = new Set(plan.periods.map((p) => p.periodId));
  const assessments = { unchanged: 0, changed: 0, created: 0 };
  for (const a of resolution.assessments) {
    const period = resolution.periods.find((p) => p.ordinal === a.termOrdinal);
    if (!period || !includedPeriods.has(period.periodId)) continue;
    if (a.status === 'unchanged') assessments.unchanged += 1;
    else if (a.status === 'hpsChanged') assessments.changed += 1;
    else assessments.created += 1;
  }

  const allMarks = plan.periods.flatMap((p) => p.marks);

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const issue of [...parsed.issues, ...resolution.issues]) {
    (issue.severity === 'error' ? blockers : warnings).push(
      `${issue.message} (${issue.where})`);
  }

  if (!resolution.permissions.runImport) {
    blockers.push('Your account is not permitted to run imports.');
  }
  if (resolution.class.status === 'willCreate' && !resolution.permissions.createClass) {
    blockers.push(
      'This workbook is for a class that does not exist yet, and your account '
      + 'cannot create classes. Ask the registrar to create it, then import again.');
  }
  if (counts.created > 0 && !resolution.permissions.createStudent) {
    blockers.push(
      `${counts.created} learners are not on record and your account cannot `
      + 'create them. Ask the registrar to admit them first.');
  }
  if (plan.periods.length > 0 && !resolution.permissions.writeMarks) {
    blockers.push(
      'Your account cannot record marks, so no term can be imported. It can '
      + 'still set up the class and its roster.');
  }
  for (const c of resolution.components) {
    if (c.status === 'missing') {
      blockers.push(
        `The grading scheme for this subject has no "${c.itemCode ?? c.key}" `
        + 'component, so there is nothing to attach those marks to.');
    }
  }

  if (counts.ambiguous > 0) {
    warnings.push(
      `${counts.ambiguous} names match more than one learner and will be left `
      + 'out until you choose. Their marks are left out with them.');
  }
  if (counts.matched > 0) {
    warnings.push(
      `${counts.matched} learners were matched BY NAME. The workbook carries no `
      + 'LRN or student number, so please check the list before importing.');
  }

  return {
    classLabel: resolution.class.label ?? 'Not resolved',
    classAction:
      resolution.class.status === 'matched' ? 'update an existing class'
        : resolution.class.status === 'willCreate' ? 'create a class'
          : 'do nothing — the class is unresolved',
    learners: counts,
    assessments,
    marks: {
      total: allMarks.length,
      blank: allMarks.filter((m) => m.raw === null).length,
    },
    periods: resolution.periods.map((p) => ({
      name: p.name,
      included: includedPeriods.has(p.periodId),
      reason: p.editable ? undefined
        : 'already submitted — take the record back first',
    })),
    blockers,
    warnings,
  };
}

/** Nothing may be written while this is true. */
export function canCommit(summary: PlanSummary): boolean {
  return summary.blockers.length === 0
    && (summary.learners.matched + summary.learners.created > 0);
}
