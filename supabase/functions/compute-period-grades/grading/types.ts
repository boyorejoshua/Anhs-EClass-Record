// GENERATED — DO NOT EDIT.
// Verbatim copy of app/src/lib/grading/types.ts, produced by
// scripts/vendor-grading-engine.mjs. The only change is that relative
// import specifiers carry the .ts extension Deno requires. Edit the
// canonical file and re-run the script; edits here are overwritten and
// fail `npm run engine:check`.

/**
 * Grading engine types.
 *
 * Everything here is DATA loaded from the database, never a constant.
 * V0 hard-codes `const W = {ww:0.30, pt:0.50, te:0.20}` at main.js:289,
 * which DepEd Order 015 s.2026 superseded in June 2026 — and which
 * changes again in SY 2027-2028 when zero-based grading replaces
 * transmutation. Both changes are configuration here.
 */

export type RoundingMode = 'half_up' | 'half_even' | 'truncate';

/**
 * A node in the component tree.
 *
 * `parentId` is what lets Examinations hold ST1 / ST2 / TE as weighted
 * children — the structure DO 015 requires and V0 cannot express.
 *
 *   WW  20            (of the grade)
 *   PT  50
 *   EX  30
 *    ├─ ST1 30        (of EX  →  9 of the grade)
 *    ├─ ST2 30        (       →  9)
 *    └─ TE  40        (       → 12)
 */
export interface GradeComponent {
  id: string;
  code: string;
  name: string;
  /** Percentage of the PARENT level, not of the whole grade. */
  weight: number;
  parentId: string | null;
  ordinal: number;
}

export interface TransmutationBand {
  minInitial: number;
  maxInitial: number;
  outputGrade: number;
}

export interface DescriptorBand {
  minGrade: number;
  maxGrade: number;
  label: string;
  remark: string | null;
}

export interface GradingScheme {
  id: string;
  name: string;
  components: GradeComponent[];
  passMark: number;
  roundingMode: RoundingMode;
  decimalPlaces: number;
  /** NULL means direct rounding — i.e. zero-based grading, SY 2027-2028+. */
  transmutation: TransmutationBand[] | null;
  descriptors: DescriptorBand[];
}

export interface Assessment {
  id: string;
  componentId: string;
  ordinal: number;
  title: string | null;
  highestPossibleScore: number;
}

export interface Score {
  assessmentId: string;
  /** null = not yet entered. Distinct from a zero. */
  raw: number | null;
  isExcused: boolean;
}

export interface ComponentResult {
  componentId: string;
  code: string;
  name: string;
  /** Weight of the whole grade, after flattening the tree. */
  effectiveWeight: number;
  /** Weight actually applied, after redistribution of excluded components. */
  appliedWeight: number;
  totalRaw: number;
  totalPossible: number;
  /** Percentage score, 0-100. Null when the component is excluded. */
  percentageScore: number | null;
  /** Weighted score = PS x appliedWeight / 100. */
  weightedScore: number | null;
  /** False when nothing has been scored yet, in running mode. */
  included: boolean;
  assessmentCount: number;
  scoredCount: number;
}

export interface GradeResult {
  components: ComponentResult[];
  /** Sum of weighted scores, before transmutation. Null when nothing scored. */
  initialGrade: number | null;
  /** After transmutation, or direct rounding when there is no table. */
  periodGrade: number | null;
  descriptor: string | null;
  remark: string | null;
  passed: boolean | null;
  /** True when some component had no scores and its weight was redistributed. */
  isProvisional: boolean;
}

export interface ComputeOptions {
  /**
   * false (default) — RUNNING grade. An assessment with no score is
   *   excluded from both numerator and denominator, and a component with
   *   no scores at all is dropped with its weight redistributed. This is
   *   what the gradebook shows while a term is in progress.
   *
   * true — FINAL grade. An unscored assessment counts as zero. This is
   *   what runs at submission and finalization.
   *
   * V0 does neither cleanly: it treats a missing COMPONENT as zero
   * (main.js:301), so a term graded before the exam exists reads
   * artificially low.
   */
  includeUnscored?: boolean;
}
