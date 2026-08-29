# Phase 1 — Student master records, enrolment, and portal accounts

**Status:** COMPLETE · **Migrations:** 0041, 0042 · **Edge Function:** `manage-users` v2
**Applied to production:** yes · **Phase 2:** not started, awaiting approval

---

## Phase status

| Phase | State |
|---|---|
| 0 — Current-state audit | COMPLETE |
| **1 — Student records + enrolment + portal accounts** | **COMPLETE** (this document) |
| 1.5 — Production lifecycle rehearsal | PLANNED — §14 |
| 2 — Academic year + structure | NOT STARTED |
| 3–12 | NOT STARTED |

---

## 1. What was already there

Phase 1 was a **completion** job, not a build. The audit was right that the
foundations were sound, and none of this was rebuilt:

| | |
|---|---|
| Three-layer model | `students` → `enrollments` → `class_enrollments`, correct since 0005 |
| Student identity | UUID primary key; LRN and student number are attributes. **Nothing keys on a name anywhere** |
| LRN uniqueness | `students_lrn_unique`, partial on `(school_id, lrn) where lrn is not null and deleted_at is null` |
| Duplicate refusal | `admit_student` refused a clashing LRN or student number *before writing*, naming the existing learner |
| Duplicate enrolment | `enrol_student` refused a second enrolment in the same academic year |
| Master-record CRUD | `admit_student`, `enrol_student`, `update_student`, `update_enrollment`, `student_profile` |
| Directory | Grade-level bar, school-wide search, 500-row cap with an honest banner |
| Student record screen | Identity, current enrolment, per-year history, grades |
| Portal read path | `my_profile`, `my_grades`, `my_academic_history` — **no student id from any client**, publication gate in RLS |
| Teacher fallback | `add_learner_to_my_class`, with a namesake confirmation (0034) |
| Archived years | `app.reject_write_to_archived_year()` as a trigger |

**Implementation map, as required before starting:**

| Classification | Items |
|---|---|
| **EXISTING** | everything in the table above |
| **NEEDS COMPLETION** | `enrollment_events` (table since 0005, never written); `class_enrollments.status` / `.date_dropped` (columns since 0006, never set) |
| **NEEDS MODIFICATION** | `admit_student` (namesake); `enrol_student` (roster sync, events); `update_enrollment` (events, rosters); `import_commit` (skip the new prompt); `manage-users`; `nav.ts` |
| **MISSING** | transfer / withdraw / re-enrol RPCs; portal account provisioning; an enrolment-history read contract; the Enrollments screen |

---

## 2. What changed

Nine things, and three of them are defects the phase **found** rather than
features it added.

### Built

1. **The enrolment event log is written.** `enrollment_events` had RLS,
   grants, a foreign key and zero rows. Every enrolment act now records
   one.
2. **Transfer, withdraw and re-enrol are first-class acts**, each with an
   effective date, a reason, and a roster consequence.
3. **Portal account provisioning.** A registrar can give a learner a way
   in, from the student record or from a section list.
4. **The Enrollments screen** — `nav.ts` carried it as `planned` for the
   whole build.
5. **A namesake warning** on `admit_student`, which warns and never
   refuses.
6. **Creating a learner no longer forces an enrolment.**

### Found and fixed

7. **A learner enrolled into a section joined none of its classes.**
8. **A re-enrolled learner could never rejoin a class.**
9. **Enrolment history had no deterministic order.**

Each is described in §6 and §12.

---

## 3. Database changes

### Migration 0041 — the enrolment lifecycle

**Schema (all additive):**

```sql
enrollment_events.event_type   -- widened: + 'enrolled', + 'grade_level_change'
enrollment_events.from_ref     -- uuid, nullable
enrollment_events.to_ref       -- uuid, nullable
enrollment_events.seq          -- bigint identity
+ index (school_id, enrollment_id, event_date, seq)
```

No table was created, no column dropped, no data rewritten. **No backfill
was performed** — see §12.

**Functions:**

| Function | What it is |
|---|---|
| `app.record_enrollment_event(...)` | The only writer, so every event has the same shape |
| `app.drop_class_enrolments(...)` | The inverse of `sync_class_roster`. **Marks, never deletes** |
| `app.reactivate_class_enrolments(...)` | Re-opens a closed class membership |
| `public.transfer_student_section(...)` | Move within the same year and grade level |
| `public.withdraw_student(...)` | `transferred_out` or `dropped`; **a reason is required** |
| `public.reenrol_student(...)` | Re-opens a closed enrolment |
| `rds` / `public.enrollment_history(student)` | The record, for a screen |
| `public.enrol_student` | *rewritten from 0025 verbatim* — plus events and roster sync |
| `public.update_enrollment` | *verbatim* — plus events and roster moves |
| `public.admit_student` | *verbatim* — plus the namesake guard, and the enrolment made optional |
| `public.import_commit` | *verbatim* — passes `p_confirm_namesake => true` |

