# Phase 0 — Current-State Audit & Architecture Baseline

**Status:** COMPLETE · **Date:** 28 August 2026 · **Commit audited:** `2547655` (main, after PR #40)

No production functionality was modified during this audit. Two findings
are marked **fix immediately** and are described precisely enough to act
on; neither was applied, because Phase 0 is read-only by instruction.

---

## Phase status

| Phase | State |
|---|---|
| **0 — Current-state audit** | **COMPLETE** (this document) |
| 1 — Student master records + enrollment | Largely built; see §C for the specific gaps |
| 2 — Academic year + structure | Schema complete, **no UI** |
| 3 — Registrar workflow | Built and exceeds the brief; **never exercised in production** |
| 4 — Import Center | Built for the three-term ECR; other importers missing |
| 5 — Grade lifecycle + corrections | Lifecycle built; **correction workflow is a table with no code** |
| 6 — Student portal | Read path built and safe; **no account provisioning** |
| 7 — Reports & documents | SF10 only; document engine unbuilt |
| 8 — Global analytics + LOA | **Already done** |
| 9 — SHS | Grade levels only |
| 10 — Multi-school | Isolation solid; onboarding path missing |
| 11 — Performance & security | See §M, §N |
| 12 — UX redesign | Not started (correctly) |

---

## A. Current architecture

### Scale

| | |
|---|---|
| Migrations | 40 (10,169 lines of SQL) |
| Tables | 46, all `FORCE ROW LEVEL SECURITY` |
| Database functions | 111 `public` · 28 `rds` · 39 `app` |
| React screens | 28 (17,585 lines of TS/TSX) |
| Edge Functions | 2, both `ACTIVE` with `verify_jwt: true` |
| Unit tests | 213 across 11 files |
| E2E suites | 18 (~300 assertions) |
| Docs | 33 markdown files |

### Layers

**Frontend** — React + TypeScript + Vite, single-page, no server runtime.
Deployed to Vercel from `app/`. Routing is a hand-written state model in
`app/src/nav.ts`, not a router library: `Route { id, classId, tab,
studentId }`. Every route resolves to a screen or to an explicit
`NotAvailable`, and `nav.test.ts` asserts that every menu entry for every
role maps to a real screen — adding a dead button fails the build.

**Data access** — one `DataSource` interface (`app/src/data/source.ts`,
67 methods) with two implementations: `supabase.ts` (RPC calls) and
`fixtures.ts` (2,145 lines of demo data). The demo implementation is
gated by `VITE_DEMO_MODE`, which is off in production builds. This is
the single most valuable structural decision in the codebase: every
screen is written against one contract and can be exercised without a
database.

**Backend** — Supabase Postgres. Reads go through `rds.*` functions
(SECURITY DEFINER, returning `jsonb` contracts shaped for a screen);
writes that carry policy go through `public.*` RPCs that check
`app.has_permission(...)` and call `app.write_audit(...)`. The client
never touches a table directly for anything that matters.

**Authentication** — Supabase Auth. Tenant and identity come from the
verified JWT via `app.current_school_id()`, `app.current_user_id()`,
`app.current_student_id()` — all `STABLE`, never from a client
parameter.

**Authorization** — a permission catalogue (43 permissions) joined
through `role_permissions` → `roles` → `user_roles`. Roles are
composable: a teacher who also advises holds both, which V0's mutually
exclusive role column could not express.

**Grading engine** — `app/src/lib/grading/index.ts`, one module,
executed in two runtimes. `scripts/vendor-grading-engine.mjs` copies it
verbatim into `supabase/functions/compute-period-grades/grading/`, and
`edge-function.test.ts` regenerates and diffs the copy on every build.
"One canonical engine" is mechanically enforced, not promised in a
comment. The browser's copy is for instant feedback while typing; the
Edge Function re-reads scores from the database and recomputes, and only
it may write `period_grades` — `authenticated` has no write privilege on
that table at all.

**Import** — SheetJS parse in the browser, plan built client-side,
`import_resolution` and `import_commit` RPCs server-side. Nothing is
written before confirmation.

---

## B. Feature inventory

Classification per the brief: **A** already correct · **B** incomplete ·
**C** buggy · **D** architecturally weak · **E** missing · **F** blocked
on official documentation.

### Teacher

| Feature | Class | Notes |
|---|---|---|
| My Classes, receipts, status chips | A | |
| Class workspace (10 tabs) | A | |
| Record Book: Setup, Grade Entry, Summary, Analytics, LOA | A | Ported from V0 with its behaviour preserved |
| Bulk grade entry | A | A *mode* of the gradebook (paste a block), not a separate page — deliberately |
| Attendance capture | B | Capture and a day summary exist; **no monthly summary, no SF2/SF4** |
| Add own class | A | Now filtered by the section's grade level |
| Add/remove learner in own class | A | Controlled fallback, as intended |
| Correct a learner's name | A | Namesake confirmation guard |
| Submit grades | A | |
| Global Analytics | A | Class + term picker, no need to open a workspace |
| Global LOA Reports | A | Same pattern |
| CSV export | A | Gradebook and summary |

### Registrar / administrator

| Feature | Class | Notes |
|---|---|---|
| Student directory (grade-level bar, search, 500 cap) | A | |
| Admit / enrol / edit student, edit enrolment | A | |
| Student detail + academic history | A | |
| Classes & Sections setup | A | |
| Subject catalogue + curriculum map | A | Shipped in PR #40 |
| School Setup (profile) | A | |
| Users: create account, roles, status, reset password | A | Staff only |
| Grade Submissions queue | A | |
| SF10 preview | B | Preview only — no numbering, signatories, or stored artifact |
| Academic Years | **E** | Schema complete, **no screen**; menu says `planned` |
| Grading Configuration | **E** | Data-driven already; no editor. Deliberate |
| Enrollments (bulk) | **E** | Menu says `planned` |
| Reports & Documents | **E** | Menu says `planned` |

### Student portal

| Feature | Class | Notes |
|---|---|---|
| My Grades (published only) | A | |
| My Profile | A | |
| Academic History | A | |
| **Account provisioning** | **E** | See §G — this is the blocking gap |

---

## C. Student / enrollment analysis

**The three-layer model is correctly implemented and is the strongest
part of the schema.**

```
students        one person, one row, forever      (UUID; LRN is an attribute)
   ↓
enrollments     one school year of attendance     (grade level, section, status)
   ↓
class_enrollments  one subject class within it
```

`students.id` is a UUID. Nothing keys on a name anywhere in the
database. `students_lrn_unique` is a partial unique index on
`(school_id, lrn) where lrn is not null and deleted_at is null` — a
school cannot hold the same LRN twice, and a learner admitted before
their LRN is issued is still allowed.

**What exists:** create, edit, search, filter, view, soft-delete
(`deleted_at`), duplicate refusal *by LRN or student number, before
writing*, with a message naming the existing learner rather than a
constraint name. `enrol_student` refuses a second enrolment in the same
academic year. `admit_student` writes person and enrolment in one call.
`update_enrollment` can move a learner between sections.

**What is missing:**

1. **`enrollment_events` has 0 rows and no code path.** The table exists
   (0005), has RLS, and nothing has ever written to it. Section moves,
   transfers and withdrawals therefore leave an `audit_logs` entry but
   no structured enrolment history. SF10 needs that history.
2. **No transfer-in / transfer-out flow.** `enrollments.status` accepts
   `transferred_in` / `transferred_out`, and `update_enrollment` can set
   them, but there is no screen that treats a transfer as an event with
   a date, a school, and a reason.
3. **No fuzzy duplicate detection.** Two learners with the same name and
   no LRN are accepted silently. `app.normalise_name` exists and is used
   for subjects and sections; students only check identifiers.
4. **`guardians` has 0 rows and no read or write path** anywhere.

**Verdict: B (incomplete), not E.** Phase 1 is a completion job, not a
build.

---

## D. Academic year analysis

**Schema: complete. UI: absent.**

`academic_years (label, start_date, end_date, period_structure, status)`
with `status in ('planning','active','closed','archived')` and
`period_structure in ('three_term','quarter','semester','custom')`.
`academic_periods` are rows with ordinals and dates — the application
never assumes three of them.

`app.reject_write_to_archived_year()` is a **trigger**, attached to
enrollments, classes and the academic tables: a write into an archived
year raises, regardless of which code path attempts it. That is the
right place for the rule.

**Gaps:**

1. **No screen.** Creating a year, adding its periods, activating,
   closing or archiving one is a SQL job today. The menu entry exists
   and renders `NotAvailable` with an honest note.
2. **`'locked'` does not exist.** The brief asks for
   DRAFT/ACTIVE/ARCHIVED/LOCKED; the check constraint has
   `planning/active/closed/archived`. `closed` is the nearest, and
   nothing enforces it — only `archived` is enforced by trigger.
3. **Nothing prevents two `active` years** in one school.
4. The three-term structure is data. `p1/p2/p3` appears **only in
   `fixtures.ts`** (demo data) — grep-verified. No production code path
   assumes a count of periods.

---

## E. Registrar workflow analysis

**Built, and it exceeds what the brief asks for.** The implemented state
machine is:

```
draft → in_progress → submitted
              ↓
        received            (the class adviser signs for it)
              ↓
        forwarded           (adviser passes the section to the registrar)
              ↓
        registrar_received  (the registrar signs for it)
              ↓
    returned ⇄ approved → finalized → published
                                ↓
                            reopened
```

Ten states, versus the brief's eight — the extra three
(`received`, `forwarded`, `registrar_received`) are a **chain of
custody** through the adviser, which is how the school actually works
and which the brief's linear model omits. `recall_grades` lets a teacher
pull a submission back before anyone has signed for it.

Transitions are RPCs with an `app.assert_transition` guard and an audit
row carrying actor, timestamp and before/after. Arbitrary state changes
are not possible from the client: `grade_submissions` has no direct
write grant.

**Publication is the privacy gate**, enforced in RLS on `period_grades`
and `final_subject_grades` — not in the portal functions. A direct
PostgREST query returns exactly the same rows the portal shows.

**The gap is not design, it is exercise:**

> **`grade_submissions` has 0 rows and `period_grades` has 0 rows on the
> production database.** The entire submission lifecycle and the
> authoritative grade persistence have **never run against production**.
> They are covered by unit tests, e2e tests and local Postgres runs, and
> `final_subject_grades` has 13 seeded rows — but no real teacher has
> ever submitted, and no Edge Function invocation has ever written a
> period grade there.

That is the single largest risk in the system and it is a *testing* risk,
not a code risk. Recommendation: a scripted end-to-end rehearsal against
production with one real class before any school relies on it.

---

## F. Import Center analysis

The three-term ECR import works and is thoughtfully built. Three facts
from reading the real workbook drive the design, and all three hold:

1. **One workbook is one class.** `classes` is unique on
   `(academic_year_id, section_id, subject_id)`, so re-importing the same
   file updates the same class. A duplicate is not *prevented* — it is
   impossible.
2. **The workbook has no learner identifier.** No LRN, no student
   number. So matching is a **proposal a person confirms**, never a
   silent join. The brief's "never treat name as the sole identity key"
   is honoured by refusing to treat a name as a key at all.
3. **Every grade in the workbook is a formula.** Nothing derived is
   imported — marks and structure go in, the engine produces the grades.

The pipeline is UPLOAD → PARSE → RESOLVE → MAP → VALIDATE → PREVIEW →
CONFIRM → COMMIT → AUDIT. Nothing is written before confirmation.
Ambiguity (two "Grade 9" levels) is an explicit error with a chooser,
not a silent pick — fixed in 0037 after a real workbook exposed it.

**Gaps:**

1. **Only one importer exists.** Students, enrollments, classes,
   subjects and historical records have no import path. For a school
   with 1,500 learners this is the difference between an onboarding that
   takes a day and one that cannot happen.
2. **Reconciliation vocabulary is narrower than the brief.** The plan
   reports `matched / ambiguous / new` for learners and `unchanged /
   hpsChanged / willCreate` for assessments. There is no explicit
   `CONFLICT`, `INVALID` or `SKIPPED` category.
3. **`import_batches` has 0 rows on production** — no import has ever
   been committed there. `import_history` exists and is wired to a
   screen, so the audit trail is built but unproven.

---

## G. Student portal analysis

**The read path is correct and safe. The account lifecycle does not
exist.**

Security, verified in the migrations:

- `my_profile()`, `my_grades(p_year_id)`, `my_academic_history()` take
  **no student id**. The learner is resolved server-side from
  `app.current_student_id()`, which reads `students.portal_user_id =
  app.current_user_id()`. A student id from the client is not accepted
  anywhere, so there is no IDOR surface.
- Unpublished grades are excluded by **RLS**, not by the function body,
  so the filter cannot be bypassed by querying the table directly.
- `app.current_student_id()` returns NULL for staff, which makes every
  student policy deny by default.

**The blocking gap:**

> `students.portal_user_id` is the only link between a learner and a
> login, and **nothing in the product can set it.** `manage-users` (the
> Edge Function) creates staff accounts only; the Users screen offers
> staff roles only; no RPC links a student to an auth user. On
> production, **2 of 8 students have a portal account, both from seed
> data.**

A school cannot give a single learner access to the portal today. Bulk
provisioning is the eventual requirement; even single provisioning is
missing. This is the same defect pattern recorded four times already in
this build — *a message that prescribes an action is a promise that the
action exists* — one level up: a whole role with no way in.

---

## H. Reports and official documents

| | State |
|---|---|
| SF10-JHS data source | Built (`rds.sf10_jhs`), shaped from the school's blank form |
| SF10 preview screen | Built, print-styled |
| CSV export (gradebook, summary) | Built |
| SF1, SF2, SF4, SF5, SF9 | **Missing** |
| Numbering, signatories, stored PDFs | **Missing** |

`generated_documents`, `report_templates` and
`document_number_sequences` all exist with RLS and **0 rows and no code
path**. `document_number_sequences` has RLS enabled with **no policy at
all**, which is deny-everything — safe, but it means the table is
currently unusable rather than merely unused.

The three-layer strategy (core data → named data-source contract →
per-school template) is designed in `docs/11-document-engine.md` and
implemented only for SF10's first layer.

**Blocked on the school (F):** SF9 and the report-card layout. The
gradebook and the LOA disagree about the same mark today — 75–79 reads
"Connecting" in one and "Fairly Satisfactory" in the other — because they
come from two different official vocabularies. We need the school's
current report-card template to resolve it.

---

## I. Analytics

**Phase 8 is already complete.** Both Analytics and LOA Reports are
global teacher screens with an academic-year → class → term picker
(`ReportPicker`), and both are *also* tabs inside the class workspace
rendering the same component. A teacher does not have to open a class
workspace first — which is exactly what the brief asks for.

Implemented: class average, highest/lowest, pass/fail counts, completion
percentage, the seven-band distribution (96–100 / 91–95 / 86–90 / 81–85 /
76–80 / 75 / below 75 — the single-value "75" band is deliberate, since
75 is the pass mark), missing-score counts, and a per-learner drilldown.

Not implemented: term-over-term comparison, per-component performance
across classes, and school-level analytics for the administrator.

---

## J. LOA

> **CURRENT LOA BUSINESS LOGIC WILL BE PRESERVED.**

`app/src/lib/loa.ts` and its 28-assertion e2e suite are treated as
authoritative. The implementation was aligned to the school's own
CLASSRECORD template in an earlier phase and has not been questioned
since. It is available in both places the brief requires: inside the
class workspace, and as a global LOA Reports screen with a class and term
picker.

One observation, recorded **without any proposed change**: the bands in
`loa.ts` (Proficient 75–89, Nearly Proficient 50–74) and the descriptor
bands used on the report card (Fairly Satisfactory 75–79) are two
different official vocabularies applied to the same mark. This is a
question for the school about which document says what, not a defect in
the LOA calculation. No repository or source-document contradiction was
found, so nothing changes.

---

## K. Senior High School

**Structurally present, academically absent.**

What exists: `grade_levels` rows for Grades 11 and 12, seeded for any
school that already has Grade 10, carrying `key_stage = 'SHS'`. That is
the whole of it.

What does not exist: tracks, strands, subject classification
(Core / Applied / Specialised), semesters as a period structure in
practice, SHS-specific grading weights, and the SHS variant of SF10.

`period_structure` accepts `'semester'`, so the schema can express an SHS
calendar — but no school has one, and no code has ever run against one.

**Blocked (F)** pending the official SHS documentation. Guessing at
strands would produce a data model the school would have to unwind.

---

## L. Multi-school readiness

**Isolation is solid.** Every one of the 46 tables carries `school_id`
(except `permissions` and `role_permissions`, which are a global
catalogue by design, and `schools` itself), all have
`FORCE ROW LEVEL SECURITY`, and the tenant comes from the verified JWT.
The `01_tenant_isolation.sql` suite asserts 34 cross-tenant reads all
return nothing, and passes.

**Remaining ANHS-specific assumptions, all of them small:**

1. `app/src/config.ts` maps the host `anhs.mendtrix.app` → "Angono
   National High School" for the **sign-in screen only** (before a JWT
   exists, there is no tenant to read). It falls back to a neutral brand
   for any other host. `config.test.ts` covers this.
