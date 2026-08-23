# Platformization Audit

*Phase 1 of the platformization brief. Read before changing anything.*

| | |
|---|---|
| **Audited** | `boyorejoshua/Anhs-EClass-Record` @ `82f0315` (main) |
| **Date** | 23 August 2026 |
| **Question** | What must change for this to become the Mendtrix Academic Records Platform, with ANHS as the first tenant? |

---

## 0. The short answer

**Less than the brief assumes.** The multi-tenant architecture chosen at
planning time has held: `school_id` is on every tenant-scoped table, RLS
is forced everywhere and derives the tenant from a verified JWT, and the
student/enrollment split the brief asks for in Phases 2, 3 and 25 is
**already in the schema and already correct**.

What is missing is not architecture. It is:

1. **Screens** — there is no Student Management module, no global
   Analytics or LOA entry point, and no Import Center.
2. **One live correctness bug** — the seeded transmutation table and
   descriptors are the *four-quarter* ones. Under the three-term
   calendar the school is using different ones. §5.
3. **Two hard-coded strings** — the sign-in screen names ANHS. §3.

Everything else on the brief's list is either already true or is UI work
on top of a model that already supports it.

---

## 1. Student identity vs. enrollment — ALREADY CORRECT

The brief (Phases 2, 3, 25) asks that a student not become a duplicate
when they move from Grade 9 to Grade 10, or from Pearl to Emerald. The
schema already models exactly the chain the brief draws:

```
students            one row per PERSON, per school. Never duplicated.
   ↓                id · student_number · lrn · names · sex · birth_date
enrollments         one row per ACADEMIC YEAR
   ↓                academic_year_id · grade_level_id · section_id
                    status · promotion_status · general_average
class_enrollments   one row per SUBJECT CLASS
   ↓                class_id · enrollment_id
grades              per period, against the class enrolment
```

A section change edits `enrollments.section_id`. A grade-level change
creates a **new** `enrollments` row for the new year, pointing at the
**same** `students.id`. Academic history is the set of enrollments.

**Nothing to migrate.** `students` already carries LRN, student number,
sex, birth date, address, and a `portal_user_id` linking to the auth
account. Verdict: **build the UI, leave the model alone.**

---

## 2. Multi-tenancy — ALREADY CORRECT

| Control | Status |
|---|---|
| `school_id` on every tenant-scoped table | ✅ |
| `FORCE ROW LEVEL SECURITY` on every table | ✅ verified |
| Tenant from verified JWT, never a client parameter | ✅ `app.current_school_id()` |
| `schools` table carries the config the brief lists | ✅ code, name, govt_school_id, region, division, district, address, logo_url, letterhead_url, timezone |
| Two tenants seeded with *different* period structures | ✅ ANHS three-term, Demo four-quarter |

The second seeded tenant is the thing that matters here: the app has
been running against two schools with **different academic calendars**
since M0. That is what makes the multi-school claim credible rather than
aspirational.

---

## 3. ANHS-specific logic — two real occurrences

A sweep for `anhs|angono` across the application source returns 22 hits.
All but two are legitimate:

| Location | Verdict |
|---|---|
| `data/sf10.ts` (5 hits) | ✅ **Demo fixture data.** Keep. |
| `lib/recordbook.ts:5` | ✅ A comment citing the legacy repo. Keep. |
| `supabase/seed.sql` (11 hits) | ✅ **Seed data for the first tenant.** Keep. |
| **`App.tsx:197`** | ❌ `<SignIn schoolName="Angono National High School" />` |
| **`SignIn.tsx:36`** | ❌ `<div className="side-mark">ANHS</div>` |

Both are on the sign-in screen — the one place that renders *before* a
session exists, so it cannot read the tenant from a JWT. That is a real
constraint, not an oversight, but the answer is host-based branding
(subdomain → school), not a literal.

### Other hard-coding categories, swept

| Looked for | Found |
|---|---|
| Hard-coded period names (`'Term 1'`, `'Q1'`) in logic | **none** — periods are data throughout |
| Hard-coded grade levels | none outside fixtures |
| Hard-coded subjects, sections, teachers | none outside seed |
| Hard-coded pass mark | ⚠️ `>= 75` for chip **colour** in `Gradebook.tsx:445` and `StudentPortal.tsx:103`. Cosmetic, but a school with a different pass mark gets the wrong colour. Should read `scheme.passMark`. |

---