### Migration 0042 — portal accounts

| Function | What it is |
|---|---|
| `public.may_provision_portal_accounts()` | A yes/no for the screen and the Edge Function |
| `public.link_student_portal_account(student, user)` | The link, with both tenancy checks |
| `public.unlink_student_portal_account(student, reason)` | Detaches a login; **never touches the academic record** |
| `rds` / `public.portal_account_candidates(section)` | A section's learners and who already has an account |

### The security regression from Phase 0, closed

0041 also revokes `anon` EXECUTE from the three functions migrations 0038
and 0040 left exposed. Verified after deployment: the Supabase security
advisor reports **0 anon-executable SECURITY DEFINER functions**, down
from 3.

> **The rule, now stated twice in the migrations:** PostgreSQL grants
> EXECUTE to `PUBLIC` by default. Every migration that creates a
> `public.` function must revoke it. Migration 0017 did this once for
> everything that existed then, and two later migrations forgot.

---

## 4. Student lifecycle

```
create the PERSON                 admit_student(student, null)
      │                           → identity only; no year, no section
      ├── namesake?               → status 'needs_confirmation' + the matching records
      │                             (a NAME is a suspicion; an LRN is a certainty and raises)
      ▼
enrol them for a YEAR             enrol_student(student, {year, grade, section})
      │                           → writes 'enrolled' + 'section_change' events
      │                           → JOINS the section's existing classes
      ▼
they are on a class roster        class_enrollments, status 'active'
```

`admit_student(student, enrollment)` still does both in one call, so every
existing caller — the Add student form, `import_commit` — is unaffected.

### Duplicate protection, in two tiers

| Signal | Behaviour | Why |
|---|---|---|
| LRN | **Refuse**, naming the existing learner | A national identifier. A school cannot hold it twice |
| Student number | **Refuse**, naming the existing learner | Same |
| Normalised name (+ birth date when both have one) | **Warn**, return the candidates, proceed on confirmation | Real namesakes exist and siblings share surnames. A hard block would leave a registrar unable to admit a real learner |

The warning **returns** rather than raising: an exception rolls back and
carries only a string, so the screen could not show a comparison. A status
the caller reads is a contract; a message it must parse is not.

---

## 5. Enrolment lifecycle

```
                 ┌──────────────────────────────────────┐
                 ▼                                      │
   enrolled ──── transfer_student_section ──── enrolled │  (same year, same grade)
      │                                                 │
      ├──── withdraw_student ────► transferred_out ─────┤
      │                            or dropped           │
      │                                 │               │
      │                                 └── reenrol_student
      ▼
   update_enrollment  (the general field editor — still there)
```

**Historical enrolment is never overwritten.** Enrolling the same learner
next June writes a second `enrollments` row against the same
`students.id`. Re-enrolling after a withdrawal re-opens the *same* row —
they are the same person in the same year, so a second row would be a
second learner.

### What a transfer actually does

This is the part that would have silently corrupted rosters:

1. Refuse a section in another year or at another grade level. *A section
   IS a grade level and a name; moving a Grade 10 learner into a Grade 7
   section is a grade-level change, not a transfer.*
2. Mark the old section's `class_enrollments` `'transferred'` with a
   `date_dropped`. **`assessment_scores.class_enrollment_id` points at
   those rows, so every mark earned in the old section survives exactly
   as recorded.**
3. Reactivate any closed memberships in the destination, then
   `sync_class_roster` each of its classes.
4. Write the event and the audit row.

Every roster and gradebook read in the system already filtered
`ce.status = 'active'` — verified across 28 call sites — so rosters
followed the move the moment the column started being set.

---

## 6. Enrolment event model

| `event_type` | Written when | `from` → `to` |
|---|---|---|
| `enrolled` | first enrolment for a year | null → grade level |
| `transfer_in` | enrolled with status `transferred_in` | null → grade level |
| `section_change` | assigned, transferred, or edited | section → section (**null from = assigned, not moved**) |
| `grade_level_change` | corrected on the enrolment | grade → grade |
| `transfer_out` | withdrawn to another school | status → `transferred_out` |
| `drop` | dropped out | status → `dropped` |
| `re_entry` | returned | closed status → `enrolled` |