2. `app/src/data/sf10.ts` has ANHS names in **preview fixture data**.
3. `app/src/data/fixtures.ts` is entirely ANHS demo data — correct, it is
   the demo.
4. The repository is still named `Anhs-EClass-Record`, and the product
   is called "Mendtrix Academic Records Platform" in the docs and
   "ANHS E-Class Record" in places in the UI.

**The real gap is onboarding, not isolation.** There is no path to
create a school. A second tenant today means running `seed.sql` by hand:
school row, roles, permissions, grade levels, subject categories,
grading schemes, transmutation table, academic year, periods, calendar
days, admin account. Roughly a dozen steps, all SQL.

---

## M. Security

### Fix immediately

**M1 — Three SECURITY DEFINER functions are executable by `anon`.**

`public.create_subject`, `public.set_subject_active` and
`public.set_subject_grade_levels` (migrations 0038 and 0040) are
reachable by the anonymous role through PostgREST. Migration 0017
revoked `anon` EXECUTE from every function that existed at the time, but
PostgreSQL grants EXECUTE to `PUBLIC` by default and the newer
migrations did not repeat the revoke.

*Actual exposure is low* — each function calls
`app.has_permission('subjects.write')`, and an anonymous caller resolves
a NULL school and NULL user, so the permission check returns false and
the function raises. They fail closed. But it is a regression against a
posture the project deliberately established, and the fix is three lines:

