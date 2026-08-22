# Legacy → New Function Migration Map

*Phase 1. One row per legacy feature, in the structure the brief asked for.*

Legend: ✅ implemented · ⏳ deferred (with reason) · ⛔ deliberately not migrated

---

## 1. Record Book — Setup ✅

| | |
|---|---|
| **Legacy** | `renderSetup`, `doSaveSetup`, `renderHPS`, `setHPS` |
| **Legacy impl** | Writes `cd.hps[q] = { ww:[…10], pt:[…10], qa:number }` into localStorage |
| **Business rule** | The teacher decides, per component per period, how many items there are and what each is out of |
| **New screen** | Class → Record Book → **Setup** |
| **New data** | `assessments` rows (`class_id`, `academic_period_id`, `grade_component_id`, `ordinal`, `title`, `highest_possible_score`) |
| **New RPC** | `public.save_assessments(class, period, jsonb)` — migration 0019 |
| **Trimester adaptation** | Keyed by `periodId`, never `q`. Components come from the class's grading scheme, so a MAPEH class shows 20/60/20 and a core class 20/50/30 without the screen knowing either number |
| **Divergence** | No ten-item cap; `qa` scalar replaced by real rows, so ST1/ST2/TE each get one |

## 2. Record Book — Grade Entry ✅ *(already present)*

| | |
|---|---|
| **Legacy** | `renderGradeEntry`, `setGr`, `selGQ`, `goToRow` |
| **Business rule** | Enter raw scores per learner per assessment; the system computes |
| **New screen** | Class → Record Book → **Grade Entry** |
| **New data** | `assessment_scores` via `public.save_scores(jsonb)` |
| **Trimester adaptation** | The period comes from the route; the grid renders whatever periods the year declares |
| **Improved** | Keyboard model, debounced autosave, dirty tracking, retry-without-loss, gaps filter, mobile cards |

## 3. Record Book — Bulk Entry ✅ *(as a mode)*

| | |
|---|---|
| **Legacy** | `renderBulkEntry`, `loadBulk`, `saveBulk` — a separate page |
| **Business rule** | Enter many scores fast; get out of Excel without feeling slower |
| **New screen** | The gradebook itself — paste a TSV block from Excel; fills right and down |
| **Divergence** | Not a page. A second screen would be a worse version of a feature the grid already has |

## 4. Record Book — Summary ✅

| | |
|---|---|
| **Legacy** | `renderRBSummary`, `renderSumClass`, `switchSumTab` |
| **Business rule** | One row per learner: component PS + weighted score, initial grade, period grade, remark |
| **New screen** | Class → Record Book → **Summary** |
| **New logic** | `lib/recordbook.ts` → `summaryRows()` |
| **Trimester adaptation** | Computed for the selected `periodId`; no four-quarter assumption anywhere |
| **Added** | "Needs attention only" filter; CSV export; click a learner to open Student Detail |

## 5. Record Book — Analytics ✅

| | |
|---|---|
| **Legacy** | `renderAnalytics`, `renderAnalContent`, `goToMissingFromAnalytics` |
| **Business rule** | Class size, average, highest, lowest, passing, failing, missing, distribution |
| **New screen** | Class → Record Book → **Analytics** |
| **New logic** | `lib/recordbook.ts` → `analytics()` |
| **Trimester adaptation** | Legacy `q===0` meant "all four quarters, all must exist". Replaced by per-period analytics; a cross-period view needs materialised `period_grades` |
| **Divergence** | Pass/fail counted against `scheme.passMark`, not a literal 75. Ungraded learners excluded from the average rather than counted as zero |
| **Added** | Component averages; a "needs attention" list with the reason per learner |

## 6. Record Book — LOA Reports ✅ ⚠️

