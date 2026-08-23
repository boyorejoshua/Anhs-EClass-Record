# Three-Term Class Record — Import Mapping

*Derived from the actual workbook, not from assumptions.*

| | |
|---|---|
| **Source of truth** | `EClassRecordEditableEPPandTLE.xlsx`, supplied by the school |
| **Structure** | Three-term (`INPUT` · `TERM1` · `TERM2` · `TERM3` · `SUMMARY OF GRADES`) |
| **Also inspected** | `GRADE710_EDUKASYONSAPAGPAPAKATAO.xlsx` — the **four-quarter** predecessor (`EsP_Q1`…`EsP_Q4`) |
| **Status** | ⚠️ The workbook's own cell `INPUT!A3` reads *"(Waiting for the Official DepEd Order)"* |

---

## 1. What one workbook represents

**One workbook is one CLASS for one school year** — a subject taught to
a section by a teacher — carrying all three terms and up to 100
learners.

That is the crux of what the school asked for: importing a workbook
should *resolve or create a class*, not merely load a list of names.

```
WORKBOOK
 ├── INPUT               class identity + the roster
 ├── TERM1 ─┐
 ├── TERM2  ├─ one academic period each: assessments + raw marks
 ├── TERM3 ─┘
 └── SUMMARY OF GRADES   derived; NOT imported (see §7)
```

---

## 2. Class identity — `INPUT` rows 4–7

| Cell | Label | → System field | Notes |
|---|---|---|---|
| `G4` | REGION | `schools.region` | Match, do not create |
| `L4` | DIVISION | `schools.division` | Match, do not create |
| `G5` | SCHOOL NAME | `schools.name` | Match |
| `S5` | SCHOOL ID | `schools.govt_school_id` | **Preferred school key** — a government ID, stable |
| `Y5` | SCHOOL YEAR | `academic_years.label` | e.g. `2026-2027` |
| `J7` | GRADE & SECTION | `grade_levels.name` + `sections.name` | Needs splitting; see §3 |
| `Q7` | TEACHER | `users` / `classes.primary_teacher_id` | Match by name → **confirm step** |
| `Y7` | SUBJECT | `subjects.code` / `subjects.title` | e.g. `EPP` |

### The class key

A class is resolved by the tuple:

```
school_id + academic_year_id + section_id + subject_id
```

`classes` already has a unique constraint on that shape, which is what
makes the import **idempotent**: re-importing the same workbook resolves
to the same class and updates it. A duplicate can only appear if the
teacher deletes the class first and imports again — which is precisely
the behaviour asked for.

---

## 3. `GRADE & SECTION` needs splitting

The cell is a single free-text string (e.g. `Grade 7 - Masipag`). It must
be split into a grade level and a section, and neither may be invented:

1. Try the school's existing `grade_levels` names against the leading
   part.
2. Try the school's existing `sections` for that grade level and year
   against the trailing part.
3. **No match → validation error**, offered as a mapping choice in the
   preview. Never auto-create a section: a typo would silently spawn
   `Masipag`, `masipag` and `Masipag ` as three sections.

---

## 4. The roster — `INPUT` column B, in two fixed blocks

| Rows | Block | Named range |
|---|---|---|
| `B12:B61` | **MALE** — 50 slots | `MaleLearners` |
| `B63:B112` | **FEMALE** — 50 slots | `FemaleLearners` |

- Row `11` and row `62` are the `MALE` / `FEMALE` header rows.
- The blocks are fixed-size; blank rows are unused slots, not gaps.
- Names are `Last, First` — e.g. `Alvarez, Neitan`.
- **Sex is carried by the block, not by a column.** `students.sex` comes
  from which block the row is in. This is the only place sex appears.

### ⚠️ There is no learner identifier anywhere in the workbook

No LRN. No student number. Nothing but the name and its position.

This directly collides with the brief's Phase 11 rule — *"Do NOT use
name alone as the primary matching key"* — and the rule is right. The
resolution is **not** a cleverer algorithm; it is to stop pretending the
file can answer the question:

| Situation | Behaviour |
|---|---|
| Exactly one active enrolment in this school year whose normalised name matches | Propose the match, marked **matched by name** — a warning, never silent |
| Several match, or the match is fuzzy | **Unresolved.** Show the candidates and require a human choice |
| None match | Propose **create new student**, listed separately in the preview |

Normalisation for comparison only: trim, collapse whitespace, case-fold,
strip punctuation. The stored name keeps its original form.

A workbook that has been through the system once should carry the
identifiers back out; see §8.

---