```sql
revoke execute on function
  public.create_subject(text, text, uuid, numeric, uuid, uuid[]),
  public.set_subject_active(uuid, boolean),
  public.set_subject_grade_levels(uuid, uuid, uuid[])
from anon, public;
```

**Systemic version of the same problem:** every future migration that
creates a `public.` function must revoke from `anon`. Worth a migration
that revokes from `anon` across the whole schema and a note in the
migration checklist, so this cannot recur.

**M2 — A live anon key for a real Supabase project is served publicly.**

`assets/js/supabase.js` line 21 contains an anon JWT for project
`aylaiatvrrownsqzlntc`. This was flagged in the original risk register
and is still present — and `vercel.json` now copies the V0 files to
`/legacy/`, so the key is served at
`anhs-grading-system.vercel.app/legacy/assets/js/supabase.js` as well as
sitting in public git history.

The project is currently `INACTIVE` (paused) and V0's Supabase layer was
dead code that `main.js` never called. But the key cannot be un-published
and the project should be **deleted**, not merely left paused. If the V0
demo must stay online, strip the key from the copied file in
`vercel.json`'s build command.

### Lower priority

| | Finding |
|---|---|
| M3 | 10 `app.*` functions have a mutable `search_path`. All are internal helpers; set `search_path = public, pg_temp` on each. |
| M4 | Supabase Auth **leaked-password protection is off**. One dashboard toggle; enable it before real accounts exist. |
| M5 | `citext` is installed in the `public` schema. Cosmetic. |
| M6 | `document_number_sequences` has RLS with zero policies — deny-all. Correct today; must gain policies with the document engine. |
| M7 | **The seven demo passwords have never been rotated.** Standing item from earlier phases, still open, and it becomes urgent the moment real learner data exists. |
| M8 | 35 tables have two permissive SELECT policies for `authenticated` (`tenant_read` + a role policy). Correct behaviour, small planner cost. |

