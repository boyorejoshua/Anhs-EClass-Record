import * as XLSX from 'xlsx';

/* ==================================================================== *
 * THREE-TERM CLASS RECORD — PARSER
 *
 * Turns the school's own workbook into a plain description of what is
 * in it. Nothing here touches the database, resolves an identity, or
 * decides anything: it reads a file and says what it found, including
 * what it could not make sense of.
 *
 * Two rules shape every decision below.
 *
 * ONLY RAW MARKS AND STRUCTURE CROSS THE BOUNDARY. Every grade in the
 * workbook is a formula — Initial Grade, TERM GRADE, DESCRIPTOR, the
 * Total/PS/WS columns, the whole SUMMARY sheet. Importing them would
 * put a second source of truth beside the grading engine. They are read
 * only so the preview can RECOMPUTE and compare; see `derived`, which
 * no writer may consume.
 *
 * A BLANK IS NOT A ZERO. A missing score means "not given yet" and must
 * arrive as null. Importing blanks as zeros would silently fail
 * learners who simply have not sat the test.
 *
 * The layout is read from the sheet rather than hard-coded. Merged
 * ranges on row 8 give the component bands; row 9 gives item codes and
 * marks where each band's Total/PS/WS tail begins; row 10 gives the
 * highest possible score and, in the WS column, the component weight.
 * A school that adds a sixth written work shifts every column after it,
 * and this parser follows the shift.
 * ==================================================================== */

/** Where the layout lives. 1-based, as a person reading the sheet sees it. */
const ROW = {
  region: 4,
  schoolName: 5,
  classIdentity: 7,
  band: 8,
  itemCode: 9,
  highestPossibleScore: 10,
} as const;

/** The three columns that trail every band. All formulas; never items. */
const TAIL = ['total', 'ps', 'ws'] as const;

export type Sex = 'male' | 'female';

export interface ParsedName {
  /** Exactly as the cell holds it, e.g. `Alvarez, Neitan`. */
  raw: string;
  lastName: string;
  firstName: string;
}

export interface ParsedLearner extends ParsedName {
  /**
   * The sheet row this learner sits on. It is the join key between
   * INPUT and the term sheets: row N is the same learner everywhere.
   */
  row: number;
  /** Position within the block, as the workbook numbers it in column A. */
  ordinal: number;
  /** Carried by which block the row is in — the workbook has no sex column. */
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
  /** The band label as written, e.g. `WRITTEN / ORAL WORKS (20%)`. */
  label: string;
  /** From the WS column of row 10 — 0.2, 0.6, 0.2 for EPP/TLE. */
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
  /** 1, 2, 3 — from the sheet name, cross-checked against the A7 label. */
  ordinal: number;
  /** The label the sheet gives itself, e.g. `TERM 1`. */
  label: string;
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
  /** The raw `Grade 7 - Masipag` string, unsplit. */
  gradeAndSection: string | null;
  /** Best-effort split of the above. Neither half may be invented later. */
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
  identity: ClassIdentity;
  roster: ParsedLearner[];
  terms: ParsedTerm[];
  issues: ParseIssue[];
}

/** Thrown when the file is not this workbook at all. */
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

/** The last row the sheet claims to use. */
function lastRow(sheet: Sheet): number {
  const range = sheet['!ref'];
  if (!range) return 0;
  return XLSX.utils.decode_range(range).e.r + 1;
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
  const input = findSheet(book, 'INPUT');
  if (!input) {
    throw new WorkbookShapeError(
      'This workbook has no INPUT sheet, so it is not a three-term class '
      + `record. It contains: ${book.SheetNames.join(', ')}.`,
    );
  }

  const termSheets = book.SheetNames
    .map((name) => ({ name, ordinal: termOrdinal(name) }))
    .filter((t): t is { name: string; ordinal: number } => t.ordinal !== null)
    .sort((a, b) => a.ordinal - b.ordinal);

  if (termSheets.length === 0) {
    throw new WorkbookShapeError(
      'This workbook has no TERM sheets. A three-term class record has '
      + `TERM1, TERM2 and TERM3; this one has: ${book.SheetNames.join(', ')}.`,
    );
  }

  // A workbook with only TERM1 and TERM2 is a class part-way through the
  // year, which is normal and importable. Saying so is still useful.
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

  if (findSheet(book, 'INPUT DATA') && !findSheet(book, 'TERM1')) {
    issues.push({
      severity: 'error',
      code: 'four-quarter-workbook',
      message:
        'This looks like the four-quarter workbook (INPUT DATA with quarter '
        + 'sheets), not the three-term one. It cannot be imported here.',
      where: fileName,
    });
  }

  const identity = readIdentity(input, issues);
  const roster = readRoster(input, issues);

  const terms = termSheets.map(({ name, ordinal }) =>
    readTerm(book.Sheets[name] as Sheet, name, ordinal, roster, issues));

  return { fileName, sheetNames: [...book.SheetNames], identity, roster, terms, issues };
}

function findSheet(book: XLSX.WorkBook, want: string): Sheet | null {
  const name = book.SheetNames.find((n) => normalise(n) === normalise(want));
  return name ? (book.Sheets[name] as Sheet) : null;
}

