# Legacy vs. New — Functional Audit

*Phase 0 of the legacy migration. Read before changing anything.*

| | |
|---|---|
| **Legacy** | `boyorejoshua/anhsgradingsystem` @ `2f0f044` |
| **New** | `boyorejoshua/Anhs-EClass-Record` |

---

## 0. The legacy repository, in full

Four files. That is the whole system.

| File | Size |
|---|---|
| `index.html` | 13.9 KB |
| `assets/js/main.js` | **183.4 KB** |
| `assets/css/style.css` | 35.2 KB |
| `README.md` | 233 B |

One vanilla-JS file, ~130 top-level functions, `localStorage` for
persistence, no backend, no build step, no tests.

Its own table of contents names 22 modules, and that list is the most
useful artifact in the repository — it is the teacher's mental model of
the product, written down by the person who built it.

**Note:** this is *not* the same V0 already vendored in the new repo at
`assets/js/main.js` (142.7 KB). The legacy repository is a larger,
further-developed build. Everything below is measured against the legacy
repository, not the vendored copy.

---

## 1. Legacy functionality found

| # | Module | Legacy entry points |
|---|---|---|
| 1 | Role selection (subject / advisory) | `selectRole`, `switchRole` |
| 2 | Class selector + saved classes | `applyClass`, `rememberClass`, `pickSavedClass` |
| 3 | **Record Book — Setup** | `renderSetup`, `doSaveSetup`, `renderHPS`, `setHPS` |
| 4 | **Record Book — Grade Entry** | `renderGradeEntry`, `setGr`, `selGQ`, `goToRow` |
| 5 | **Record Book — Bulk Entry** | `renderBulkEntry`, `loadBulk`, `saveBulk`, `updBulkItems` |
| 6 | **Record Book — Summary** | `renderRBSummary`, `renderSumClass`, `switchSumTab` |
| 7 | **Record Book — Analytics** | `renderAnalytics`, `renderAnalContent`, `goToMissingFromAnalytics` |
| 8 | **Record Book — LOA Reports** | `renderLOA`, `renderLOAContent`, `selLOAQ` |
| 9 | Grade Summary page (3 tabs) | `renderGradeSummaryPage`, `showGSTab`, `renderGSLOA` |
| 10 | **Student Detail** | `renderGSStudDetail`, `openGSStudent`, `sdGrade` |
| 11 | Daily attendance | `renderDailyAtt`, `setAtt`, `markAllP`, `clearDay` |
| 12 | Attendance summary | `renderAttSummary`, `updAttSum` |
| 13 | Consolidated grades (advisory) | `renderConsolidated`, `renderConsTable`, `handleImp` |
| 14 | Grading calculation | `calcQ`, `transmute`, `TRANS` |
| 15 | PDF exports (10) | `pdfSummary`, `pdfAnalytics`, `pdfLOA`, `pdfStudentDetail`, … |
| 16 | Excel exports (4) | `excelGrades`, `excelAtt`, `excelCons`, `excelLOA` |
| 17 | JSON handoff | `jsonExport` |
| 18 | Persistence | `save`, `load`, `saveFile`, `loadFile` (localStorage + .json) |
| 19 | Instructions / FAQ | `renderInstructions`, `toggleFAQ` |
| 20 | Zoom, dark mode, toast, modal | `applyZoom`, `toggleDarkMode`, `toast`, `openModal` |

### The grading calculation, exactly as written

```js
// legacy main.js:100
function calcQ(name, q) {
  const W = { ww: 0.30, pt: 0.50, qa: 0.20 };
  …
  wwPS = r2((wwS / wwH) * 100);  wwWS = r2(wwPS * W.ww);
  ptPS = r2((ptS / ptH) * 100);  ptWS = r2(ptPS * W.pt);
  qaPS = r2((qa / h.qa) * 100);  qaWS = r2(qaPS * W.qa);
  initial   = r2(wwWS + ptWS + qaWS);
  quarterly = transmute(initial);
}
```

Four things to note:

1. **The weights are hard-coded and obsolete.** 30/50/20 predates
   DO 015 s.2026, which sets core subjects to 20/50/30 and MAPEH/EPP-TLE
   to 20/60/20.
2. **The learner's key is their NAME** — `cd.grades[q][name]`. Two
   learners called *Santos, Maria* share one record; a corrected
   spelling orphans a term's marks.
3. **Ten items per component, hard capped** — `Array(10).fill(null)`.
4. **`qa` is a scalar**, so the ST1 / ST2 / Term Exam split DO 015
   requires cannot be represented at all.

The **transmutation table** is 41 bands and is *byte-identical* to the
one already seeded in the new system. That port was faithful.

---

## 2. ⚠️ LOA — twice corrected, now settled

**LOA = Learning Outcomes Assessment.** Confirmed against the school's own
`CLASSRECORD_Template.xlsx`, sheet *LOA Summary Reports*, whose closing
line reads verbatim:

> END OF YOUR LEARNING OUTCOMES ASSESSMENT (LOA) SUMMARY REPORTS.