### Verified sound

- No client-supplied tenant or student id anywhere.
- Publication gate enforced in RLS, not in application code.
- `authenticated` has **no write grant** on `period_grades`; only the
  Edge Function's service_role client may write it.
- Both Edge Functions run with `verify_jwt: true`.
- The demo role switcher is compiled out of production builds.

---

## N. Performance and scalability

Current production data is tiny (8 students, 4 classes, 111 scores), so
nothing is slow *yet*. The risks are structural.

| # | Risk | Detail |
|---|---|---|
| N1 | **67 unindexed foreign keys** | Every one is a sequential scan waiting for its first thousand rows. `assessment_scores`, `class_enrollments`, `enrollments` and `attendance_records` matter most. |
| N2 | **Student directory caps at 500** | `PAGE_LIMIT = 500` with a banner when hit. A 1,500-learner school sees a truncated list with an honest warning — which is better than lying, but is not pagination. Server-side keyset pagination is the fix. |
| N3 | **Gradebook loads a whole class at once** | Fine at 40 learners; the payload is learners × assessments. |
| N4 | **`app.has_permission()` in RLS predicates** | `STABLE` and therefore not re-evaluated per row in most plans, but it performs a three-table join. Wrapping call sites as `(select app.has_permission(...))` guarantees a single InitPlan evaluation. |
| N5 | **Excel parsing is client-side** | A large workbook parses in the teacher's browser. Acceptable for one class per file; not for a whole-school historical import. |
| N6 | 12 unused indexes | Trivial write overhead; leave until the access patterns are real. |
| N7 | Bundle is 709 kB (193 kB gzipped) | One chunk. Route-level code splitting would halve first load on a school's connection. |

