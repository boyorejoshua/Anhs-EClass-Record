import * as XLSX from 'xlsx';

/* ==================================================================== *
 * THREE-TERM CLASS RECORD — PARSER
 *
 * Turns a class-record workbook into a plain description of what is in
 * it. Nothing here touches the database, resolves an identity, or
 * decides anything: it reads a file and says what it found, including
 * what it could not make sense of.
 *
 * TWO WORKBOOKS, ONE READER
 *
 * There are two three-term class records in circulation:
 *
 *   OFFICIAL   DepEd's Electronic Class Record, published on the
 *              Learning Standards guide site. Sheets INPUT DATA /
 *              TERM 1-3 / FINAL GRADES / HELPER. Class details are a
 *              vertical label:value list; the roster is two columns
 *              SIDE BY SIDE; grade level and section are separate
 *              fields; the exams band trails six summary columns.
 *
 *   ANTICIPATED  The version schools built while waiting for it, whose
 *              own INPUT!A3 reads "(Waiting for the Official DepEd
 *              Order)". Sheets INPUT / TERM1-3 / SUMMARY OF GRADES.
 *              Horizontal header band; roster in two STACKED blocks;
 *              grade and section in one string; three summary columns.
 *
 * Both are read by the code below, and there is no second reader. Every
 * coordinate that differs is DISCOVERED rather than declared: the band
 * headings are found by their merged ranges, the item and
 * highest-possible-score rows follow from where those merges end, the
 * roster blocks are found by their MALE/FEMALE headings, and every
 * class detail is found by looking for its LABEL and reading rightwards.
 * A school that widens a column or adds a sixth written work still
 * parses. Two hard-coded layouts would have drifted the first time
 * DepEd revised one of them.
 *
 * TWO RULES SHAPE EVERY DECISION
 *
 * ONLY RAW MARKS AND STRUCTURE CROSS THE BOUNDARY. Every grade in the
 * workbook is a formula — Initial Grade, Term Grade, Descriptor, the
 * Total/PS/WS columns, the whole FINAL GRADES sheet. Importing them
 * would put a second source of truth beside the grading engine. They
 * are read only so the preview can RECOMPUTE and compare; see
 * `derived`, which no writer may consume.
 *
 * A BLANK IS NOT A ZERO. A missing score means "not given yet" and must
 * arrive as null. Importing blanks as zeros would silently fail
 * learners who simply have not sat the test.
 * ==================================================================== */

/**
 * Columns that close a component band rather than belonging to it.
 *
 * `Total`, `PS`, `WS` in both workbooks — and in the official one the
 * exams band also carries `WS ST1`, `WS ST2`, `WS TE` before its PS and
 * WS, six trailing columns rather than three. They cannot be excluded
 * by counting back a fixed number, and they cannot be excluded by
 * having no highest possible score, because the official file gives
 * them one (30 / 30 / 40 — the DO 015 exam weights). They are excluded
 * by what they are CALLED, which is the only thing that is stable.
 */
const SUMMARY_COLUMN = /^(total|ps|ws)(\s|$)/i;

export type Sex = 'male' | 'female';

export type LayoutId = 'deped-official' | 'anticipated';

export interface ParsedName {
  /** Exactly as the cell holds it, e.g. `Alvarez, Neitan`. */
  raw: string;
  lastName: string;
  firstName: string;
}

export interface ParsedLearner extends ParsedName {
  /**
   * The TERM-SHEET row this learner's marks are on.
   *
   * It is the join key for everything downstream, and in the official
   * workbook it is NOT the row their name is on: names live on
   * `INPUT DATA` rows 11-60 in two side-by-side columns, while marks
   * live on term rows 18-67 and 69-118. The two are matched by
   * position within a block, which is what the workbook's own
   * `=IF('INPUT DATA'!K11="","",'INPUT DATA'!K11)` does.
   */
  row: number;
  /** Where the NAME was read from, kept so an error can point at it. */
  nameRow: number;
  /** Position within the block, as the workbook numbers it. */
  ordinal: number;
  /** Carried by which block the row is in — there is no sex column. */
  sex: Sex;
}

export interface ParsedItem {
  /** `1`…`5` for numbered items, `ST1`/`ST2`/`TE` for coded ones. */
  code: string;
  /** 0-based sheet column, for reading marks out of learner rows. */
  column: number;
  highestPossibleScore: number;
  /**
   * Set when the item's code is a name rather than an ordinal. DO 015
   * splits the exam component into ST1/ST2/TE, which are child
   * components each holding one assessment — `parent_component_id` in
   * the schema, and the reason the engine carries a component tree.
   */
  childComponentCode: string | null;
}

