/**
 * LOA — Learning Outcomes Assessment Summary Reports.
 *
 * Built to the school's own workbook, `CLASSRECORD_Template.xlsx`, sheet
 * "LOA Summary Reports". Not to the legacy JavaScript, which had a
 * narrower version of the same idea, and not to a guess.
 *
 * ── WHAT THE REPORT IS ────────────────────────────────────────────────
 * Five tables. Each has one row PER SECTION — not per learner — so a
 * teacher carrying four sections of Grade 7 English files one sheet
 * covering all four, and the department coordinator reads down the
 * column to see which section is behind.
 *
 *   1  Pre-test / diagnostic          proficiency bands
 *   2  Written Works                  proficiency bands
 *   3  Performance Tasks              descriptor bands  (from % score)
 *   4  Quarterly Assessment           proficiency bands
 *   5  Quarterly Grades               descriptor bands  (from transmuted grade)
 *
 * ── WHY TWO BAND SCALES ───────────────────────────────────────────────
 * The template uses one scale for raw assessment performance and another
 * for grade-shaped quantities, and they are genuinely different
 * instruments: proficiency runs 0–100 in five wide bands and answers
 * "how much of this did the class actually learn"; the descriptor scale
 * is the DepEd report-card wording and only resolves above 75, because
 * below that there is one answer.
 *
 * Which section uses which is DATA, in SECTION_SCALES below — not an
 * `if (code === 'PT')` buried in a loop. A school whose template differs
 * changes the table.
 *
 * ⚠️ Verify before filing. This template came from the school and its
 * currency is unconfirmed; see docs/18-assumptions-register.md.
 */
import { compute, flattenComponents } from './grading';
import type { GradebookData } from '../data/types';
import type { GradeComponent, GradingScheme } from './grading';

/* ==================================================================== *
 * BANDS
 * ==================================================================== */

export interface Band {
  key: string;
  label: string;
  /** Printed under the label, exactly as the workbook prints it. */
  range: string;
  /** Inclusive lower bound, as a percentage. */
  min: number;
  /** EXCLUSIVE upper bound, except on the last band. Matches the
   *  workbook's COUNTIFS, which use `<` on every boundary but the top. */
  max: number;
}

/**
 * Five bands. Workbook rows 4, 23, 62 — and the COUNTIFS beneath them
 * compare a raw score against fractions of the item count, which is the
 * same thing as banding the percentage.
 */
export const PROFICIENCY: Band[] = [
  { key: 'np',  label: 'Not Proficient',    range: '0% – 24%',   min: 0,  max: 25 },
  { key: 'lp',  label: 'Low Proficient',    range: '25% – 49%',  min: 25, max: 50 },
  { key: 'nrp', label: 'Nearly Proficient', range: '50% – 74%',  min: 50, max: 75 },
  { key: 'p',   label: 'Proficient',        range: '75% – 89%',  min: 75, max: 90 },
  { key: 'hp',  label: 'Highly Proficient', range: '90% – 100%', min: 90, max: 100 },
];

/**
 * Seven bands. Workbook rows 42–44 and 81–83. Note that Outstanding
 * spans three of them: the workbook splits 90–100 into 90–94, 95–97 and
 * 98–100 while keeping one heading across all three.
 */
export const DESCRIPTORS: Band[] = [
  { key: 'dnme', label: 'Did Not Meet Expectations', range: '74% & below', min: 0,  max: 75 },
  { key: 'fs',   label: 'Fairly Satisfactory',       range: '75% – 79%',   min: 75, max: 80 },
  { key: 's',    label: 'Satisfactory',              range: '80% – 84%',   min: 80, max: 85 },
  { key: 'vs',   label: 'Very Satisfactory',         range: '85% – 89%',   min: 85, max: 90 },
  { key: 'o1',   label: 'Outstanding',               range: '90% – 94%',   min: 90, max: 95 },
  { key: 'o2',   label: 'Outstanding',               range: '95% – 97%',   min: 95, max: 98 },
  { key: 'o3',   label: 'Outstanding',               range: '98% – 100%',  min: 98, max: 100 },
];

/** Half-open on every boundary but the top, exactly as the COUNTIFS are. */
export function bandOf(value: number, bands: Band[]): Band | null {
  for (const b of bands) {
    const last = b === bands[bands.length - 1];
    if (value >= b.min && (last ? value <= b.max : value < b.max)) return b;
  }
  return null;
}

/* ==================================================================== *
 * WHICH SCALE EACH SECTION USES
 * ==================================================================== */

export type Scale = 'proficiency' | 'descriptor';

/**
 * Keyed by component CODE, because that is what a scheme carries. A code
 * the table does not name falls back to proficiency — the wider, more
 * neutral instrument — rather than silently picking the report-card
 * wording for something that is not a grade.
 */