## 4. Terminology — one rename owed

`academic_years.period_structure` accepts
`('quarter','semester','trimester','custom')`.

The brief is explicit: *"Do NOT describe the new system internally as a
'trimester system'."* DepEd's own wording in DO 009 s. 2026 is
**Three-Term School Calendar**. `trimester` should become `three_term`.

This is a check-constraint change plus a data update, touching one
column and the TypeScript union that mirrors it. Low risk, worth doing
before more code accretes around the old word.

---

## 5. ⚠️ THE ONE URGENT FINDING — the grading data is for the wrong calendar

The school supplied `EClassRecordEditableEPPandTLE.xlsx`, which is a
**three-term** class record (sheets `INPUT`, `TERM1`, `TERM2`, `TERM3`).
It carries grading data that differs from what this system has seeded.

### 5a. The transmutation table is different

The workbook holds **two** tables. The old one, named
`TRANSMUTATION_TABLE`, is byte-identical to what `seed.sql` already has.
The one the three-term sheets actually use is named **`NewTransmu`**, and
it is materially harsher:

| Initial grade | Old table → | `NewTransmu` → |
|---|---|---|
| 0 – 3.99 | 60 | 60 *(band runs 0–39.99)* |
| 60 | **75** | 70 |
| 70 | 81 | **75** |
| 74.4 | 84 | 76 |
| 90 | 94 | 92 |
| 100 | 100 | 100 |

**A learner needs an initial grade of 70 to pass, not 60.** Every grade
this system computes for a three-term class is currently transmuted with
the wrong table.

### 5b. The descriptors are different

| Old (in `seed.sql`) | New (in the workbook) |
|---|---|
| Did Not Meet Expectations | **Emerging** (0–64) |
| Fairly Satisfactory | **Developing** (65–74) |
| Satisfactory | **Connecting** (75–79) |
| Very Satisfactory | **Benchmarking** (80–89) |
| Outstanding | **Advancing** (90–100) |

These are the MATATAG-style descriptors. Nothing in the system knows
them.

### 5c. The component weights are CONFIRMED

The workbook's `Helper` sheet carries per-subject weights, and they match
what was implemented from DO 015 s. 2026 exactly:

| Subject | WW | PT | ST/TE |
|---|---|---|---|
| Filipino, English, Mathematics, Science, Araling Panlipunan, GMRC, Values Education | 20% | 50% | 30% |
| **EPP, TLE** | 20% | **60%** | 20% |

The `TERM1` sheet splits the exam component into **ST1 / ST2 / TE** —
precisely the two-level component tree `grade_components.parent_component_id`
was built for. This is independent confirmation that the engine's shape
is right.

### 5d. ⚠️ But none of it is official yet

Two pieces of evidence, and they agree:

1. The workbook's own cell `INPUT!A3` reads
   **"(Waiting for the Official DepEd Order)"**.
2. DO 009 s. 2026, the three-term calendar order, says verbatim:
   > *"A separate issuance on classroom assessments, grading system, and
   > awards and recognition shall be released."*

So the three-term grading rules had **not been issued** as of 16 April
2026. The workbook's `NewTransmu` and descriptors are the school's
anticipation of them.

**This is precisely the case the architecture was designed for.**
`transmutation_tables` and `grading_schemes` both carry
`effective_from_year_id`. Adopting a new table is a data operation
against a school year, not a code change — and when the official order
lands, superseding it is another one. No migration of computed grades is
needed because `period_grades` stores `scheme_snapshot`: a grade already
issued keeps the rules it was issued under.

**Recommendation:** seed the workbook's tables as the SY 2026–2027
three-term scheme, marked clearly as school-supplied and pending
official issuance, and register it in the assumptions register.

---

## 6. What already exists (do not rebuild)

| Capability | Where | State |
|---|---|---|
| Canonical grading engine | `lib/grading/` | Pure, 28 tests, component tree, transmutation as data |
| One engine in two runtimes | `scripts/vendor-grading-engine.mjs` | Copy is generated and diff-tested; cannot drift |
| Authoritative persistence | migration 0020 + Edge Function | service_role sole writer, idempotent, versioned |
| Submission workflow | migrations 0010, 0022 | 10 states, chain of custody, audited |
| Record Book | `screens/RecordBook*.tsx` | Setup · Grade Entry · Summary · Analytics · LOA |
| LOA | `lib/loa.ts` | Built to the school's own workbook, 18 tests |
| Registrar + adviser queues | `screens/RegistrarQueue`, `AdviserQueue` | Receive / forward / approve / finalize / publish |
| Student portal | `screens/StudentPortal.tsx` | Published records only, RLS-enforced |
| SF10 | `rds.sf10_jhs` + preview | Period-array shaped |
| Attendance capture | `screens/ClassAttendance.tsx` | On the school's own calendar |
| Multi-tenant DB + RLS | migrations 0001–0022 | Forced RLS, tenant from JWT |