export type ComponentKey = 'WW' | 'PT' | 'EX';

export interface ParsedComponent {
  key: ComponentKey;
  /** The band label as written, e.g. `WRITTEN / ORAL WORKS (WWs)`. */
  label: string;
  /** From the WS column of the highest-possible-score row. */
  weight: number | null;
  firstColumn: number;
  lastColumn: number;
  items: ParsedItem[];
}

export interface ParsedMark {
  row: number;
  componentKey: ComponentKey;
  itemCode: string;
  /** null means no score was given. It does NOT mean zero. */
  score: number | null;
}

/**
 * The workbook's own computed grades, read for comparison only.
 *
 * The preview recomputes each learner through the canonical engine and
 * shows where the two disagree, because a disagreement means the
 * mapping is wrong and should be fixed before anything is written.
 * Nothing downstream of the preview may persist these.
 */
export interface WorkbookDerived {
  row: number;
  initialGrade: number | null;
  termGrade: number | null;
  descriptor: string | null;
}

export interface ParsedTerm {
  sheetName: string;
  /** 1, 2, 3 — from the sheet name. */
  ordinal: number;
  components: ParsedComponent[];
  marks: ParsedMark[];
  derived: WorkbookDerived[];
}

export interface ClassIdentity {
  region: string | null;
  division: string | null;
  schoolName: string | null;
  /** The government school ID — a stable key, unlike the name. */
  govtSchoolId: string | null;
  schoolYear: string | null;
  schoolHead: string | null;
  /** The raw combined string, when the workbook has one. */
  gradeAndSection: string | null;
  gradeLevelText: string | null;
  sectionText: string | null;
  teacherName: string | null;
  subjectText: string | null;
}

export interface ParseIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Sheet, or `SHEET!CELL`, so the user can go and look. */
  where: string;
}

export interface ParsedWorkbook {
  fileName: string;
  sheetNames: string[];
  /** Which of the two class records this is. */
  layout: LayoutId;
  identity: ClassIdentity;
  roster: ParsedLearner[];
  terms: ParsedTerm[];
  issues: ParseIssue[];
}

/** Thrown when the file is not a class record at all. */
export class WorkbookShapeError extends Error {
  readonly issues: ParseIssue[];
  constructor(message: string, issues: ParseIssue[] = []) {
    super(message);
    this.name = 'WorkbookShapeError';
    this.issues = issues;
  }
}

/* ------------------------------------------------------------------ *
 * Cell access
 * ------------------------------------------------------------------ */

type Sheet = XLSX.WorkSheet;

/** The cached value of a cell, never its formula. */
function cell(sheet: Sheet, row: number, col: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: row - 1, c: col })] as XLSX.CellObject | undefined;
}

function text(sheet: Sheet, row: number, col: number): string | null {
  const c = cell(sheet, row, col);
  if (!c || c.v === undefined || c.v === null) return null;
  const s = String(c.v).trim();
  return s === '' ? null : s;
}

/**
 * A number, or null for a blank.
 *
 * A cell holding text that happens to look like a number is accepted —
 * a teacher typing `12 ` into a score cell means twelve — but anything
 * that is not a number at all returns undefined so the caller can raise
 * it rather than quietly dropping a mark.
 */
