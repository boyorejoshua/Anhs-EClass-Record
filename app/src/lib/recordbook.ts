/**
 * Record Book computations — Summary, Analytics and LOA.
 *
 * Business rules extracted from the legacy system
 * (boyorejoshua/anhsgradingsystem, assets/js/main.js) and re-expressed
 * against the new architecture. Nothing here is a copy: the legacy code
 * reads a `cd.grades[q][studentName]` object and hard-codes
 * `{ww:.30, pt:.50, qa:.20}`, whereas everything below runs on the
 * configured grading scheme through the shared engine.
 *
 * Three things deliberately NOT carried across:
 *
 *   • **The weights.** Legacy `calcQ` hard-codes 30/50/20, which DO 015
 *     s.2026 superseded (core 20/50/30, MAPEH/EPP-TLE 20/60/20). The
 *     scheme decides.
 *   • **The ten-item cap.** `Array(10).fill(null)` is a UI limit encoded
 *     as a data structure.
 *   • **`qa` as a scalar.** One quarterly assessment cannot express the
 *     ST1 / ST2 / Term Exam split that DO 015 requires.
 *
 * And one thing that IS carried across exactly: the *shape* of the
 * calculation — component percentage score, weighted score, initial
 * grade, transmutation, period grade — which the new engine already
 * implements identically. See docs/grading-calculation-validation.md.
 */
import { compute, flattenComponents } from './grading';
import type { GradingScheme } from './grading';
import type { GradebookData, PersistedGrade } from '../data/types';

/* ------------------------------------------------------------------ *
 * Per-student summary
 * ------------------------------------------------------------------ */

export interface ComponentCell {
  componentId: string;
  code: string;
  name: string;
  weight: number;
  /** Percentage score, 0–100. Null when the component has nothing scored. */
  percentageScore: number | null;
  weightedScore: number | null;
  scored: number;
  total: number;
}

export interface SummaryRow {
  classEnrollmentId: string;
  studentId: string;
  displayName: string;
  components: ComponentCell[];
  initialGrade: number | null;
  periodGrade: number | null;
  descriptor: string | null;
  remark: string | null;
  passed: boolean | null;
  missingCount: number;
  /** True when this learner has no score at all in the period. */
  untouched: boolean;
}

/** Two decimals, which is what every figure on these screens carries. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * One row per learner: the legacy Grade Summary table, computed from the
 * scheme rather than from three fixed columns.
 *
 * Top-level components only. A scheme with a component tree (Exams →
 * ST1/ST2/TE) is summarised at the parent, because that is the line the
 * DepEd form carries — the children remain visible in the gradebook and
 * in Student Detail.
 */