---

## 7. What is missing

| Brief phase | Gap | Size |
|---|---|---|
| 2–4 | **Student Management module** — no list, search, add, edit, or profile screen. Model is ready. | Medium |
| 6 | **Global LOA Reports** — LOA exists only inside a class. `lib/loa.ts` is already pure and cohort-shaped, so this is a screen plus a year-wide cohort loader. | Small |
| 7 | **Global Analytics** — same shape. `lib/recordbook.ts#analytics` is already pure. | Small |
| 8 | **Reports hub** — Reports is currently a per-class export menu. | Medium |
| 9–19 | **Import Center** — nothing exists. The largest single item. | **Large** |
| 20–21 | Two sign-in literals; `trimester` → `three_term` | Small |
| 22 | Navigation for the new modules | Small |
| — | **Adviser cannot read their own section's grades.** `grades.read.section` is granted and no policy consults it. Blocks Consolidated Grades. | Small |

---

## 8. Import Center — what the real template dictates

Full field-by-field mapping in
[`three-term-import-mapping.md`](three-term-import-mapping.md). The
structural findings that shape the design:

- **The workbook identifies a CLASS, not just students.** `INPUT` rows
  4–7 carry Region, Division, School Name, School ID, School Year, Grade
  & Section, Teacher, and Subject. That is everything needed to resolve
  or create a class — which is what the school asked for.
- **Learners are keyed by name and position only.** `INPUT!B12:B61` are
  male learners, `B63:B112` female. **There is no LRN or student number
  anywhere in the workbook.** This is the single hardest problem in the
  import, and it directly contradicts the brief's Phase 11 rule *"Do NOT
  use name alone as the primary matching key."* Addressed in the mapping
  doc; it needs a human-in-the-loop match step.
- **Scores are raw marks per item**, with highest-possible in row 10 —
  which maps one-to-one onto `assessments.highest_possible_score` and
  `assessment_scores.raw_score`. No grade needs to be imported: the
  system recomputes from the marks, which keeps the authoritative
  pipeline intact.
- Formulas, merged cells and hidden helper sheets must be ignored, not
  parsed. Read values, not formulas.

---

## 9. Security review after the new surface

| Concern | Current state |
|---|---|
| Student isolation | ✅ `period_grades_read_student` requires `class_enrollment_is_mine` **and** the period be published. No id is accepted from the client. |
| Teacher scope | ✅ `app.teaches_class` |
| Adviser scope | ⚠️ Can see their section's classes and submissions (0022), **cannot read its grades**. Gap. |
| School isolation | ✅ Forced RLS, tenant from JWT |
| Import writes | ❌ **Does not exist yet.** Must run as the caller under RLS, never as `service_role`, except where the authoritative-grade path already justifies it. |

---

## 10. Risks

| Risk | Severity |
|---|---|
| **Three-term transmutation and descriptors not yet seeded** — every three-term grade is currently computed with the four-quarter table | **High** |
| The school's three-term grading data is unofficial and will change when DepEd issues the assessment order | **High** — but absorbed by design; it is versioned data |
| The three-term workbook carries **no learner identifier**, so import matching must fall back on names | **High** — needs a confirm step, not an algorithm |
| Adviser cannot read section grades, blocking Consolidated Grades and SF9 | Medium |
| Import writing to academic records without a preview | Medium — not yet built; must not ship without one |
| Sign-in branding hard-coded | Low |

---

## 11. Recommended order

1. ✅ This audit
2. **Seed the three-term grading scheme** — the live correctness gap (§5)
3. `trimester` → `three_term`; de-hard-code sign-in branding
4. Student Management (model is ready; this is screens)
5. Global Analytics and Global LOA (both are pure functions already)
6. Adviser section-grade visibility → Consolidated Grades
7. Import Center, in the brief's own sub-order: parse → detect → map →
   validate → preview → confirm → execute → history
8. Reports hub
9. Multi-school configuration surface