**The brief's rule — "the system must not depend on downloading an
entire school dataset to the browser" — is currently honoured**, because
every read is scoped by class, section or grade level. N2 is the one
place it strains.

---

## Cross-cutting finding: seeded-but-unread structures

Ten tables exist with RLS, grants and in some cases seed rows, and have
**never been read or written by any code path**:

| Table | Rows | Any code path? |
|---|---|---|
| `enrollment_events` | 0 | none |
| `grade_change_requests` | 0 | none |
| `guardians` | 2 | none |
| `announcements` | 0 | none |
| `report_templates` | 0 | none |
| `generated_documents` | 0 | none |
| `document_number_sequences` | 0 | one write, unreachable |
| `class_teachers` | 0 | RLS only |
| `staff_profiles` | 0 | one reference |
| `notifications` | 0 | RLS only |

This is not waste — three earlier features (`school.config.*`
permissions, `grade_level_subjects`, `import_batches`) turned out to be
exactly what a later phase needed, and building on them beat adding a
duplicate. **The habit worth keeping: before adding a table or a column,
grep the schema for the concept.** It has paid off three times.

---

## Recommended implementation order

The brief's phase order is sound with **three changes**, each argued from
what the audit found:

1. **Phase 8 (global analytics + LOA) is already complete.** Skip it.