export function summaryRows(data: GradebookData): SummaryRow[] {
  const { scheme, assessments, roster, scores } = data;
  const parents = scheme.components
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.ordinal - b.ordinal);
  const leaves = flattenComponents(scheme.components);

  // leaf -> the top-level ancestor it rolls up into
  const rollup = new Map<string, string>();
  for (const leaf of leaves) {
    let node = scheme.components.find((c) => c.id === leaf.id);
    while (node?.parentId) node = scheme.components.find((c) => c.id === node!.parentId);
    rollup.set(leaf.id, node?.id ?? leaf.id);
  }

  return roster.map((s) => {
    const row = scores[s.classEnrollmentId] ?? {};
    const scoreList = assessments.map((a) => ({
      assessmentId: a.id,
      raw: row[a.id]?.raw ?? null,
      isExcused: row[a.id]?.isExcused ?? false,
    }));
    const result = compute(scheme, assessments, scoreList);

    const components: ComponentCell[] = parents.map((parent) => {
      // Sum the engine's leaf results back up to the parent line.
      const own = result.components.filter((c) => rollup.get(c.componentId) === parent.id);
      const totalRaw = own.reduce((n, c) => n + c.totalRaw, 0);
      const totalPossible = own.reduce((n, c) => n + c.totalPossible, 0);
      const weighted = own.reduce<number | null>(
        (n, c) => (c.weightedScore == null ? n : (n ?? 0) + c.weightedScore), null);
      return {
        componentId: parent.id,
        code: parent.code,
        name: parent.name,
        weight: parent.weight,
        percentageScore: totalPossible > 0 && own.some((c) => c.included)
          ? round2((totalRaw / totalPossible) * 100)
          : null,
        weightedScore: weighted == null ? null : round2(weighted),
        scored: own.reduce((n, c) => n + c.scoredCount, 0),
        total: own.reduce((n, c) => n + c.assessmentCount, 0),
      };
    });

    let missing = 0;
    for (const a of assessments) {
      const cell = row[a.id];
      if (!cell || (cell.raw == null && !cell.isExcused)) missing += 1;
    }

    const band = result.periodGrade == null ? null
      : scheme.descriptors.find(
          (d) => result.periodGrade! >= d.minGrade && result.periodGrade! <= d.maxGrade) ?? null;

    return {
      classEnrollmentId: s.classEnrollmentId,
      studentId: s.studentId,
      displayName: s.displayName,
      components,
      initialGrade: result.initialGrade,
      periodGrade: result.periodGrade,
      descriptor: band?.label ?? null,
      remark: band?.remark ?? null,
      passed: result.periodGrade == null ? null : result.periodGrade >= scheme.passMark,
      missingCount: missing,
      untouched: missing === assessments.length && assessments.length > 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

export interface DistributionBand {
  label: string;
  min: number;
  max: number;
  count: number;
  names: string[];
}

export interface Analytics {
  classSize: number;
  graded: number;
  /** Learners with no computable grade yet. */
  ungraded: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passing: number;
  failing: number;
  missingScores: number;
  /** Percentage of score cells filled, 0–100. */
  completion: number;
  distribution: DistributionBand[];
  /** Mean percentage score per top-level component. */
  componentAverages: Array<{ code: string; name: string; average: number | null }>;
  /** Below the pass mark, or with gaps — the intervention list. */
  needsAttention: Array<{ name: string; grade: number | null; missing: number; reason: string }>;
}

/**
 * Grade distribution bands.
 *
 * Transcribed from the legacy Analytics module, which uses
 * 96–100 / 91–95 / 86–90 / 81–85 / 76–80 / 75 / below 75. The single-value
 * "75" band is not a rounding artefact — 75 is the pass mark, and a
 * teacher wants to see who is sitting exactly on it.
 *
 * ⚠️ These are the LEGACY system's reporting bands, not a DepEd mandate
 * found in either repository. A school that groups differently needs
 * this configurable. Recorded in the assumptions register.
 */
const DISTRIBUTION: Array<[string, number, number]> = [
  ['96–100', 96, 100],
  ['91–95', 91, 95],
  ['86–90', 86, 90],
  ['81–85', 81, 85],
  ['76–80', 76, 80],
  ['75', 75, 75],
  ['Below 75', 0, 74],
];

export function analytics(rows: SummaryRow[], scheme: GradingScheme, assessmentCount: number): Analytics {
  const graded = rows.filter((r) => r.periodGrade != null);
  const grades = graded.map((r) => r.periodGrade!);

  const parents = scheme.components
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.ordinal - b.ordinal);

  const componentAverages = parents.map((p) => {
    const vals = rows
      .map((r) => r.components.find((c) => c.componentId === p.id)?.percentageScore)
      .filter((v): v is number => v != null);
    return {
      code: p.code,
      name: p.name,
      average: vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    };
  });

  const missingScores = rows.reduce((n, r) => n + r.missingCount, 0);
  const cells = rows.length * assessmentCount;

  const needsAttention = rows
    .filter((r) => (r.periodGrade != null && r.periodGrade < scheme.passMark) || r.missingCount > 0)
    .map((r) => ({
      name: r.displayName,
      grade: r.periodGrade,
      missing: r.missingCount,
      reason: r.periodGrade != null && r.periodGrade < scheme.passMark
        ? `Below the pass mark of ${scheme.passMark}`
        : r.untouched ? 'No scores entered at all'
        : `${r.missingCount} missing score${r.missingCount === 1 ? '' : 's'}`,
    }))
    .sort((a, b) => (a.grade ?? 999) - (b.grade ?? 999));

  return {
    classSize: rows.length,
    graded: graded.length,
    ungraded: rows.length - graded.length,
    average: grades.length ? round2(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
    highest: grades.length ? Math.max(...grades) : null,
    lowest: grades.length ? Math.min(...grades) : null,
    passing: grades.filter((g) => g >= scheme.passMark).length,
    failing: grades.filter((g) => g < scheme.passMark).length,
    missingScores,
    completion: cells > 0 ? Math.round(((cells - missingScores) / cells) * 100) : 0,
    distribution: DISTRIBUTION.map(([label, min, max]) => {
      const names = graded.filter((r) => r.periodGrade! >= min && r.periodGrade! <= max)
        .map((r) => r.displayName);
      return { label, min, max, count: names.length, names };
    }),
    componentAverages,
    needsAttention,
  };
}

/* ==================================================================== *
 * RECORDED vs. LIVE
 *
 * Everything above computes from the scores currently in the browser.
 * That is the right thing for a term in progress — a teacher typing a
 * mark wants the total to move.
 *
 * Once a period has been submitted, though, there is a second, higher
 * authority: the grade the server computed and wrote to `period_grades`.
 * That is the number the registrar reviews and the learner eventually
 * sees, and it does not change when someone reopens the gradebook.
 *
 * The two can legitimately differ, for a reason that is not an error:
 * the tabs above use RUNNING mode, where an unscored assessment is
 * skipped, while the recorded grade used FINAL mode, where it is a zero.
 * Comparing those two directly would flag every mid-term class as
 * broken.
 *
 * So the comparison recomputes in FINAL mode — the same mode the server
 * used — and a difference then means something real: the scores or the
 * scheme changed after the grade was recorded, and what the registrar is
 * looking at is stale.
 * ==================================================================== */

export interface RecordedComparison {
  classEnrollmentId: string;
  displayName: string;
  /** What the server stored, or null if this learner has no recorded grade. */
  recorded: PersistedGrade | null;
  /** Today's scores, recomputed in the same FINAL mode the server used. */
  recomputed: number | null;
  /** A grade was recorded, and today's scores no longer produce it. */
  stale: boolean;
}

export interface RecordedSummary {
  rows: RecordedComparison[];
  /** How many learners have a grade on file. */
  recordedCount: number;
  /** How many of those no longer match the current scores. */
  staleCount: number;
  /** When the grades were computed, if they all came from one run. */
  computedAt: string | null;
  /** True once every learner in the roster has a recorded grade. */
  complete: boolean;
  /**
   * True when the filed grade differs from the running grade the rest of
   * the screen shows — because unscored work counts as zero in one and
   * is skipped in the other. Not an error, but it puts two different
   * numbers on the same row, so it has to be explained rather than left
   * for the teacher to discover.
   */
  runningDiffers: boolean;
}

export function reconcileRecorded(
  data: GradebookData,
  recorded: Record<string, PersistedGrade>,
): RecordedSummary {
  const rows: RecordedComparison[] = data.roster.map((s) => {
    const cells = data.scores[s.classEnrollmentId] ?? {};
    const final = compute(
      data.scheme,
      data.assessments,
      data.assessments.map((a) => ({
        assessmentId: a.id,
        raw: cells[a.id]?.raw ?? null,
        isExcused: cells[a.id]?.isExcused ?? false,
      })),
      { includeUnscored: true },
    );
    const stored = recorded[s.classEnrollmentId] ?? null;
    return {
      classEnrollmentId: s.classEnrollmentId,
      displayName: s.displayName,
      recorded: stored,
      recomputed: final.periodGrade,
      stale: stored != null && stored.periodGrade !== final.periodGrade,
    };
  });

  const withGrade = rows.filter((r) => r.recorded != null);
  const stamps = new Set(withGrade.map((r) => r.recorded!.computedAt));

  const running = new Map(summaryRows(data).map((r) => [r.classEnrollmentId, r.periodGrade]));

  return {
    rows,
    recordedCount: withGrade.length,
    staleCount: rows.filter((r) => r.stale).length,
    runningDiffers: withGrade.some(
      (r) => running.get(r.classEnrollmentId) !== r.recorded!.periodGrade,
    ),
    // Several distinct timestamps means the grades came from more than
    // one run, so no single "computed at" is honest.
    computedAt: stamps.size === 1 ? [...stamps][0]! : null,
    complete: withGrade.length === data.roster.length && data.roster.length > 0,
  };
}