| | |
|---|---|
| **Legacy** | `renderLOA`, `renderLOAContent`, `excelLOA` |
| **⚠️ Meaning** | **Level of Achievement** — proficiency banding from grade entries. **Not** Leave of Absence, and not attendance-related in any way (0 attendance references in the module) |
| **Business rule** | Band each component's percentage score: ≥90 Highly Proficient · ≥75 Proficient · ≥50 Nearly Proficient · ≥25 Low Proficient · else Not Proficient. Then band the final grade by descriptor |
| **New screen** | Class → Record Book → **LOA** |
| **New logic** | `lib/recordbook.ts` → `loaReport()`, `PROFICIENCY_BANDS` |
| **Trimester adaptation** | Per period, not per quarter |
| **Divergence** | Grade distribution uses the **scheme's** descriptor bands, not a second hard-coded scale |
| **⏳ Not carried** | The Diagnostic Test section (`cd.diag`: items / highest / lowest / MPS). It is a pre-test the schema has nowhere to store, and inventing a table for an unvalidated report section is the wrong order of operations |
| **Requires validation** | The proficiency thresholds are legacy-derived, not traced to a DepEd issuance in either repository |

## 7. Student Detail ✅

| | |
|---|---|
| **Legacy** | `renderGSStudDetail`, `openGSStudent`, `sdGrade`, `pdfStudentDetail` |
| **Business rule** | One learner's full breakdown: every assessment, component subtotals, initial and period grade |
| **New screen** | Record Book → Summary → click a learner |
| **New data** | Identity is `classEnrollmentId` → `enrollment` → `student` |
| **Divergence** | Legacy keys on the learner's NAME. Here a rename is a display change and nothing else; no duplicate student object per period |

## 8. Grading calculation ✅ *(validated, not migrated)*

| | |
|---|---|
| **Legacy** | `calcQ`, `transmute`, `TRANS` |
| **Business rule** | PS → weighted → initial → transmute → period grade |
| **New logic** | `lib/grading/` — unchanged by this phase |
| **Validation** | 12 parity tests against hand-worked legacy arithmetic. See `docs/grading-calculation-validation.md` |
| **Divergence** | One, deliberate: an unscored component is dropped and its weight redistributed, rather than counted as zero |

## 9. Attendance ✅ *(already present)*

| | |
|---|---|
| **Legacy** | `renderDailyAtt`, `setAtt`, `markAllP`, `renderAttSummary` |
| **New screen** | Class → **Attendance** |
| **New data** | `attendance_records` + `calendar_days` + `attendance_statuses`; `public.save_attendance` |
| **Divergence** | Statuses are per-school rows, not hard-coded P/A/L/E. Marking is refused on a non-class day, because that would corrupt the expected-days denominator SF2/SF4 divide by |
| **⏳ Deferred** | SF2 and SF4 monthly forms |

## 10. Consolidated Grades (advisory) ⏳

| | |
|---|---|
| **Legacy** | `renderConsolidated`, `renderConsTable`, `handleImp`, `jsonExport` — teachers emailed JSON files to the adviser |
| **Business rule** | One row per learner across every subject, for the general average |
| **Blocked on** | Materialised `period_grades`. Reachable from the adviser menu, states this when opened |
| **Divergence when built** | No JSON handoff — every subject is already in the same database |

## 11. Exports — partial ✅ / ⏳

| Legacy | Status |
|---|---|
| `excelGrades` (DepEd workbook) | ⏳ Deferred — V0 already encodes the layout; docs/10 says port it, don't re-derive it |
| `excelLOA` | ✅ As CSV from the LOA screen |
| Summary / gradebook export | ✅ As CSV |
| `pdfSummary`, `pdfAnalytics`, `pdfLOA`, `pdfStudentDetail` … | ⏳ Print CSS is in place; numbered, archived PDFs belong to docs/11 |
| `jsonExport` | ⛔ Obsolete — a shared database replaces the handoff |

## 12. Persistence, auth, roles, zoom ⛔

| Legacy | Why not |
|---|---|
| `localStorage` + forced 15-minute download | Supabase is the source of truth |
| `btoa()` password check | Encoding, not hashing |
| Role picker with no enforcement | Roles come from `user_roles`; RLS is the boundary |
| Zoom controls | The browser already does this |

---

## Coverage

| Legacy module | Status |
|---|---|
| Setup · Grade Entry · Bulk Entry · Summary · Analytics · LOA | ✅ all six |
| Student Detail | ✅ |
| Grading calculation | ✅ validated |
| Attendance capture | ✅ |
| Consolidated Grades | ⏳ blocked on period grades |
| Excel/PDF exports | partial — CSV now, XLSX and numbered PDFs deferred |
| localStorage, btoa auth, JSON handoff, zoom | ⛔ intentionally dropped |