## 5. Assessments — `TERM<n>` rows 8–10

Each term sheet declares its assessments in three column bands:

| Columns | Component | Weight cell | Weight (EPP/TLE) |
|---|---|---|---|
| `F:J` | **WRITTEN / ORAL WORKS** — 5 items | `M10` | 0.20 |
| `N:P` | **PRODUCT / PERFORMANCE TASKS** — 3 items | `S10` | 0.60 |
| `T:V` | **SUMMATIVE TESTS AND TERM EXAMINATIONS** — `ST1`, `ST2`, `TE` | `Y10` | 0.20 |

- **Row 9** holds the item ordinal (`1..5`, `1..3`) or the code
  (`ST1`, `ST2`, `TE`).
- **Row 10** holds `HIGHEST POSSIBLE SCORE` per item →
  `assessments.highest_possible_score`.
- `K`, `Q`, `W` are `Total`; `L`, `R`, `X` are `PS`; `M`, `S`, `Y` are
  `WS`. **All three are formulas — skip them.** The engine recomputes.

### The exam band is a component TREE

`ST1 / ST2 / TE` are three children under one weighted parent, which is
exactly `grade_components.parent_component_id`. The workbook confirms
the tree the engine was built for.

### Mapping to `assessments`

```
assessments.class_id             ← resolved class
assessments.academic_period_id   ← the term this sheet is
assessments.component_id         ← WW | PT | EX>ST1/ST2/TE
assessments.ordinal              ← row 9
assessments.highest_possible_score ← row 10
assessments.title                ← null (the workbook has no titles)
```

An assessment whose `highest_possible_score` cell is blank **does not
exist** and must not be created.

---

## 6. Marks — `TERM<n>` rows 12–61 and 63–112

One row per learner, aligned by position with `INPUT`:

```
TERM1!B12 = '=INPUT!B12'      ← the roster is a formula reference
```

so **row N in a term sheet is the same learner as row N in `INPUT`**.
Read values, never formulas.

| Cell | → System |
|---|---|
| `F12:J12` etc. | `assessment_scores.raw_score` for the WW items |
| `N12:P12` | …for the PT items |
| `T12:V12` | …for ST1 / ST2 / TE |
| blank | **no score** — `raw_score = null`, *not* zero |

The blank-vs-zero distinction is load-bearing: the engine treats a null
as "not yet given" in running mode and as zero only at submission.
Importing blanks as zeros would silently fail learners.

---

## 7. What is deliberately NOT imported

| Workbook field | Why not |
|---|---|
| `TERM<n>!Z` Initial Grade | Derived. The engine computes it. |
| `TERM<n>!AA` TERM GRADE | Derived, via `VLOOKUP(…, NewTransmu, …)` |
| `TERM<n>!AB` DESCRIPTOR | Derived |
| `TERM<n>!K,Q,W / L,R,X / M,S,Y` | Totals, PS, WS — all formulas |
| `SUMMARY OF GRADES` | Entirely derived: final grade, descriptor, remark |
| `TEST/EXAM RESULT ANALYSIS` (`AD:AX`) | A per-item analysis block; superseded by the LOA module |
| `Helper`, `DO NOT DELETE` | Reference tables, not class data |

**Only raw marks and structure cross the boundary.** Grades are then
produced by the one authoritative path — Edge Function → canonical
engine → `period_grades` — which keeps a single source of truth for
every number in the system. Importing computed grades would create a
second one.

The workbook's own derived values are still useful: they should be
recomputed and **compared** in the preview, so a mismatch surfaces a
mapping error before anything is written. See §9.

---

## 8. Round-tripping the identity gap

Because the workbook has no learner identifier, a workbook exported
*from* this system should carry `student_number` and `lrn` in spare
columns. A subsequent import then matches on a stable key and the
name-matching path becomes the exception rather than the rule.

Not required for the first import. Worth doing before the second.

---

## 9. Preview contract

Nothing is written until the user confirms. The preview must state, per
workbook:

```
CLASS
  Grade 7 – Masipag · EPP · SY 2026-2027 · T. Dela Cruz
  → matches an existing class            (or) → will be created

LEARNERS                        50 rows
  38  matched by name                    ⚠ warning
   9  new students
   3  unresolved — choose a match

ASSESSMENTS                     33 across 3 terms
  11  already configured, unchanged
  22  will be created

MARKS                        1,247 values
  980  unchanged
  201  changed                           ⚠ shows before → after
   66  new

GRADE CHECK
  47 of 50 learners recompute to the grade in the workbook
   3 differ                              ⚠ inspect before importing
```