Two earlier readings were wrong and are recorded here so neither is
reintroduced:

| Reading | Source | Verdict |
|---|---|---|
| "Leave of Absence" — an attendance report | the migration brief, Phase 10 | ❌ Wrong. `grep -ci "absent\|attendance\|absence"` across the whole legacy LOA module → **0 matches** |
| "Level of Achievement" | inferred from the legacy JavaScript | ❌ Close in spirit, wrong in name |
| **"Learning Outcomes Assessment"** | the school's workbook | ✅ Authoritative |

It has no attendance component whatsoever. Attendance reporting is a
separate, real need — SF2 and SF4 — tracked in `docs/12-mvp-and-roadmap.md`.

### What the report actually is

Five tables. Each carries **one row per class section**, not per learner:
it is filed per subject across sections, so a teacher with four sections
of Grade 7 English files one sheet and the department coordinator reads
down the column for the section that is behind.

| # | Table | Banded on | Scale |
|---|---|---|---|
| 1 | Pre-test / diagnostic | raw ÷ No. of Items | 5-band proficiency |
| 2 | Written Works | raw ÷ HPS | 5-band proficiency |
| 3 | Performance Tasks *(from Percentage Score)* | PS % | 7-band descriptor |
| 4 | Quarterly Assessment | raw ÷ No. of Items | 5-band proficiency |
| 5 | Quarterly Grades *(from Transmuted Grade)* | the grade | 7-band descriptor |

Proficiency tables also carry **No. of Items / HPS, HSO, LSO, Mean, MPS**
and a `TOTAL (to check entries)` column that reads 100 only when every
learner was banded — its whole purpose is to expose a learner with no
score.

### The two band scales, from the workbook's own COUNTIFS

**Proficiency** (rows 4, 23, 62). Half-open on every boundary but the top:

| Band | Range |
|---|---|
| Not Proficient | 0% – 24% |
| Low Proficient | 25% – 49% |
| Nearly Proficient | 50% – 74% |
| Proficient | 75% – 89% |
| Highly Proficient | 90% – 100% |

These match the thresholds already derived from the legacy JavaScript
exactly — that port was faithful.

**Descriptor** (rows 42–44, 81–83). Note that *Outstanding* spans three
ranges under one merged heading:

| Band | Range |
|---|---|
| Did Not Meet Expectations | 74% & below |
| Fairly Satisfactory | 75% – 79% |
| Satisfactory | 80% – 84% |
| Very Satisfactory | 85% – 89% |
| Outstanding | 90% – 94% · 95% – 97% · 98% – 100% |

### What is implemented, and what is not

Implemented in `app/src/lib/loa.ts`, `app/src/screens/RecordBook.tsx`
(`RecordBookLoa`), tested in `loa.test.ts` and `e2e/loa-report.mjs`:
all five band boundaries, both scales, the statistics columns, the check
column, section rows with a weighted Total row, and CSV export.

**Not implemented:** the pre-test / diagnostic table. A diagnostic sits
outside the grading scheme, and there is nowhere in the data model to put
one yet. Inventing it from a component would print a number under a
heading that does not describe it.

**Which scale each component uses** is data, in `SECTION_SCALES` — keyed
by component code, defaulting to proficiency for a code the table does
not name. It is not an `if (code === 'PT')` in a loop, so a school whose
template differs edits one table.

⚠️ **The template's currency is unconfirmed.** The school supplied it with
the caveat that it may not be the latest issuance. Recorded in
`docs/18-assumptions-register.md`; the seven-band Performance Task scale
is the most likely thing to have been revised.

### One thing the workbook confirmed outright

Its hidden `transmu` sheet is **41 bands, 0 → 60 through 100 → 100** —
byte-identical to the table already seeded in `supabase/seed.sql`.

## 3. Already implemented in the new system

| Capability | Where | Notes |
|---|---|---|
| Grade Entry | `screens/Gradebook.tsx` | Keyboard model, validation, autosave, retry |
| Bulk Entry | same file | A **mode**, not a page — paste a TSV block from Excel |
| Grading engine | `lib/grading/` | Configurable schemes, component tree, transmutation as data |
| Transmutation | `supabase/seed.sql` | The legacy 41-band table, verified identical |
| Attendance capture | `screens/ClassAttendance.tsx` | On the school's own calendar and status rows |
| Submission workflow | `screens/ClassSubmission.tsx` | Validate → confirm → RPC |
| Registrar review | `screens/RegistrarQueue.tsx` | Return / approve / finalize / publish |
| Student portal | `screens/StudentPortal.tsx` | Published records only |
| SF10 | `screens/Sf10Preview.tsx` + `rds.sf10_jhs` | Period-array shaped, not q1..q4 |
| Multi-tenancy, RLS, roles | `supabase/migrations/0001`–`0019` | Forced RLS on every table |
| Excel/CSV export | `lib/export.ts` | CSV; XLSX deliberately deferred |

---