export const SECTION_SCALES: Record<string, Scale> = {
  WW: 'proficiency',   // Written Works        — workbook row 20
  PT: 'descriptor',    // Performance Tasks    — workbook row 39, "(from Percentage Score)"
  EX: 'proficiency',   // Quarterly Assessment — workbook row 59
  QA: 'proficiency',   // same, under its older code
};

export function scaleFor(code: string): Scale {
  return SECTION_SCALES[code.toUpperCase()] ?? 'proficiency';
}

/* ==================================================================== *
 * THE REPORT
 * ==================================================================== */

export interface BandCount {
  band: Band;
  count: number;
  /** Of the section's learners. */
  percent: number;
}

/** One row of one table: a single class section's figures. */
export interface LoaRow {
  classId: string;
  /** "Grade 10 – Pearl", as the workbook's `C2 & " - " & D2` produces. */
  label: string;
  learners: number;
  /**
   * Total possible — the workbook's "No. of Items" for an assessment
   * section and "HPS" for Written Works. Null on a descriptor section,
   * which the workbook does not give one.
   */
  highestPossible: number | null;
  /** Highest Score Obtained. Raw, not a percentage. */
  hso: number | null;
  /** Lowest Score Obtained. */
  lso: number | null;
  /** Mean raw score. */
  mean: number | null;
  /** Mean Percentage Score = mean ÷ highestPossible × 100. */
  mps: number | null;
  counts: BandCount[];
  /**
   * The workbook's "TOTAL (to check entries)": banded learners as a
   * percentage of the section's learners. Anything but 100 means a
   * learner fell through, which is why the column exists.
   */
  total: number;
}

export interface LoaTable {
  key: string;
  /** The workbook's heading, e.g. "SUMMARY OF WRITTEN WORKS PER SECTION". */
  title: string;
  scale: Scale;
  bands: Band[];
  /** "No. of Items" or "HPS"; null on a descriptor table. */
  measureLabel: string | null;
  rows: LoaRow[];
  totals: LoaRow;
}

export interface LoaReport {
  tables: LoaTable[];
  /** How many class sections the report covers. */
  sections: number;
  learners: number;
}