Each row carries `event_date`, `from_value` / `to_value` (text, so the
history still reads correctly after a section is renamed), `from_ref` /
`to_ref` (uuid, so a report can join), `notes` (the reason), `recorded_by`,
`created_at`, `school_id`, and `seq`.

### Why this is not the audit log

They answer different questions and have different lifetimes.
`audit_logs` answers *"who changed this row"*, is written for an
investigator, and may be pruned. `enrollment_events` answers *"where was
this learner during this school year"*, **is read by SF10**, and must
outlive any retention policy applied to the audit trail. Deriving one
from the other would mean parsing jsonb diffs years later to reconstruct
a transfer date, which is not a record — it is an archaeology project.

**Both are written on every act.** The event is the record; the audit row
is the accountability. Neither replaces the other, and no duplicate
logging system was created: `app.write_audit` is the existing one,
unchanged.

### No event is written for a no-op

`update_enrollment` compares before and after and writes an event only
when the section or grade level actually changed. Editing a remark
writes an audit row and no event.

---

## 7. Portal account provisioning

```
REGISTRAR  →  Student record  →  Create portal account
              or Enrollments  →  section  →  Give access
                     │
                     ▼
      manage-users (Edge Function, service_role)
        0. may_provision_portal_accounts()      ← asked BEFORE anything is minted
        1. student_profile()                    ← in this school? already linked?
        2. auth.admin.createUser()              ← tenant stamped into app_metadata
        3. insert public.users
        4. link_student_portal_account()        ← through the CALLER's JWT
        5. the 'student' role
                     │
                     ▼
      STUDENT signs in → app.current_student_id() resolves → published grades
```

**Design points, each load-bearing:**

- **`students.write`, not `users.write`.** Giving a learner access to
  their own record is a student-record act and belongs to whoever owns
  the student master record. The registrar holds neither `users.write`
  nor `roles.assign` and should not need them for this.
- **The authorization probe runs first.** Discovering a refusal after
  minting an identity would leave an orphan holding an email address the
  registrar then cannot reuse.
- **The link goes through the caller's own JWT**, so `students.write` is
  checked by the permission catalogue rather than by a second opinion
  written in TypeScript.
- **The `student` role is assigned with `service_role` and a hard-coded
  code.** Not via `set_user_roles`, which needs `roles.assign` — granting
  a registrar that so they could provision a learner would also let them
  make themselves an administrator. The role is a literal and the target
  is an account created moments ago in the same request, so there is
  nothing a caller can steer.
- **Every failure after step 2 deletes the identity again.** A half-made
  account cannot be repaired from any screen, and its address would then
  be taken.
- **A second account for a linked learner is refused**, naming the
  account that holds the place. The second one would sign in, resolve to
  nobody, and meet an empty portal with nothing to explain it.
- **Retrying is safe.** Linking the same account twice returns
  `already_linked`, not an error.
- **No plaintext password is stored anywhere.** It goes to GoTrue and is
  shown once, on screen, for the registrar to read out;
  `must_change_password` is set.

---

## 8. Permissions and RLS

**No new permission was created and no role's permissions changed.** The
existing catalogue already expressed all of this:

| Act | Permission | Held by |
|---|---|---|
| Admit / edit a learner | `students.write` | registrar, administrator |
| Enrol / transfer / withdraw / re-enrol | `enrollments.write` | registrar, administrator |
| Provision a portal account | `students.write` | registrar, administrator |
| Read an enrolment history | RLS on `enrollment_events` | whoever may read the enrolment |

`rds.enrollment_history` is **SECURITY INVOKER**, so the existing RLS
policies decide who may read it, exactly as `student_profile` does.

Verified against a real Postgres, all roles:

```
PASS  a teacher cannot provision an account
PASS  a teacher cannot transfer a learner
PASS  a teacher cannot withdraw a learner
PASS  a teacher cannot admit a learner
PASS  a student cannot provision an account
PASS  the portal resolves the learner from the token alone
PASS  and sees exactly ONE learner (themselves)
PASS  a cross-tenant learner is refused
PASS  tenant isolation — all 34 assertions, no foreign rows visible
```

**The seed-ordering rule was not triggered:** no migration here grants a
permission to a role, so `seed.sql` needed no change.

---

## 9. Tests added

| Where | Count | What |
|---|---|---|
| `app/src/data/enrollment.test.ts` | **21** | admit, namesake, enrol, transfer, withdraw, re-enrol, history order, portal accounts |
| `app/e2e/enrollment-lifecycle.mjs` | **21** | the same journeys through the real screens |
| `/var/tmp/verify.sql` (local Postgres) | **17** | the lifecycle against the real database, including marks surviving a transfer |
| `/var/tmp/verify2.sql` (local Postgres) | **12** | portal accounts and role separation across four roles |