A period that is **not editable** — submitted, received, forwarded,
with the registrar, finalized or published — must be refused outright,
not overwritten. The same rule `save_assessments` already enforces.

---

## 10. Confirmed grading data (see the audit, §5)

The workbook's reference tables, which the system does **not** currently
hold:

- **`NewTransmu`** — a 41-band transmutation table that is *not* the one
  seeded. Passing requires an initial grade of **70**, not 60.
- **`DESCRIPTORS`** — Emerging (0–64), Developing (65–74), Connecting
  (75–79), Benchmarking (80–89), Advancing (90–100).
- **Per-subject weights** — 20/50/30 for core subjects, **20/60/20** for
  EPP and TLE. This *confirms* what was implemented from DO 015 s. 2026.
- **Final grade** = `ROUND(AVERAGE(T1, T2, T3), 0)`, remark `PASSED` at
  ≥ 75.

⚠️ All of it is the school's anticipation of an order DepEd had not yet
issued. Tracked in `20-assumptions-register.md`.

---

## 11. The four-quarter predecessor

`GRADE710_EDUKASYONSAPAGPAPAKATAO.xlsx` has the same architecture with
`EsP_Q1`…`EsP_Q4` and an `INPUT DATA` sheet. Its `DO NOT DELETE` sheet
carries the **old** weights (Filipino 30/50/20, Mathematics 40/40/20 …)
and the **old** transmutation table.

**It is not an import target.** The system is three-term, and the brief
is explicit that no four-quarter model is to be built. The value of this
file is comparative: it is how the reader can tell which parts of the
three-term workbook are genuinely new.

Should historical four-quarter records ever need importing, it would be
a separate, explicitly-labelled reader writing into a four-quarter
`academic_years` row — never a fallback the three-term importer silently
takes.

---

## 12. What was built

| Piece | Where |
|---|---|
| Parser | `app/src/lib/import/three-term.ts` + fixture + 32 tests |
| Planner | `app/src/lib/import/plan.ts` + 16 tests |
| Resolution / commit / history | `supabase/migrations/0026_import_center.sql` |
| Screen | `app/src/screens/ImportCenter.tsx`, route `import` |
| End-to-end | `app/e2e/import-center.mjs` — 16 checks |

### The split that makes the preview binding

`import_resolution` **reads and cannot write** — `stable`, SECURITY
INVOKER, no write path. `import_commit` **writes and cannot match** — it
takes ids a person confirmed and has no name matching to fall back on.

That is why "nothing is written until you confirm" is a property of the
system rather than a claim about the screen. If the commit could match
names, a second unreviewed matching run would decide the outcome and the
user would have approved something else.

### Marks are keyed by workbook row

Not by enrolment id. A learner being created has no id when the plan is
written, so a plan keyed by enrolment id silently drops every mark
belonging to a new learner — the rows simply fail to join. The row
number is the only identifier the workbook has, and the only one stable
from the file to the database. It also means **skipping a row leaves its
marks out with it**, rather than shifting them onto the learner below.

### Who may do what

`imports.execute` now reaches teachers, because the teacher holds the
workbook. What an import may then **do** is gated by the permissions
that already govern those acts, all checked inside `import_commit`:

| Act | Permission | Held by |
|---|---|---|
| Create a class | `classes.assign` | registrar, admin |
| Create a learner | `students.write` + `enrollments.write` | registrar, admin |
| Write assessments | `assessments.write` | teacher of the class |
| Write marks | `grades.encode` | teacher of the class |

So a teacher importing into a class they teach just works; a teacher
importing a workbook for a class nobody has created is told the
registrar must create it. The preview reports which of these the caller
actually holds, so the refusal is visible before anything runs.

⚠️ `import_commit` is SECURITY DEFINER, so **RLS enforces nothing inside
it**. `save_scores` relies entirely on the `assessment_scores` policies
for permission and editability, and those do not run for the definer.
Both checks are therefore explicit, and they run before any period is
touched.

### Still open

- **The GRADE CHECK in §9 is not built.** The parser reads the
  workbook's Initial Grade / TERM GRADE / DESCRIPTOR into
  `term.derived` and nothing consumes them yet. Recomputing each learner
  through the canonical engine and showing where the two disagree is the
  single highest-value addition left, because a disagreement means the
  mapping is wrong.
- **The per-mark before → after diff in §9** shows totals, not
  individual changes. It needs the current gradebook alongside the plan.
- **Round-tripping identifiers (§8)** is not built. Until it is, every
  import after the first still matches by name.