2. **Promote student-portal account provisioning out of Phase 6 and into
   Phase 1.** It is a two-day job (an RPC plus a button on the student
   profile) and it currently makes an entire role unreachable. Leaving it
   until Phase 6 means the student portal stays a demo for months while
   phases 2–5 land around it.

3. **Insert a "production rehearsal" before Phase 2.** `period_grades`
   and `grade_submissions` are empty on production. Before building more
   on top of the lifecycle, run one real class through
   encode → submit → receive → forward → registrar receive → approve →
   finalize → publish → student portal, against the production database,
   and fix whatever it exposes. Everything downstream assumes this path
   works, and nothing has ever proved it does outside a test.

Revised order: **1 → rehearsal → 2 → 3 → 5 → 4 → 6 → 7 → 9 → 10 → 11 → 12.**
Phase 5 moves ahead of Phase 4 because corrections protect records that
already exist, while the extra importers serve onboarding that has not
started.

---

## O. Recommended Phase 1 scope

**Goal:** close the student and enrollment lifecycle, and make the
student portal reachable.

Phase 1 is a **completion** job. The master record, the three-layer
model, duplicate refusal by identifier, and the admit/enrol/edit screens
all exist and are correct — §C. Do not rebuild them.

### O1. Enrolment events (migration)

Write to `enrollment_events` — the table has existed since 0005 and has
never been used — on every enrolment change: enrol, section move,
transfer in, transfer out, withdraw, complete. `(enrollment_id,
event_type, effective_date, from_section_id, to_section_id, reason,
actor)`. Backfill from `audit_logs` where the shape allows; leave gaps
honest where it does not.