The two SQL suites are run against a Postgres rebuilt from all 42
migrations plus `seed.sql` — the same habit that caught four earlier
defects, and three more here.

---

## 10. Test results

```
Unit                12 files, 234 tests            PASS
E2E                 19 suites, ~320 checks         PASS
Database lifecycle  17 assertions                  PASS
Database security   12 assertions                  PASS
Tenant isolation    34 assertions                  PASS
Student privacy     4 assertions                   PASS
My-classes contract 4 assertions                   PASS
Typecheck                                          PASS
Build                                              PASS
```

Regression confirmed green: Grade Entry, Record Book, Summary, Analytics,
**LOA (28 checks, unchanged)**, Attendance, Submissions, custody chain,
Import Center, Import choices, Student Portal, accounts, legibility.

Selected output from the database lifecycle suite:

```
PASS  2. joined the section's existing classes -> 2  (was 0 before this phase)
PASS  5. cross-grade transfer refused
PASS  6. transfer left 2 and joined 1
PASS  7. old class rows kept, marked -> active, transferred, transferred
PASS  8. THE MARK SURVIVED the transfer -> 1 score(s)
PASS  9. no longer on a Pearl roster -> 0 active
PASS 10. history -> section_change: Pearl -> Diamond | section_change: — -> Pearl | enrolled: — -> Grade 10
PASS 13. withdraw closes every class -> 0 active left, classesClosed 1
PASS 14. the mark survived the withdrawal too
PASS 15. re-enrol rejoins the classes -> 1 active
```

---

## 11. Production migration status

| Applied | What |
|---|---|
| ✅ `enrollment_events_and_helpers` | Schema widening, `seq`, the three `app.*` helpers |
| ✅ `enrollment_transfer_withdraw_reenrol` | The three acts, the history reader, **and the anon revoke** |
| ✅ `enrol_admit_events_and_namesake` | `enrol_student`, `update_enrollment`, `admit_student` |
| ✅ `import_commit_confirms_namesake` | The import passes the confirmation flag |
| ✅ `student_portal_accounts` | All of 0042 |
| ✅ `manage-users` v2 | `create_student_account` |

The repository carries these as **0041** and **0042**; production records
them as five migrations because they were applied in reviewable pieces. A
fresh database built from the repository is functionally identical.

`import_commit` was patched by **rewriting the definition the database
already held** — `pg_get_functiondef`, one string replacement, `execute` —
rather than by restating 225 lines whose only change is one argument. The
source of truth was production's own catalogue, so nothing could drift in
transcription. The patch refuses to run if the call shape is not what it
expects, and is a no-op on a re-run.

**No production academic data was created, altered or fabricated.** Every
verification ran inside a transaction that was rolled back, or against
the local database.

---

## 12. Three defects found, and one that was not introduced

### A learner enrolled into a section joined none of its classes

`sync_class_roster` was called only from `create_class`, so a roster was
filled once — when the class was made. A learner enrolled into Pearl
*afterwards* joined nothing: the registrar's screen showed them in Pearl,
and every one of Pearl's teachers had a gradebook without them.

Nothing errored. The learner would have been discovered missing at the
end of a term. Found by an assertion, not by reading code: enrolling into
a section with two classes produced **zero** class enrolments.

### A re-enrolled learner could never rejoin

`class_enrollments` is `unique (class_id, enrollment_id)`, and
`sync_class_roster` inserts `on conflict do nothing`. A learner who left
a class already *has* a row in it — closed — so sync skipped straight
past them. Fixed by reactivating the existing row, which is also the only
*correct* answer: `assessment_scores.class_enrollment_id` points at that
row, so a second row would orphan every mark earned before they left.

### Enrolment history had no deterministic order

`now()` is **transaction** time. `enrol_student` writes two events in one
transaction, so both carried an identical `created_at` *and* `event_date`.
A history saying "assigned to Pearl" above "enrolled" reads as nonsense.
Fixed with a `seq` identity column. Found by an ordering assertion; it is
invisible until two events land in one statement.

### The one that was not introduced

`update_enrollment` could always change `section_id` directly. Before this
phase that left the learner on their old teachers' gradebooks. It now
moves the rosters too — the dedicated RPC still exists because it requires
a reason and reports what moved, but the general editor can no longer be
a way around it.

---

## 13. Known limitations

1. **No backfill.** Learners enrolled before this phase have no events.
   Their `enrollments` rows are intact and the screen says so plainly
   rather than inventing dates. Reconstructing events from `audit_logs`
   was considered and rejected: the audit rows carry `created_at`, not
   the *effective* date, and a wrong date in an academic record is worse
   than an honest gap. **Every enrolment from now on is recorded.**
