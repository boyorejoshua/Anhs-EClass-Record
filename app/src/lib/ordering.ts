/**
 * Grade level, then section — one ordering, used everywhere.
 *
 * The complaint this answers was the most repeated one in the 2026-09-04
 * role walkthrough: nine screens listed classes and learners in orders
 * that disagreed with each other, and none of them matched how a school
 * actually thinks about its roll — Grade 7 first, Grade 12 last, and the
 * sections in order inside each grade.
 *
 * ## Why the label is the input, and not `grade_levels.ordinal`
 *
 * The database has the right answer already: `grade_levels.ordinal`,
 * integers 7…12, and the setup-options contracts order by it correctly.
 * But the row types these screens actually receive — `ClassSummary`,
 * `DirectoryStudent`, `SubmissionRow`, the sections payload — carry only
 * `gradeLevel: string`, the human label. The ordinal is fetched and then
 * dropped on the way to the screen.
 *
 * That is AGENTS.md rule 8's named failure mode, and threading the
 * ordinal through every one of those contracts is a migration touching
 * several `rds.*` functions. This change is presentation-only, so it
 * reads the number out of the label instead — and `rank()` is written so
 * that an explicit ordinal can be handed to it later without any caller
 * changing. When those contracts do start carrying `gradeLevelOrdinal`,
 * pass it and delete nothing.
 *
 * ## Why not just localeCompare
 *
 * `'Grade 10' < 'Grade 7'` lexically, which is exactly the bug reported.
 * `localeCompare(…, { numeric: true })` would in fact get these two
 * right, and it is used below as the fallback for labels with no number
 * in them at all. It is not the primary path because it is a collation
 * accident rather than a statement of intent: it would also happily
 * order 'Grade 7' before 'Kinder', and a reader cannot tell from the
 * call site whether that was considered.
 *
 * ## Sorting, not grouping
 *
 * The walkthrough asked for "sort/group". This sorts and does not group,
 * deliberately: there is no grouped-list pattern anywhere in this
 * codebase to match — every list is a flat table or a flat run of cards,
 * and the only sectioning device that exists is the class workspace's
 * tab seam, which is not a list. Adding grade-level headings to six
 * screens would be inventing a visual pattern, which is a design
 * decision rather than an ordering one. Order fixes the reported
 * complaint on its own; if headings are wanted later they are a
 * deliberate pass over these same call sites.
 */

/** A label with no number in it sorts after every numbered grade. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * The number a grade label sorts by. `'Grade 10'` → 10.
 *
 * Takes the FIRST run of digits, so 'Grade 10' and 'G10' and
 * 'Grade 10 - Diamond' all rank 10. A label carrying no digits at all
 * ranks last and falls back to a name comparison, which keeps
 * non-numbered levels ('Kinder', 'Nursery') in a stable, readable order
 * rather than scattering them.
 */
export function gradeLevelRank(label: string | null | undefined): number {
  if (!label) return UNRANKED;
  const digits = /\d+/.exec(label);
  if (!digits) return UNRANKED;
  const n = Number.parseInt(digits[0], 10);
  return Number.isFinite(n) ? n : UNRANKED;
}

/** Names, sections and anything else compared as text a human reads. */
function compareText(a: string | null | undefined, b: string | null | undefined): number {
  // A missing section sorts after a present one: "not assigned yet" is
  // the tail of a roll, not the head of it.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  // `numeric` so 'Section 2' precedes 'Section 10'. Section names here
  // are usually words (Pearl, Ruby), but a school numbering them should
  // not be punished for it.
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** What any orderable row has to be able to tell us. */
export interface GradeSectionKey {
  /** The label, e.g. 'Grade 10'. */
  gradeLevel?: string | null;
  /** Preferred when present — see the header note. */
  gradeLevelOrdinal?: number | null;
  section?: string | null;
  /** Last resort so the order is total and therefore stable. */
  tiebreak?: string | null;
}

/**
 * Grade level, then section, then the caller's tiebreak.
 *
 * Total by construction: two rows only compare equal when all three
 * parts do, so `Array.prototype.sort` cannot reorder them run to run.
 */
export function compareGradeThenSection(a: GradeSectionKey, b: GradeSectionKey): number {
  const ra = a.gradeLevelOrdinal ?? gradeLevelRank(a.gradeLevel);
  const rb = b.gradeLevelOrdinal ?? gradeLevelRank(b.gradeLevel);
  if (ra !== rb) return ra - rb;

  // Same rank and both unranked means neither carried a number; compare
  // the labels so 'Kinder' and 'Nursery' still have a defined order.
  if (ra === UNRANKED) {
    const byLabel = compareText(a.gradeLevel, b.gradeLevel);
    if (byLabel !== 0) return byLabel;
  }

  const bySection = compareText(a.section, b.section);
  if (bySection !== 0) return bySection;

  return compareText(a.tiebreak, b.tiebreak);
}

/**
 * Sort a copy. Never sorts in place — several of these lists are props,
 * and mutating a prop array is how a render order starts depending on
 * how many times a component happened to render.
 */
export function sortByGradeThenSection<T>(
  rows: readonly T[],
  key: (row: T) => GradeSectionKey,
): T[] {
  return [...rows].sort((a, b) => compareGradeThenSection(key(a), key(b)));
}