**Why first:** SF10 is built from enrolment history, and every day
without this loses history that cannot be reconstructed later.

### O2. Transfer and withdrawal as first-class actions

Three RPCs — `transfer_student_section`, `transfer_student_out`,
`withdraw_student` — each taking an effective date and a reason, each
writing an enrolment event. Today `update_enrollment` can set the status
field, which records *that* something changed but not *when* or *why*.

### O3. Name-based duplicate warning

`admit_student` refuses a duplicate LRN or student number and says who it
clashes with. Extend it: when no identifier matches but
`app.normalise_name(last, first, birth_date)` does, **warn and require a
`p_confirm_namesake` flag** — the same pattern `correct_learner_name`
already uses. Warn, never refuse: real siblings share surnames and real
namesakes exist.

### O4. Student portal account provisioning ← *promoted from Phase 6*

- Extend the `manage-users` Edge Function with a `createStudentAccount`
  action: create the auth user, set `students.portal_user_id`, force a
  password change on first sign-in.
- A **Link portal account** button on the student profile, gated on
  `students.write`.
- A bulk action on the student directory: provision every enrolled
  learner in a selected section, returning a printable credential list.
- Audit every provisioning action.

**Why now:** without it the student portal cannot be demonstrated to the
school with a real learner, and the whole role is inert.

### O5. Guardians

`guardians` exists with 2 seeded rows and no code. SF10 and SF9 both
carry a parent/guardian name. Add a read and a single write to the
student profile. Small, and it removes a table from the unread list.

### Tests required for Phase 1

Unit: enrolment-event shape; namesake normalisation.
Integration (local Postgres, all 40+ migrations plus seed): duplicate
enrolment refused; section move writes exactly one event; transfer-out
then transfer-in produces a coherent history; a teacher cannot call any
of the new RPCs; a student cannot see another student's profile; every
new function refused across tenants.
E2E: admit → enrol → move section → view history; provision a portal
account and sign in as that learner; namesake warning appears and can be
confirmed.

### Explicitly out of scope for Phase 1

Academic-year UI (Phase 2), bulk student import (Phase 4), the
correction workflow (Phase 5), report cards (Phase 7), and any visual
change (Phase 12).

---

## What must not be touched

1. **LOA** — `app/src/lib/loa.ts` and its 28 assertions. Authoritative.
2. **The grading engine** — one module, two runtimes, diff-enforced. No
   defect was found in this audit.
3. **The publication gate in RLS.** Moving it into application code
   would be a downgrade.
4. **The three-layer student model.**
5. **`app.reject_write_to_archived_year()`.**
6. **The `DataSource` two-implementation split.**
7. **`nav.ts`'s "every route resolves to a screen" invariant** and the
   test that enforces it.
