/**
 * Builds the OFFICIAL-layout test fixture from DepEd's own workbook.
 *
 * The published file is 262 KB blank and 717 KB once filled, and it is
 * a government artifact carrying a school's details once a teacher has
 * used it. Neither belongs in the repository.
 *
 * So this DERIVES the fixture rather than reconstructing it: it opens
 * the real file, fills it the way a teacher would, trims it to a few
 * learners, and writes out what is left — keeping the merged ranges,
 * the header cells and the row offsets exactly as DepEd published them.
 * Every coordinate the parser depends on is therefore the real one.
 *
 *   node scripts/make-official-fixture.mjs <path-to-official.xlsx>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import XLSX from 'xlsx';

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node scripts/make-official-fixture.mjs <official.xlsx>');
  process.exit(1);
}
const OUT = new URL('../src/lib/import/__fixtures__/deped-official-sample.xlsx', import.meta.url);

const MALE = ['Cruz, Andres', 'Reyes, Bayani', 'Santos, Carlo'];
const FEMALE = ['Aquino, Divina', 'Bautista, Elena'];

const wb = XLSX.read(readFileSync(SRC), { cellFormula: false, cellStyles: false });
const put = (ws, a, v) => { ws[a] = { t: typeof v === 'number' ? 'n' : 's', v }; };

/* ---- INPUT DATA: the vertical label:value block, then the roster ---- */
const inp = wb.Sheets['INPUT DATA'];
put(inp, 'E10', 'IV-A CALABARZON');
put(inp, 'E11', 'Rizal');
put(inp, 'E13', '301417');
put(inp, 'E14', 'Angono National High School');
put(inp, 'E15', '2026-2027');
put(inp, 'E16', 'Dr. Ramos');
put(inp, 'E23', 'Santos, Maria');
put(inp, 'E24', 'EPP');
put(inp, 'E25', 'Grade 7');
put(inp, 'E26', 'Masipag');
// Names sit BESIDE their numbers: male in K, female in N, same rows.
MALE.forEach((n, i) => put(inp, `K${11 + i}`, n));
FEMALE.forEach((n, i) => put(inp, `N${11 + i}`, n));

/* ---- TERM 1: marks on rows 18+ (male) and 69+ (female) ------------- */
const t1 = wb.Sheets['TERM 1'];
MALE.forEach((_, i) => {
  const r = 18 + i;
  put(t1, `F${r}`, 1 + i); put(t1, `G${r}`, 2); put(t1, `H${r}`, 2);
  put(t1, `I${r}`, 2); put(t1, `J${r}`, 2);
  put(t1, `N${r}`, 4); put(t1, `O${r}`, 5); put(t1, `P${r}`, 5);
  put(t1, `T${r}`, 14); put(t1, `U${r}`, 13);
  // The first learner's term exam is deliberately LEFT BLANK, so the
  // blank-is-not-a-zero rule has something to be tested against.
  if (i !== 0) put(t1, `V${r}`, 12);
});
FEMALE.forEach((_, i) => {
  const r = 69 + i;
  put(t1, `F${r}`, 2); put(t1, `G${r}`, 2); put(t1, `H${r}`, 2);
  put(t1, `I${r}`, 2); put(t1, `J${r}`, 2);
  put(t1, `N${r}`, 5); put(t1, `O${r}`, 5); put(t1, `P${r}`, 5);
  put(t1, `T${r}`, 15); put(t1, `U${r}`, 15); put(t1, `V${r}`, 15);
});

/* ---- Trim ---------------------------------------------------------- *
 * Drop every cell below the rows in use, on every sheet. The header
 * rows, the merges and the row offsets are untouched, which is the
 * whole point — the fixture must fail the same way the real file would.
 * ------------------------------------------------------------------- */
const KEEP_BELOW = { 'INPUT DATA': 30, 'TERM 1': 72, 'TERM 2': 72, 'TERM 3': 72 };
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  if (name === 'HELPER') continue;           // the transmutation table stays
  const limit = KEEP_BELOW[name] ?? 14;      // FINAL GRADES keeps its headings
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    if (XLSX.utils.decode_cell(key).r + 1 > limit) delete ws[key];
  }
  if (ws['!merges']) {
    ws['!merges'] = ws['!merges'].filter((m) => m.e.r + 1 <= limit);
  }
}

writeFileSync(OUT, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log(`wrote ${OUT.pathname}`);