## 4. Missing before this phase

| Legacy module | Status |
|---|---|
| Record Book **Setup** | ❌ Absent — assessments could only be seeded |
| Record Book **Summary** | ❌ Absent |
| Record Book **Analytics** | ❌ Absent |
| Record Book **LOA** | ❌ Absent |
| **Student Detail** | ❌ Absent |
| Record Book as a grouped workflow | ❌ Absent |

**The Setup gap was the most serious.** With no way to create
assessments, a teacher opening Term 3 found an empty gradebook and no
route forward — the term could not be started at all.

---

## 5. Legacy logic that SHOULD migrate

| Rule | Verdict |
|---|---|
| PS = (Σ raw ÷ Σ HPS) × 100 per component | ✅ Migrated — already how the engine works |
| Weighted score = PS × weight | ✅ Migrated |
| Initial = Σ weighted; period grade = transmute(initial) | ✅ Migrated |
| 41-band transmutation table | ✅ Already present, verified identical |
| Teacher configures item count and max score per component | ✅ Migrated — migration 0019 |
| Summary = per-learner component breakdown + initial + grade + remark | ✅ Migrated |
| Analytics = size, average, hi/lo, pass/fail, missing, distribution | ✅ Migrated |
| LOA proficiency bands ≥90 / ≥75 / ≥50 / ≥25 / else | ✅ Migrated — **confirmed** against the school's workbook |
| Student Detail = one learner's assessment breakdown | ✅ Migrated |
| Distribution bands 96–100 / 91–95 / … / 75 / below 75 | ✅ Migrated, flagged as legacy-derived |

## 6. Legacy logic that should NOT migrate

| Thing | Why not |
|---|---|
| `{ww:.30, pt:.50, qa:.20}` | Superseded by DO 015 s.2026. Weights are scheme rows now |
| Ten-item cap | A UI limit encoded as a data structure |
| `qa` as a scalar | Cannot express ST1 / ST2 / TE |
| Learner keyed by name | Corrupts on rename or duplicate names |
| Q1–Q4 hard-coding | The new system is period-driven; ANHS is on trimesters |
| `localStorage` + 15-minute forced download | Supabase is the source of truth |
| `btoa()` "auth" | Encoding, not hashing |
| Ten `pdf*()` functions via `window.print()` | Official documents need the numbered, archived pipeline in docs/11 |
| Separate Bulk Entry page | It is a mode of the grid here, and a better one |
| Zoom controls | The browser already does this |

---

## 7. New architecture that must be preserved

Untouched by this phase: multi-tenant schema with forced RLS; the
`rds.*` contract layer; workflow RPCs with audit rows; Supabase Auth with
the tenant in `app_metadata`; the route model in `nav.ts`; the design
system; the grading engine (no bug was found in it).

---

## 8. Database changes required

Only one: **migration 0019**, `public.save_assessments(class, period, jsonb)`.

No table altered, no column added. Assessments were already rows; nothing
could write them.

It refuses to run once a period is no longer editable, and refuses to
delete an assessment that already carries marks.

---

## 9. Security considerations

| Concern | Handling |
|---|---|
| A teacher reconfiguring another teacher's class | `assessments_write` RLS policy; the RPC is SECURITY INVOKER |
| Reconfiguring after submission | Refused explicitly, and by policy |
| Deleting scored assessments | Refused — cascade would destroy marks |
| Analytics leaking other classes | Computed client-side from the caller's own `gradebook()` payload |
| LOA leaking learner names | Same payload the teacher already sees |
| Student Detail and IDOR | Keyed by `classEnrollmentId` from the loaded roster; RLS decides the roster |

No new `anon` surface. The new function is revoked from `public` and
`anon`, consistent with migrations 0016–0017.

---

## 10. Risks

| Risk | Severity |
|---|---|
| ~~Period grades still not materialised~~ — closed by migration 0020 and the `compute-period-grades` Edge Function | Resolved |
| ~~LOA proficiency thresholds are legacy-derived~~ — confirmed against `CLASSRECORD_Template.xlsx`. The **seven-band descriptor scale** and the template's currency remain unverified | Medium |
| Analytics distribution bands likewise legacy-derived | Low |
| Deleting an assessment cascades to scores | Medium — guarded |
| Bundle now 550 kB in one chunk | Low |
| Advisory "Consolidated Grades" still absent — it needs materialised period grades first | Medium |

---

## 11. Recommended implementation order

1. ✅ Migration 0019 — assessment configuration
2. ✅ `lib/recordbook.ts` — Summary / Analytics / LOA rules, pure and tested
3. ✅ Record Book tabs: Setup · Grade Entry · Summary · Analytics · LOA
4. ✅ Student Detail
5. ✅ Legacy-parity tests
6. ✅ Materialise `period_grades` via an Edge Function running the shared engine
7. ⏳ Consolidated Grades (needs 6)
8. ⏳ SF2 / SF4 attendance forms
9. ⏳ XLSX export, reusing V0's DepEd workbook shape