2. **Bulk provisioning is not built.** `portal_account_candidates`
   already returns a whole section with a `hasAccount` flag per learner,
   so the data model is ready. Handing out four hundred passwords in one
   click is a decision to make with a school present, not to build
   speculatively. Documented as future work.
3. **Guardians remain unread.** The table still has no read or write path.
   Deferred to Phase 7, where SF9 and SF10 need it.
4. **No cross-year promotion flow.** Enrolling a learner for next June is
   `enrol_student` against the same person, which works — but there is no
   screen that promotes a whole section at once. Phase 2 territory.
5. **A withdrawn learner's `students.status` is untouched.** Only the
   enrolment closes. That is deliberate — a person who leaves in October
   and returns in January is the same active learner — but it means the
   directory's status column reflects the person, not the enrolment.
6. **`transfer_student_section` refuses a cross-grade move** rather than
   performing it as a grade-level change. `update_enrollment` can do that,
   and now records an event for it, but there is no dedicated screen.

---

## 14. Phase 1.5 — production lifecycle rehearsal plan

Phase 0 found `grade_submissions` and `period_grades` **empty on
production**: the whole submission and grade-persistence chain has never
run outside a test. Phase 1 has now added the enrolment path that feeds
it. Before Phase 2 builds on either, both should be run once, for real.

**Do not treat the lifecycle as production-ready because tests pass.**

### The rehearsal

One class, one section, one term, on production, in this order:

| # | Step | Who | What proves it |
|---|---|---|---|
| 1 | Admit two test learners | Registrar | The namesake warning fires on the second if named alike |
| 2 | Enrol both into a real section | Registrar | They appear on that section's class rosters **without anyone re-syncing** |
| 3 | Transfer one to another section | Registrar | The old teacher's roster loses them; the new one gains them; the event and audit rows both exist |
| 4 | Give one a portal account | Registrar | They can sign in and see nothing yet |
| 5 | Encode marks | Teacher | Scores land; the browser and the Edge Function agree |
| 6 | Submit the period | Teacher | **The first row `grade_submissions` has ever held** |
| 7 | Receive, forward | Adviser | The custody chain moves |
| 8 | Registrar receive, approve, finalize | Registrar | Each transition writes an audit row |
| 9 | Publish | Registrar | **The first rows `period_grades` has ever held** |
| 10 | Sign in as the learner | Student | Published grades appear; unpublished ones do not |
| 11 | Withdraw the second learner | Registrar | Their marks survive; they leave the roster |
| 12 | Remove the test data | Registrar | Documented below |

### Rules for the rehearsal

- **Test learners must be identifiable as such** — a reserved student
  number prefix, and no LRN.
- **Use a real section and a real class**, not a fabricated one: the
  point is to exercise the path a school will use.
- **Do not fabricate marks for real learners.** Only the test learners
  get scores.
- **Record what breaks and stop.** The purpose is to find integration
  blockers, not to push through them.
- **Clean-up is part of the plan**, written before it starts: withdraw
  the enrolments, unlink the portal accounts, soft-delete the learners.
  Marks stay attached to their class enrolments, which is correct — a
  rehearsal should leave the same trace a real term does.

### What would make it fail

Named in advance, so a failure is recognised rather than explained away:
a submission that cannot be received; an Edge Function that writes no
`period_grades` row; a published grade the learner cannot see; a
`must_change_password` flow that cannot complete; a roster that does not
match the registrar's section.

---

## 15. Recommended Phase 2 scope

**Academic year and academic structure**, as the brief has it, with three
notes from what Phase 1 touched.

1. **The schema is already complete.** `academic_years` has
   `planning / active / closed / archived`, `academic_periods` are rows
   with ordinals and dates, and `app.reject_write_to_archived_year()`
   enforces the archive as a trigger. Phase 2 is a **screen**, not a
   schema.
2. **Two constraints are missing and should land with the screen:**
   nothing prevents two `active` years in one school, and the brief's
   `locked` state does not exist (`closed` is the nearest and is enforced
   by nothing).
3. **Promotion is the missing act.** Phase 1 made enrolling one learner
   into a new year correct; a school does it fifteen hundred at a time.
   Rolling a section from Grade 9 to Grade 10 belongs in Phase 2, beside
   the year it creates — and it needs `enrollment_events` to record it,
   which is why it was not built before now.

Three terms stay three terms. `period_structure` remains data, and no
production code path assumes a count of periods — re-verified this phase.