/** `TERM1` → 1. Tolerates `TERM 1` and case, rejects everything else. */
function termOrdinal(sheetName: string): number | null {
  const m = /^term\s*([123])$/.exec(normalise(sheetName));
  return m && m[1] ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ *
 * INPUT — class identity
 * ------------------------------------------------------------------ */

/**
 * The header cells sit at fixed offsets from their labels, so each value
 * is found by looking for its LABEL and reading rightwards. A workbook
 * whose author widened a column still parses; one that renamed a label
 * reports the label it could not find, which is a far better error than
 * a silently empty field.
 */
function readIdentity(sheet: Sheet, issues: ParseIssue[]): ClassIdentity {
  const find = (row: number, label: string): string | null => {
    const col = labelColumn(sheet, row, label);
    if (col === null) {
      issues.push({
        severity: 'warning',
        code: 'missing-label',
        message: `The INPUT sheet has no "${label}" label on row ${row}, so that `
          + 'value could not be read.',
        where: `INPUT!${row}:${row}`,
      });
      return null;
    }
    return valueAfter(sheet, row, col);
  };

  const gradeAndSection = find(ROW.classIdentity, 'GRADE & SECTION');
  const split = splitGradeAndSection(gradeAndSection);
  if (gradeAndSection && !split.section) {
    issues.push({
      severity: 'warning',
      code: 'unsplit-section',
      message:
        `"${gradeAndSection}" could not be split into a grade level and a `
        + 'section. You will be asked to choose them.',
      where: 'INPUT!' + ROW.classIdentity,
    });
  }

  return {
    region: find(ROW.region, 'REGION'),
    division: find(ROW.region, 'DIVISION'),
    schoolName: find(ROW.schoolName, 'SCHOOL NAME'),
    govtSchoolId: find(ROW.schoolName, 'SCHOOL ID'),
    schoolYear: find(ROW.schoolName, 'SCHOOL YEAR'),
    gradeAndSection,
    gradeLevelText: split.gradeLevel,
    sectionText: split.section,
    teacherName: find(ROW.classIdentity, 'TEACHER'),
    subjectText: find(ROW.classIdentity, 'SUBJECT'),
  };
}

/** The column holding a label, ignoring the trailing colon and spacing. */
function labelColumn(sheet: Sheet, row: number, label: string): number | null {
  const want = normalise(label).replace(/:$/, '');
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  const end = range ? range.e.c : 40;
  for (let c = 0; c <= end; c += 1) {
    const v = text(sheet, row, c);
    if (v && normalise(v).replace(/:$/, '') === want) return c;
  }
  return null;
}

/** The first non-empty cell to the right of a label, on the same row. */
function valueAfter(sheet: Sheet, row: number, labelCol: number): string | null {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  const end = range ? range.e.c : labelCol + 12;
  for (let c = labelCol + 1; c <= end; c += 1) {
    const v = text(sheet, row, c);
    if (v === null) continue;
    // Another label immediately to the right means this field is blank —
    // e.g. REGION with nothing filled in, then DIVISION.
    if (/:$/.test(v)) return null;
    return v;
  }
  return null;
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
 * INPUT — the roster
 * ------------------------------------------------------------------ */

/**
 * Two blocks, MALE then FEMALE, each a fixed run of slots.
 *
 * The block boundaries are found by looking for the header rows rather
 * than assuming rows 12 and 63, because the only thing that matters is
 * that a learner's ROW is stable — it is what aligns INPUT with the
 * term sheets. Blank rows inside a block are unused slots and are
 * skipped without comment; that is what the empty half of a 50-slot
 * block is for.
 */
function readRoster(sheet: Sheet, issues: ParseIssue[]): ParsedLearner[] {
  const NAME_COL = 1; // B
  const ORDINAL_COL = 0; // A

  const blocks: { sex: Sex; headerRow: number }[] = [];
  const end = lastRow(sheet);
  for (let r = 1; r <= end; r += 1) {
    const v = text(sheet, r, NAME_COL);
    if (!v) continue;
    const n = normalise(v);
    if (n === 'male') blocks.push({ sex: 'male', headerRow: r });
    else if (n === 'female') blocks.push({ sex: 'female', headerRow: r });
  }

  if (blocks.length === 0) {
    throw new WorkbookShapeError(
      'The INPUT sheet has no MALE or FEMALE heading in column B, so there is '
      + 'no way to tell which learners are which. Sex is carried by the block '
      + 'in this workbook — there is no sex column.',
      issues,
    );
  }

  const learners: ParsedLearner[] = [];
  blocks.forEach((block, i) => {
    const next = blocks[i + 1];
    const stop = next ? next.headerRow - 1 : end;
    let ordinal = 0;
    for (let r = block.headerRow + 1; r <= stop; r += 1) {
      const raw = text(sheet, r, NAME_COL);
      if (!raw) continue;
      ordinal += 1;
      const stated = num(sheet, r, ORDINAL_COL);
      learners.push({
        row: r,
        ordinal: typeof stated === 'number' ? stated : ordinal,
        sex: block.sex,
        ...splitName(raw),
      });
    }
  });

  if (learners.length === 0) {
    issues.push({
      severity: 'error',
      code: 'empty-roster',
      message: 'The INPUT sheet has no learner names, so there is nothing to import.',
      where: 'INPUT!B',
    });
  }

  const seen = new Map<string, number[]>();
  for (const l of learners) {
    const key = normalise(l.raw);
    seen.set(key, [...(seen.get(key) ?? []), l.row]);
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
        where: 'INPUT!B',
      });
    }
  }

  return learners;
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

  const label = text(sheet, ROW.classIdentity, 0) ?? `TERM ${ordinal}`;
  const components = readComponents(sheet, sheetName, issues);

  const marks: ParsedMark[] = [];
  const derived: WorkbookDerived[] = [];

  const derivedCols = derivedColumns(sheet, components);

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

  return { sheetName, ordinal, label, components, marks, derived };
}