/** One section's gradebook, as the report needs it. */
export interface CohortSection {
  classId: string;
  label: string;
  data: GradebookData;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bands a list of percentages and computes the row's statistics.
 *
 * `raws` and `percents` are parallel: the statistics columns are about
 * RAW marks (a teacher recognises "38 out of 50"), while the banding is
 * about percentages. The workbook does the same thing — its COUNTIFS
 * compare raw scores against fractions of the item count.
 */
function buildRow(
  classId: string, label: string, learners: number,
  highestPossible: number | null,
  raws: number[], percents: number[], bands: Band[],
): LoaRow {
  const counts = bands.map((band) => {
    const count = percents.filter((p) => bandOf(p, bands) === band).length;
    return { band, count, percent: learners > 0 ? round2((count / learners) * 100) : 0 };
  });
  const mean = raws.length > 0 ? round2(raws.reduce((a, b) => a + b, 0) / raws.length) : null;
  return {
    classId, label, learners, highestPossible,
    hso: raws.length > 0 ? Math.max(...raws) : null,
    lso: raws.length > 0 ? Math.min(...raws) : null,
    mean,
    mps: mean != null && highestPossible ? round2((mean / highestPossible) * 100) : null,
    counts,
    total: learners > 0
      ? round2((counts.reduce((n, c) => n + c.count, 0) / learners) * 100)
      : 0,
  };
}

/** The workbook's Total row: SUBTOTAL over the section rows. */
function totalsRow(rows: LoaRow[], bands: Band[]): LoaRow {
  const learners = rows.reduce((n, r) => n + r.learners, 0);
  const hps = rows.map((r) => r.highestPossible).filter((v): v is number => v != null);
  const hso = rows.map((r) => r.hso).filter((v): v is number => v != null);
  const lso = rows.map((r) => r.lso).filter((v): v is number => v != null);
  // Weighted by learners, not a mean of means — four sections of
  // different sizes do not contribute equally to the cohort's average.
  const weighted = rows.filter((r) => r.mean != null && r.learners > 0);
  const mean = weighted.length > 0
    ? round2(weighted.reduce((n, r) => n + r.mean! * r.learners, 0)
             / weighted.reduce((n, r) => n + r.learners, 0))
    : null;
  const highestPossible = hps.length > 0 ? round2(hps.reduce((a, b) => a + b, 0) / hps.length) : null;

  const counts = bands.map((band, i) => {
    const count = rows.reduce((n, r) => n + (r.counts[i]?.count ?? 0), 0);
    return { band, count, percent: learners > 0 ? round2((count / learners) * 100) : 0 };
  });

  return {
    classId: '', label: 'Total', learners, highestPossible,
    hso: hso.length > 0 ? Math.max(...hso) : null,
    lso: lso.length > 0 ? Math.min(...lso) : null,
    mean,
    mps: mean != null && highestPossible ? round2((mean / highestPossible) * 100) : null,
    counts,
    total: learners > 0
      ? round2((counts.reduce((n, c) => n + c.count, 0) / learners) * 100)
      : 0,
  };
}

/** Top-level components, in the order the scheme declares them. */
function topLevel(scheme: GradingScheme): GradeComponent[] {
  return scheme.components
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * Builds the whole report across every section in the cohort.
 *
 * One table per top-level component, plus the period-grade table the
 * workbook calls "SUMMARY OF QUARTERLY GRADES (from Transmuted Grade)".
 * There is no pre-test table: a diagnostic sits outside the grading
 * scheme, and inventing one from a component would put a number under a
 * heading that does not describe it.
 */
export function loaReport(cohort: CohortSection[], periodName: string): LoaReport {
  const first = cohort[0];
  if (!first) return { tables: [], sections: 0, learners: 0 };

  const scheme = first.data.scheme;
  const parents = topLevel(scheme);
  const leaves = flattenComponents(scheme.components);

  // leaf -> top-level ancestor, so a scheme with Exams → ST1/ST2/TE
  // reports at the parent, which is the line the form carries.
  const rollup = new Map<string, string>();
  for (const leaf of leaves) {
    let node: GradeComponent | undefined = scheme.components.find((c) => c.id === leaf.id);
    while (node?.parentId) node = scheme.components.find((c) => c.id === node!.parentId);
    if (node) rollup.set(leaf.id, node.id);
  }

  const tables: LoaTable[] = parents.map((parent) => {
    const scale = scaleFor(parent.code);
    const bands = scale === 'proficiency' ? PROFICIENCY : DESCRIPTORS;

    const rows = cohort.map((section) => {
      const raws: number[] = [];
      const percents: number[] = [];
      let hps: number | null = null;

      for (const learner of section.data.roster) {
        const cells = section.data.scores[learner.classEnrollmentId] ?? {};
        const result = compute(
          section.data.scheme,
          section.data.assessments,
          section.data.assessments.map((a) => ({
            assessmentId: a.id,
            raw: cells[a.id]?.raw ?? null,
            isExcused: cells[a.id]?.isExcused ?? false,
          })),
        );
        const own = result.components.filter((c) => rollup.get(c.componentId) === parent.id);
        const totalRaw = own.reduce((n, c) => n + c.totalRaw, 0);
        const totalPossible = own.reduce((n, c) => n + c.totalPossible, 0);
        if (totalPossible <= 0) continue;   // nothing scored: not banded, as the workbook does
        raws.push(round2(totalRaw));
        percents.push(round2((totalRaw / totalPossible) * 100));
        hps = Math.max(hps ?? 0, totalPossible);
      }

      return buildRow(
        section.classId, section.label, section.data.roster.length,
        scale === 'proficiency' ? hps : null,
        scale === 'proficiency' ? raws : [], percents, bands,
      );
    });

    return {
      key: parent.code,
      title: `SUMMARY OF ${parent.name.toUpperCase()} PER SECTION`
        + (scale === 'descriptor' ? '  (from Percentage Score)' : ''),
      scale, bands,
      measureLabel: scale === 'proficiency' ? 'HPS' : null,
      rows,
      totals: totalsRow(rows, bands),
    };
  });

  /* The period-grade table. Always descriptor-scaled: it IS the grade. */
  const gradeRows = cohort.map((section) => {
    const percents: number[] = [];
    for (const learner of section.data.roster) {
      const cells = section.data.scores[learner.classEnrollmentId] ?? {};
      const result = compute(
        section.data.scheme,
        section.data.assessments,
        section.data.assessments.map((a) => ({
          assessmentId: a.id,
          raw: cells[a.id]?.raw ?? null,
          isExcused: cells[a.id]?.isExcused ?? false,
        })),
      );
      if (result.periodGrade != null) percents.push(result.periodGrade);
    }
    return buildRow(
      section.classId, section.label, section.data.roster.length,
      null, [], percents, DESCRIPTORS,
    );
  });

  tables.push({
    key: 'grade',
    title: `SUMMARY OF ${periodName.toUpperCase()} GRADES  (from Transmuted Grade)`,
    scale: 'descriptor',
    bands: DESCRIPTORS,
    measureLabel: null,
    rows: gradeRows,
    totals: totalsRow(gradeRows, DESCRIPTORS),
  });

  return {
    tables,
    sections: cohort.length,
    learners: cohort.reduce((n, s) => n + s.data.roster.length, 0),
  };
}
