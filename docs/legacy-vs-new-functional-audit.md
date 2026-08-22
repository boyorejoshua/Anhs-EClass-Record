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

## 2. ⚠️ LOA does not mean what the brief assumed

**LOA = Level of Achievement.** It is a proficiency-band report computed
from grade entries. It has no attendance component whatsoever.

Evidence:

- The in-app help: *"Level of Achievement reports automatically computed
  from your grade entries. Shows proficiency bands for Written Works,
  Performance Tasks, Quarterly Assessment, and final Quarterly Grades."*
- `grep -ci "absent|attendance|absence"` across the entire LOA module →
  **0 matches**.
- `excelLOA` sheet sections: Diagnostic Test Results, Written Works
  Achievement, Performance Tasks Achievement, Quarterly Assessment
  Achievement, Quarterly Grade distribution.

The migration brief (Phase 10) described LOA as attendance-based —
"total absences", "attendance status", "reason where available" — and
directed that it be rebuilt on the attendance model.

**Building it that way would have replaced the report the school
actually files with a different report of the same name**, and lost the
real one. LOA has therefore been implemented as achievement banding,
matching the legacy reference, per the brief's own governing rule:
*extract the business rules from the legacy system*.

Attendance reporting is a separate, real need — SF2 and SF4 — and is
tracked as such in `docs/12-mvp-and-roadmap.md`.

---

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
| LOA proficiency bands ≥90 / ≥75 / ≥50 / ≥25 / else | ✅ Migrated, flagged for validation |
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
| **Period grades still not materialised** — nothing writes `period_grades`, so Summary and Analytics compute in the browser and the student portal has no stored number | **High** |
| LOA proficiency thresholds are legacy-derived, not confirmed against a division-office issuance | Medium |
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
6. ⏳ Materialise `period_grades` via an Edge Function running the shared engine
7. ⏳ Consolidated Grades (needs 6)
8. ⏳ SF2 / SF4 attendance forms
9. ⏳ XLSX export, reusing V0's DepEd workbook shape