/**
 * The bands are the merged ranges on row 8. Each one spans its items
 * plus a Total/PS/WS tail, and the tail is found by its ROW 9 LABELS
 * rather than by counting three back from the end — a band that ever
 * grows a fourth summary column should break loudly, not shift every
 * item by one.
 */
function readComponents(
  sheet: Sheet, sheetName: string, issues: ParseIssue[],
): ParsedComponent[] {
  const merges = (sheet['!merges'] ?? []) as XLSX.Range[];
  const bands = merges
    .filter((m) => m.s.r === ROW.band - 1 && m.e.r === ROW.band - 1)
    .map((m) => ({ first: m.s.c, last: m.e.c, label: text(sheet, ROW.band, m.s.c) }))
    .filter((b): b is { first: number; last: number; label: string } => b.label !== null)
    .sort((a, b) => a.first - b.first);

  if (bands.length === 0) {
    throw new WorkbookShapeError(
      `${sheetName} has no merged component headings on row ${ROW.band}. Without `
      + 'them there is no way to tell which columns belong to Written Works, '
      + 'Performance Tasks or the exams.',
    );
  }

  const components: ParsedComponent[] = [];

  for (const band of bands) {
    const key = componentKey(band.label);
    if (!key) {
      issues.push({
        severity: 'error',
        code: 'unknown-component',
        message:
          `"${band.label}" is not a component this system recognises. Expected `
          + 'Written/Oral Works, Product/Performance Tasks, or Summative Tests '
          + 'and Term Examinations.',
        where: ref(sheetName, ROW.band, band.first),
      });
      continue;
    }

    // Walk the tail back from the end of the band, matching labels.
    let itemsEnd = band.last;
    const tail = [...TAIL].reverse();
    for (const want of tail) {
      const v = text(sheet, ROW.itemCode, itemsEnd);
      if (v && normalise(v) === want) itemsEnd -= 1;
    }

    const weightColumn = wsColumn(sheet, band.first, band.last);
    const rawWeight = weightColumn === null ? null : num(sheet, ROW.highestPossibleScore, weightColumn);
    const weight = typeof rawWeight === 'number' ? rawWeight : null;
    if (weight === null) {
      issues.push({
        severity: 'warning',
        code: 'missing-weight',
        message:
          `${band.label} does not state its weight, so the system's configured `
          + 'weight for this subject will be used instead.',
        where: ref(sheetName, ROW.highestPossibleScore, weightColumn ?? band.last),
      });
    }

    const items: ParsedItem[] = [];
    for (let c = band.first; c <= itemsEnd; c += 1) {
      const code = text(sheet, ROW.itemCode, c);
      if (!code) continue;
      const hps = num(sheet, ROW.highestPossibleScore, c);
      // "An assessment whose highest possible score is blank does not
      // exist and must not be created." A column with a heading and no
      // HPS is a slot the teacher has not used yet.
      if (typeof hps !== 'number') continue;
      if (hps <= 0) {
        issues.push({
          severity: 'error',
          code: 'bad-highest-possible-score',
          message:
            `${band.label} item ${code} has a highest possible score of ${hps}. `
            + 'A score out of zero cannot be graded.',
          where: ref(sheetName, ROW.highestPossibleScore, c),
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
        where: ref(sheetName, ROW.band, band.first),
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

/** The band's WS column — where the weight is written. */
function wsColumn(sheet: Sheet, first: number, last: number): number | null {
  for (let c = last; c >= first; c -= 1) {
    const v = text(sheet, ROW.itemCode, c);
    if (v && normalise(v) === 'ws') return c;
  }
  return null;
}

/**
 * Initial Grade / TERM GRADE / DESCRIPTOR, found by their row-8 headings
 * after the last band. Read for the preview's grade check only.
 */
function derivedColumns(sheet: Sheet, components: ParsedComponent[]):
  { initialGrade: number; termGrade: number; descriptor: number } | null {
  const after = components.reduce((m, c) => Math.max(m, c.lastColumn), -1) + 1;
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  const end = range ? range.e.c : after + 6;
  const found: Record<string, number> = {};
  for (let c = after; c <= end; c += 1) {
    const v = text(sheet, ROW.band, c);
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