function num(sheet: Sheet, row: number, col: number): number | null | undefined {
  const c = cell(sheet, row, col);
  if (!c || c.v === undefined || c.v === null || c.v === '') return null;
  if (typeof c.v === 'number') return Number.isFinite(c.v) ? c.v : undefined;
  const parsed = Number(String(c.v).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ref(sheetName: string, row: number, col: number): string {
  return `${sheetName}!${XLSX.utils.encode_cell({ r: row - 1, c: col })}`;
}

function normalise(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function bounds(sheet: Sheet): { rows: number; cols: number } {
  const r = sheet['!ref'];
  if (!r) return { rows: 0, cols: 0 };
  const range = XLSX.utils.decode_range(r);
  return { rows: range.e.r + 1, cols: range.e.c };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function parseThreeTermWorkbook(
  data: ArrayBuffer | Uint8Array,
  fileName = 'workbook.xlsx',
): ParsedWorkbook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let book: XLSX.WorkBook;
  try {
    // `cellFormula: false` keeps cached values only. Nothing in this
    // parser should ever see an `=` — see the header note.
    book = XLSX.read(bytes, { type: 'array', cellFormula: false, cellText: false });
  } catch (err) {
    throw new WorkbookShapeError(
      `This file could not be opened as a spreadsheet: ${
        err instanceof Error ? err.message : String(err)}`,
    );
  }

  const issues: ParseIssue[] = [];

  const inputName = book.SheetNames.find(
    (n) => normalise(n) === 'input data' || normalise(n) === 'input');
  const input = inputName ? (book.Sheets[inputName] as Sheet) : null;

  const termSheets = book.SheetNames
    .map((name) => ({ name, ordinal: termOrdinal(name) }))
    .filter((t): t is { name: string; ordinal: number } => t.ordinal !== null)
    .sort((a, b) => a.ordinal - b.ordinal);

  if (!input) {
    throw new WorkbookShapeError(
      'This workbook has no INPUT DATA sheet (or INPUT, in the older layout), '
      + `so it is not a class record. It contains: ${book.SheetNames.join(', ')}.`,
    );
  }

  if (termSheets.length === 0) {
    // The four-quarter predecessor lands here, which is correct: it has
    // quarter sheets, and there is no three-term reading of it.
    throw new WorkbookShapeError(
      'This workbook has no TERM sheets. A three-term class record has '
      + `TERM 1, TERM 2 and TERM 3; this one has: ${book.SheetNames.join(', ')}.`,
    );
  }

  const layout: LayoutId = normalise(inputName!) === 'input data'
    ? 'deped-official' : 'anticipated';

  // A workbook with only TERM 1 and TERM 2 is a class part-way through
  // the year, which is normal and importable. Saying so is still useful.
  if (termSheets.length < 3) {
    issues.push({
      severity: 'warning',
      code: 'partial-terms',
      message:
        `Only ${termSheets.length} of 3 term sheets are present `
        + `(${termSheets.map((t) => t.name).join(', ')}). The missing terms will `
        + 'be left alone, not emptied.',
      where: fileName,
    });
  }

  const identity = readIdentity(input, inputName!, issues);

  // The roster is read from the FIRST term sheet's block structure,
  // because that is where the marks are and the row that carries them
  // is the only identifier this workbook has. Names come from the input
  // sheet, matched by position within each block.
  const firstTerm = book.Sheets[termSheets[0]!.name] as Sheet;
  const roster = readRoster(input, inputName!, firstTerm, termSheets[0]!.name, layout, issues);

  const terms = termSheets.map(({ name, ordinal }) =>
    readTerm(book.Sheets[name] as Sheet, name, ordinal, roster, issues));

  return {
    fileName, sheetNames: [...book.SheetNames], layout, identity, roster, terms, issues,
  };
}

/** `TERM1` and `TERM 1` both mean term one. */
function termOrdinal(sheetName: string): number | null {
  const m = /^term\s*([123])$/.exec(normalise(sheetName));
  return m && m[1] ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ *
 * Class identity
 * ------------------------------------------------------------------ */

/**
 * Every detail is found by looking for its LABEL anywhere on the sheet
 * and reading rightwards.
 *
 * The official workbook lays these out vertically in one column with a
 * `:` separator; the anticipated one lays them out horizontally across
 * three header rows. Searching for the label rather than reading a
 * fixed cell handles both, survives a widened column, and — when a
 * label really is missing — reports which one, which is a far better
 * error than a silently empty field.
 */
function readIdentity(sheet: Sheet, sheetName: string, issues: ParseIssue[]): ClassIdentity {
  const find = (label: string, required = true): string | null => {
    const at = labelCell(sheet, label);
    if (!at) {
      if (required) {
        issues.push({
          severity: 'warning',
          code: 'missing-label',
          message: `This workbook has no "${label}" label, so that value could not be read.`,
          where: sheetName,
        });
      }
      return null;
    }
    return valueAfter(sheet, at.row, at.col);
  };

  /**
   * The first of several spellings of one field.
   *
   * A LABEL THAT IS PRESENT BUT EMPTY IS NOT A MISSING LABEL. The two
   * workbooks call this field different things — "SUBJECT TEACHER" in
   * the official one, "TEACHER" in the other — and chaining `find` with
   * `??` meant a blank official field fell through to a search for
   * "TEACHER", failed, and reported "This workbook has no TEACHER
   * label". A real teacher's file said exactly that while displaying
   * SUBJECT TEACHER on screen, which is the kind of message that makes
   * a person distrust everything else on the page.
   *
   * So: warn only when NONE of the spellings appears anywhere.
   */
  const findAny = (labels: string[], required = true): string | null => {
    for (const label of labels) {
      const at = labelCell(sheet, label);
      if (at) return valueAfter(sheet, at.row, at.col);
    }
    if (required) {
      issues.push({
        severity: 'warning',
        code: 'missing-label',
        message:
          `This workbook has no "${labels[0]}" label, so that value could not `
          + 'be read.',
        where: sheetName,
      });
    }
    return null;
  };

  // The official workbook keeps these apart, which is better — a
  // combined string can only be split by guessing.
  let gradeLevelText = find('GRADE LEVEL', false);
  let sectionText = find('SECTION', false);
  const gradeAndSection = gradeLevelText && sectionText
    ? null : find('GRADE & SECTION', false);

  if (gradeAndSection) {
    const split = splitGradeAndSection(gradeAndSection);
    gradeLevelText = gradeLevelText ?? split.gradeLevel;
    sectionText = sectionText ?? split.section;
    if (!split.section) {
      issues.push({
        severity: 'warning',
        code: 'unsplit-section',
        message:
          `"${gradeAndSection}" could not be split into a grade level and a `
          + 'section. You will be asked to choose them.',
        where: sheetName,
      });
    }
  } else if (!gradeLevelText && !sectionText) {
    issues.push({
      severity: 'warning',
      code: 'missing-label',
      message: 'This workbook states neither a grade level nor a section.',
      where: sheetName,
    });
  }

  return {
    region: find('REGION'),
    division: find('DIVISION'),
    schoolName: find('SCHOOL NAME'),
    govtSchoolId: find('SCHOOL ID'),
    schoolYear: find('SCHOOL YEAR'),
    schoolHead: find('SCHOOL HEAD', false),
    gradeAndSection,
    gradeLevelText,
    sectionText,
    // "SUBJECT TEACHER" in the official file, "TEACHER" in the other.
    // Not chained with `??`: a blank official field is a blank field,
    // not a reason to go looking for a label that layout never had.
    teacherName: findAny(['SUBJECT TEACHER', 'TEACHER'], false),
    subjectText: find('SUBJECT'),
  };
}

/**
 * Where a label sits, searching the whole sheet.
 *
 * Longer labels win: `SUBJECT TEACHER` must not be found by a search
 * for `SUBJECT`, so an exact match is required and the caller asks for
 * the more specific label first.
 */
function labelCell(sheet: Sheet, label: string): { row: number; col: number } | null {
  const want = normalise(label).replace(/:$/, '');
  const { rows, cols } = bounds(sheet);
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      const v = text(sheet, r, c);
      if (v && normalise(v).replace(/:$/, '') === want) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * The number of empty columns that may sit between a label and its
 * value before we conclude the value is simply missing.
 *
 * Both workbooks put the value within two columns of the label — the
 * official one spends one of those on a bare `:` in its own column.
 * Three is generous and still stops well short of anything else.
 */
const MAX_LABEL_VALUE_GAP = 4;

/**
 * The value to the right of a label, on the same row.
 *
 * Skips a bare `:` separator, which the official workbook puts in its
 * own column, and stops at another label — so a blank REGION followed
 * by DIVISION reads as blank rather than as "DIVISION".
 *
 * IT ALSO STOPS RUNNING. This used to scan to the end of the row, which
 * is fine until a field is left blank — and a real GMRC 9 workbook from
 * a teacher had SUBJECT TEACHER empty. The official INPUT DATA sheet
 * puts the class details on the LEFT and the roster on the RIGHT of the
 * same rows, so the scan sailed through five empty columns and returned
 * `13` — the roster ordinal of the thirteenth boy. The blank-REGION
 * guard did not catch it either: these labels do not carry their own
 * colon (it lives in the next column), so nothing matched `/:$/`.
 *
 * A wrong value here is worse than a missing one. Missing is a question
 * the import already knows how to ask; wrong is a teacher named "13".
 */
function valueAfter(sheet: Sheet, row: number, labelCol: number): string | null {
  const { cols } = bounds(sheet);

  // Where the value is allowed to live. The official workbook MERGES
  // each value cell (E23:F23 and so on), which is the template author
  // saying "the value goes here" — so when there is a merge, it is the
  // whole answer and an empty merge means an empty field. The
  // anticipated workbook merges nothing, and only there do we fall back
  // to counting columns.
  const firstValueCol = firstNonSeparator(sheet, row, labelCol, cols);
  if (firstValueCol === null) return null;
  const merged = mergeAt(sheet, row, firstValueCol);
  if (merged !== null) {
    const v = text(sheet, row, merged.startCol);
    return v === null || v === '' ? null : v;
  }

  let gap = 0;
  for (let c = firstValueCol; c <= cols; c += 1) {
    const v = text(sheet, row, c);
    if (v === null) {
      gap += 1;
      if (gap > MAX_LABEL_VALUE_GAP) return null;
      continue;
    }
    if (v === ':' || v === '-') continue;
    if (/:$/.test(v)) return null;
    // A neighbouring block's heading, reached across the empty value
    // cell. `MALE`, `FEMALE` and `LEARNERS' NAMES` head the roster that
    // shares these rows.
    if (isForeignHeading(v)) return null;
    return v;
  }
  return null;
}

/** The first column after the label that is not a bare `:` or `-`. */
function firstNonSeparator(
  sheet: Sheet, row: number, labelCol: number, cols: number,
): number | null {
  for (let c = labelCol + 1; c <= cols; c += 1) {
    const v = text(sheet, row, c);
    if (v === ':' || v === '-') continue;
    return c;
  }
  return null;
}

/** The merged range covering this cell, if there is one. */
function mergeAt(
  sheet: Sheet, row: number, col: number,
): { startCol: number } | null {
  const merges = (sheet['!merges'] ?? []) as XLSX.Range[];
  for (const m of merges) {
    if (row - 1 >= m.s.r && row - 1 <= m.e.r && col >= m.s.c && col <= m.e.c) {
      return { startCol: m.s.c };
    }
  }
  return null;
}

/**
 * Headings that belong to something else on the same row.
 *
 * Kept deliberately short: this is a backstop for the gap rule above,
 * not a second layout description. Anything longer would start encoding
 * the very coordinates this parser exists to discover.
 */
function isForeignHeading(value: string): boolean {
  const v = normalise(value).replace(/[':]/g, '');
  return v === 'MALE' || v === 'FEMALE' || v === 'LEARNERS NAMES';
}

/**
 * `Grade 7 - Masipag` → grade level and section.
 *
 * A best-effort split, offered as a SUGGESTION. Neither half is ever
 * used to create a grade level or a section: the import resolves both
 * against what the school already has, and asks when it cannot. A typo
 * here must not be able to spawn `Masipag`, `masipag` and `Masipag `
 * as three sections.
 */
export function splitGradeAndSection(
  value: string | null,
): { gradeLevel: string | null; section: string | null } {
  if (!value) return { gradeLevel: null, section: null };
  const m = /^\s*(.*?)\s*[-–—]\s*(.+?)\s*$/.exec(value);
  if (m && m[1] && m[2]) return { gradeLevel: m[1], section: m[2] };
  return { gradeLevel: value.trim(), section: null };
}

/* ------------------------------------------------------------------ *
 * The roster
 * ------------------------------------------------------------------ */

interface Block { sex: Sex; headerRow: number; }

/** MALE / FEMALE headings, wherever they are, in sheet order. */
function findBlocks(sheet: Sheet): Block[] {
  const { rows, cols } = bounds(sheet);
  const out: Block[] = [];
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 0; c <= Math.min(cols, 20); c += 1) {
      const v = text(sheet, r, c);
      if (!v) continue;
      const n = normalise(v);
      if (n === 'male') out.push({ sex: 'male', headerRow: r });
      else if (n === 'female') out.push({ sex: 'female', headerRow: r });
    }
  }
  return out;
}

/**
 * Names from the input sheet, mark rows from the term sheet.
 *
 * ⚠️ In the official workbook these are DIFFERENT ROWS. Names sit on
 * `INPUT DATA` rows 11-60 in two columns side by side — male name in K,
 * female name in N — while marks sit on term rows 18-67 and 69-118 in
 * two stacked blocks. The workbook itself bridges them by position:
 * `TERM 1!C18 = IF('INPUT DATA'!K11="","",'INPUT DATA'!K11)`. So does
 * this, rather than trusting the cached value of that formula, which is
 * empty in a file that has never been recalculated.
 *
 * In the anticipated workbook both are stacked blocks in column B and
 * the two rows coincide. The same code covers it because the coupling
 * is positional either way.
 */
function readRoster(
  input: Sheet,
  inputName: string,
  term: Sheet,
  termName: string,
  layout: LayoutId,
  issues: ParseIssue[],
): ParsedLearner[] {
  const markBlocks = findBlocks(term);
  if (markBlocks.length === 0) {
    throw new WorkbookShapeError(
      `${termName} has no MALE or FEMALE heading, so there is no way to tell `
      + 'which learners are which. Sex is carried by the block in this '
      + 'workbook — there is no sex column.',
      issues,
    );
  }

  const names = layout === 'deped-official'
    ? sideBySideNames(input)
    : stackedNames(input);

  const learners: ParsedLearner[] = [];
  const { rows: termRows } = bounds(term);

  markBlocks.forEach((block, i) => {
    const next = markBlocks[i + 1];
    const stop = next ? next.headerRow - 1 : termRows;
    const forBlock = names.filter((n) => n.sex === block.sex);
    for (let index = 0; index < forBlock.length; index += 1) {
      const entry = forBlock[index]!;
      const row = block.headerRow + 1 + index;
      if (row > stop) {
        issues.push({
          severity: 'error',
          code: 'roster-overflows-block',
          message:
            `The ${block.sex} list has more learners than the ${termName} sheet has `
            + 'rows for them, so the last ones would have nowhere to put marks.',
          where: `${inputName} / ${termName}`,
        });
        break;
      }
      learners.push({
        row,
        nameRow: entry.row,
        ordinal: index + 1,
        sex: block.sex,
        ...splitName(entry.name),
      });
    }
  });

  if (learners.length === 0) {
    issues.push({
      severity: 'error',
      code: 'empty-roster',
      message: 'This workbook has no learner names, so there is nothing to import.',
      where: inputName,
    });
  }

  const seen = new Map<string, number[]>();
  for (const l of learners) {
    const key = normalise(l.raw);
    seen.set(key, [...(seen.get(key) ?? []), l.nameRow]);
  }
  for (const [key, rows] of seen) {
    if (rows.length > 1) {
      issues.push({
        severity: 'error',
        code: 'duplicate-name',
        message:
          `"${key}" appears on rows ${rows.join(' and ')}. The workbook carries no `
          + 'LRN or student number, so two identical names cannot be told apart. '
          + 'Fix the workbook, or resolve each row by hand in the preview.',
        where: inputName,
      });
    }
  }

  return learners;
}

interface NameEntry { row: number; name: string; sex: Sex; }

/**
 * The official layout: a MALE heading and a FEMALE heading on the SAME
 * row, each spanning a number column and a name column.
 */
function sideBySideNames(sheet: Sheet): NameEntry[] {
  const blocks = findBlocks(sheet);
  const { rows, cols } = bounds(sheet);
  const out: NameEntry[] = [];

  // Locate each heading's column so the name column can be found beside
  // it, rather than assuming K and N.
  for (const block of blocks) {
    let headingCol: number | null = null;
    for (let c = 0; c <= cols; c += 1) {
      const v = text(sheet, block.headerRow, c);
      if (v && normalise(v) === block.sex) { headingCol = c; break; }
    }
    if (headingCol === null) continue;

    for (let r = block.headerRow + 1; r <= rows; r += 1) {
      // The number column runs 1..50; the name is the first non-empty
      // cell to its right, within the heading's own merged span.
      const n = num(sheet, r, headingCol);
      if (typeof n !== 'number') continue;
      const name = text(sheet, r, headingCol + 1);
      if (name) out.push({ row: r, name, sex: block.sex });
    }
  }
  return out;
}

/** The anticipated layout: two stacked blocks, names in one column. */
function stackedNames(sheet: Sheet): NameEntry[] {
  const blocks = findBlocks(sheet);
  const { rows, cols } = bounds(sheet);
  const out: NameEntry[] = [];

  blocks.forEach((block, i) => {
    let headingCol: number | null = null;
    for (let c = 0; c <= cols; c += 1) {
      const v = text(sheet, block.headerRow, c);
      if (v && normalise(v) === block.sex) { headingCol = c; break; }
    }
    if (headingCol === null) return;

    const next = blocks[i + 1];
    const stop = next ? next.headerRow - 1 : rows;
    for (let r = block.headerRow + 1; r <= stop; r += 1) {
      const name = text(sheet, r, headingCol);
      if (name) out.push({ row: r, name, sex: block.sex });
    }
  });
  return out;
}

/** `Alvarez, Neitan` → last and first. No comma means one whole name. */
export function splitName(raw: string): ParsedName {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  const at = trimmed.indexOf(',');
  if (at === -1) return { raw: trimmed, lastName: trimmed, firstName: '' };
  return {
    raw: trimmed,
    lastName: trimmed.slice(0, at).trim(),
    firstName: trimmed.slice(at + 1).trim(),
  };
}

/* ------------------------------------------------------------------ *
 * TERM<n> — components, items and marks
 * ------------------------------------------------------------------ */

interface TermLayout {
  bandRow: number;
  itemCodeRow: number;
  hpsRow: number;
  bands: { first: number; last: number; label: string }[];
}

/**
 * Where this term sheet keeps its structure.
 *
 * The merged headings on the band row are the anchor. Everything else
 * follows from where they END: the item codes are on the next row, the
 * highest possible scores on the one after. The official workbook
 * merges its headings across two rows (12-13, codes on 14, scores on
 * 15); the anticipated one across one (8, codes on 9, scores on 10).
 * Neither number appears in this file.
 */
function readTermLayout(sheet: Sheet, sheetName: string): TermLayout {
  const merges = (sheet['!merges'] ?? []) as XLSX.Range[];
  const candidates = merges
    .map((m) => ({ m, label: text(sheet, m.s.r + 1, m.s.c) }))
    .filter((x): x is { m: XLSX.Range; label: string } =>
      x.label !== null && componentKey(x.label) !== null);

  if (candidates.length === 0) {
    throw new WorkbookShapeError(
      `${sheetName} has no merged component headings. Without them there is no `
      + 'way to tell which columns belong to Written Works, Performance Tasks '
      + 'or the examinations.',
    );
  }

  // All three headings sit on the same row; take the topmost, so a
  // stray merge elsewhere on the sheet cannot move the anchor.
  const bandRow = Math.min(...candidates.map((c) => c.m.s.r)) + 1;

  // ⚠️ Now take EVERY labelled merge on that row, not only the ones
  // that resolved. Using the recognised bands to find the row and then
  // to define the bands would make an unrecognised heading vanish
  // silently, and its marks with it. It has to be found and reported.
  //
  // A band spans SEVERAL columns — its items plus its summary tail. The
  // official sheet also merges `Initial Grade`, `Term Grade` and
  // `Descriptor` onto this row, but each of those spans one column
  // across several ROWS. That shape, not their names, is what tells
  // them apart, so a school renaming a column cannot turn a derived
  // heading into a component or the other way round.
  const onBandRow = merges
    .filter((m) => m.s.r + 1 === bandRow && m.e.c > m.s.c)
    .map((m) => ({ m, label: text(sheet, bandRow, m.s.c) }))
    .filter((x): x is { m: XLSX.Range; label: string } => x.label !== null);

  const lastBandRow = Math.max(...onBandRow.map((c) => c.m.e.r)) + 1;

  return {
    bandRow,
    itemCodeRow: lastBandRow + 1,
    hpsRow: lastBandRow + 2,
    bands: onBandRow
      .map((c) => ({ first: c.m.s.c, last: c.m.e.c, label: c.label }))
      .sort((a, b) => a.first - b.first),
  };
}

function readTerm(
  sheet: Sheet | undefined,
  sheetName: string,
  ordinal: number,
  roster: ParsedLearner[],
  issues: ParseIssue[],
): ParsedTerm {
  if (!sheet) {
    throw new WorkbookShapeError(`Sheet ${sheetName} is named but has no content.`);
  }

  const layout = readTermLayout(sheet, sheetName);
  const components = readComponents(sheet, sheetName, layout, issues);
  const derivedCols = derivedColumns(sheet, layout, components);

  const marks: ParsedMark[] = [];
  const derived: WorkbookDerived[] = [];

  for (const learner of roster) {
    for (const component of components) {
      for (const item of component.items) {
        const value = num(sheet, learner.row, item.column);
        if (value === undefined) {
          issues.push({
            severity: 'error',
            code: 'non-numeric-score',
            message:
              `${learner.raw} has something that is not a number where a score for `
              + `${component.key} ${item.code} should be.`,
            where: ref(sheetName, learner.row, item.column),
          });
          continue;
        }
        if (value !== null && (value < 0 || value > item.highestPossibleScore)) {
          issues.push({
            severity: 'warning',
            code: 'score-out-of-range',
            message:
              `${learner.raw} scored ${value} on ${component.key} ${item.code}, which is `
              + `outside 0–${item.highestPossibleScore}.`,
            where: ref(sheetName, learner.row, item.column),
          });
        }
        // A blank stays null all the way through. See the header note.
        marks.push({
          row: learner.row,
          componentKey: component.key,
          itemCode: item.code,
          score: value,
        });
      }
    }

    if (derivedCols) {
      const initial = num(sheet, learner.row, derivedCols.initialGrade);
      const term = num(sheet, learner.row, derivedCols.termGrade);
      derived.push({
        row: learner.row,
        initialGrade: typeof initial === 'number' ? initial : null,
        termGrade: typeof term === 'number' ? term : null,
        descriptor: text(sheet, learner.row, derivedCols.descriptor),
      });
    }
  }

  return { sheetName, ordinal, components, marks, derived };
}

function readComponents(
  sheet: Sheet, sheetName: string, layout: TermLayout, issues: ParseIssue[],
): ParsedComponent[] {
  const components: ParsedComponent[] = [];

  for (const band of layout.bands) {
    const key = componentKey(band.label);
    if (!key) {
      issues.push({
        severity: 'error',
        code: 'unknown-component',
        message:
          `"${band.label}" is not a component this system recognises. Expected `
          + 'Written/Oral Works, Product/Performance Tasks, or the examinations '
          + 'band. Its marks would not be imported.',
        where: ref(sheetName, layout.bandRow, band.first),
      });
      continue;
    }

    // Walk the trailing summary columns off the end of the band, by
    // NAME. See SUMMARY_COLUMN: counting back a fixed number is what
    // the official exams band breaks.
    let itemsEnd = band.last;
    while (itemsEnd >= band.first) {
      const v = text(sheet, layout.itemCodeRow, itemsEnd);
      if (v && SUMMARY_COLUMN.test(v)) itemsEnd -= 1;
      else break;
    }

    const weightColumn = summaryColumn(sheet, layout, band.first, band.last, 'ws');
    const rawWeight = weightColumn === null
      ? null : num(sheet, layout.hpsRow, weightColumn);
    const weight = typeof rawWeight === 'number' ? rawWeight : null;
    if (weight === null) {
      issues.push({
        severity: 'warning',
        code: 'missing-weight',
        message:
          `${band.label} does not state its weight, so the system's configured `
          + 'weight for this subject will be used instead.',
        where: ref(sheetName, layout.hpsRow, weightColumn ?? band.last),
      });
    }

    const items: ParsedItem[] = [];
    for (let c = band.first; c <= itemsEnd; c += 1) {
      const code = text(sheet, layout.itemCodeRow, c);
      if (!code) continue;
      const hps = num(sheet, layout.hpsRow, c);
      // "An assessment whose highest possible score is blank does not
      // exist and must not be created." A column with a heading and no
      // score out of is a slot the teacher has not used yet.
      if (typeof hps !== 'number') continue;
      if (hps <= 0) {
        issues.push({
          severity: 'error',
          code: 'bad-highest-possible-score',
          message:
            `${band.label} item ${code} has a highest possible score of ${hps}. `
            + 'A score out of zero cannot be graded.',
          where: ref(sheetName, layout.hpsRow, c),
        });
        continue;
      }
      items.push({
        code,
        column: c,
        highestPossibleScore: hps,
        childComponentCode: /^\d+$/.test(code) ? null : code,
      });
    }

    if (items.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'empty-component',
        message:
          `${band.label} has no assessments with a highest possible score, so `
          + 'nothing will be created for it.',
        where: ref(sheetName, layout.bandRow, band.first),
      });
    }

    components.push({
      key, label: band.label, weight,
      firstColumn: band.first, lastColumn: band.last, items,
    });
  }

  const keys = components.map((c) => c.key);
  for (const k of keys) {
    if (keys.indexOf(k) !== keys.lastIndexOf(k)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-component',
        message: `${sheetName} declares the ${k} component more than once.`,
        where: sheetName,
      });
      break;
    }
  }

  return components;
}

function componentKey(label: string): ComponentKey | null {
  const n = normalise(label);
  if (n.includes('written')) return 'WW';
  if (n.includes('performance') || n.includes('product')) return 'PT';
  if (n.includes('summative') || n.includes('exam')) return 'EX';
  return null;
}

/**
 * The band's own PS or WS column — the LAST one, since the official
 * exams band has `WS ST1`, `WS ST2` and `WS TE` before its real WS.
 */
function summaryColumn(
  sheet: Sheet, layout: TermLayout, first: number, last: number, want: string,
): number | null {
  for (let c = last; c >= first; c -= 1) {
    const v = text(sheet, layout.itemCodeRow, c);
    if (v && normalise(v) === want) return c;
  }
  return null;
}

/**
 * Initial Grade / Term Grade / Descriptor, found by their headings on
 * the band row after the last band. Read for the preview's grade check
 * only — nothing may import them.
 */
function derivedColumns(sheet: Sheet, layout: TermLayout, components: ParsedComponent[]):
  { initialGrade: number; termGrade: number; descriptor: number } | null {
  const after = components.reduce((m, c) => Math.max(m, c.lastColumn), -1) + 1;
  const { cols } = bounds(sheet);
  const found: Record<string, number> = {};
  for (let c = after; c <= cols; c += 1) {
    const v = text(sheet, layout.bandRow, c);
    if (!v) continue;
    const n = normalise(v);
    if (n === 'initial grade') found.initialGrade = c;
    else if (n === 'term grade') found.termGrade = c;
    else if (n === 'descriptor') found.descriptor = c;
  }
  const { initialGrade, termGrade, descriptor } = found;
  if (initialGrade === undefined || termGrade === undefined || descriptor === undefined) {
    return null;
  }
  return { initialGrade, termGrade, descriptor };
}
