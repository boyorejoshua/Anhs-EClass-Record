# Phase 1.5 — Rehearsal results

**Status:** COMPLETE · **Migration:** 0043 (one read function, additive)
**Applied to production:** yes · **Phase 2:** not started, awaiting approval

---

## 1. What was tested

The whole journey, against real functions, twice — once on a database
rebuilt from all 43 migrations plus `seed.sql`, and once on **production**
inside a transaction that was rolled back.

```
student → enrolment → section → class membership → teacher → assessment
  → grade entry → submission → adviser → registrar → finalize → publish
  → student portal → schedule
```

Plus permissions for four roles, tenant isolation across both seeded
schools, the three Phase 1 fixes as explicit regressions, and the full
existing suite.

## 2. What passed

| Suite | Result |
|---|---|
| Local lifecycle rehearsal (`supabase/tests/04`) | **29/29** |
| Local schedule + tenancy (`supabase/tests/05`) | **13/13** |
| Production rehearsal, rolled back | **16/16** after the harness fix in §4 |
| Tenant isolation (`01`) | 34 assertions |
| Student privacy (`02`) | 4 assertions |
| My-classes contract (`03`) | 4 assertions |
| Unit | **240** across 12 files |
| E2E | **20 suites**, ~334 checks |
| Typecheck · Build | pass |

The chain that had never run now demonstrably runs:

```
PASS  1. admitted + enrolled via PRODUCTION functions
PASS  2. [P1 fix] joined 2 existing class(es)
PASS  3. [P1 fix] events in deterministic order: enrolled -> section_change
PASS  4. learner appears on the teacher's roster
PASS  5. assessment created: {"removed": 0, "written": 11}
PASS  6. marks written: {"written": 7}
PASS  7. period grade persisted BEFORE submission: 1 row
PASS  8. teacher submitted: submitted
PASS  9. adviser received and forwarded: forwarded
PASS 10. registrar received, approved, finalized, PUBLISHED: published
PASS 11. every transition audited: 15 rows
PASS 12. portal resolves the learner from the token alone
PASS 15. my_schedule() on production: enrolment=Pearl, 2 class(es)
PASS 16. every class on it is the learner's own: 0 foreign
```

## 3. What failed

Nothing in the product. Two rehearsal checks reported FAIL on production
and were **defects in the test harness**, diagnosed rather than explained
away — see §4.

## 4. Defects discovered

### D1 — `save_assessments` takes the COMPLETE set for a period *(product behaviour, correct)*

The first rehearsal sent one assessment and was refused: *"cannot remove
an assessment that already has scores; clear its marks first."* The
function treats its payload as the whole set for the period, so a teacher
adding a written work must send the existing ones too — which the
gradebook screen does. **Not a defect; a guard doing its job.** Recorded
because no unit test had ever shown it.

### D2 — `record_period_grades` refuses after finalization *(product behaviour, correct)*

The rehearsal initially persisted the period grade *after* finalizing and
was refused: *"this period is finalized and its grades cannot be
changed."* The authoritative grade must exist **before** the record
leaves the teacher's hands — which is exactly what `compute-period-grades`
does, persisting and then submitting in one invocation.

**This is the single most valuable thing the rehearsal established**, and
no unit test could have: the order is *persist → submit → … → finalize →
publish*, and any future caller that inverts it will be refused.

### D3 — one learner had two Mathematics 10 rows *(real defect, fixed)*

`getMyGrades` in the fixtures returned `CLASSES.slice(0, 2)` — Mathematics
10 in **Pearl** *and* Mathematics 10 in **Diamond**. One learner enrolled
in the same subject twice, in two sections, in one year. Nobody is.

It also collided the React key `${academicYearId}-${subjectCode}` on the
grades table, and React's console warning is the only thing that said so:
**a duplicate key means a row can be silently omitted from a learner's
own grade list.**

Found by navigating to My Grades as a student in the new e2e suite —
existing suites had never rendered both rows together.

### D4 — the rehearsal harness lost its identity *(harness, fixed)*

The role loop in the security suite printed nothing at all. Cause:
looking up `public.users` while holding a *student's* claims returns no
rows (RLS, correctly), so `select … into v_u` left the previous value and
the loop silently tested the wrong identity. Identity lookups now run as
superuser before dropping privilege, and the suite says so in a comment.

### D5 — the production rehearsal picked a multi-role account *(harness, fixed)*

Two production checks reported a learner seeing 8 students and 14 class
enrolments. **This was not an RLS failure.** The harness took the first
student with a portal account, which on production is:

| Learner | Account | Roles that account holds |
|---|---|---|
| Ramirez, Kent | `joshua@anhs.test` | adviser + principal + registrar + school_admin + student + teacher |
| Yu, Andrea Tan | `learner@demo.test` | student |

RLS was correct: that account **is** a registrar and an administrator, so
it sees everyone. Re-run against the student-only account:

```
effective_role            authenticated
resolves_a_learner        true
students_visible          1
class_enrolments_visible  1
enrolments_visible        1
period_grades_visible     0
schedule_section          Sampaguita
schedule_classes          1
foreign_classes           0
```

**Operational finding, not a code defect:** a production account is
linked as a *learner* while holding administrator and registrar. That is
a demo convenience and it is dangerous if it survives contact with a real
school — one login would be both a student and an administrator. Listed
in §15 beside the standing "rotate the demo passwords" item.

## 5. Root causes

| # | Root cause |
|---|---|
| D1 | Whole-set semantics never documented outside the function body |
| D2 | The persistence order lived only inside the Edge Function; nothing stated it |
| D3 | A fixture asserted something the domain forbids, and a React key assumed a uniqueness the fixture broke |
| D4 | RLS applied to the harness's own lookups; a `SELECT … INTO` that matches nothing leaves the variable unchanged |
| D5 | "First student with a portal account" is not "a student-only account" |

## 6. Fixes

- **D3:** the fixture now returns the learner's **Pearl** classes, so My
  Grades and My Schedule describe the same person; the React key includes
  the section so it cannot collide.
- **D4, D5:** both suites fixed and kept in the repository, with the trap
  documented in each header so the next person does not repeat it.
- **D1, D2:** documented in `supabase/tests/04`'s header, where the next
  person to touch the chain will read them.

## 7. Database changes

**One migration, one read function, entirely additive.** No table, no
column, no policy, no permission, no data.

```sql
rds.my_schedule()      -- SECURITY INVOKER, no parameters
public.my_schedule()   -- wrapper; granted to authenticated, revoked from public + anon
```

Rollback is `drop function public.my_schedule(); drop function rds.my_schedule();` —
nothing depends on it.

## 8. Schedule findings

Searched the migrations and the app for `schedule`, `timetable`,
`start_time`, `end_time`, `day_of_week`, `room`, `time_slot`:

| Column | Type | Set by |
|---|---|---|
| `classes.schedule_note` | `text`, e.g. `'MWF 8:00-9:00'` | free-typed |
| `classes.room` | `text` | free-typed |
| `sections.room` | `text` | free-typed |

**There is no schedule schema.** No day, no start time, no end time, no
meeting table, no teacher timetable, no room booking. The day and time
exist only inside an unparsed string a person typed.

## 9. Schedule implementation

Derived entirely from existing structures — **no new schema**:

```
verified JWT → app.current_student_id() → enrolment in the ACTIVE year
   → class_enrollments (status 'active') → classes → subject, teacher,
     schedule_note, room
```

The screen shows Subject · Teacher · When · Room, with `when` **verbatim**.

> **It does not parse `schedule_note`.** Turning `'MWF 8:00-9:00'` into a
> Monday 08:00 row would invent structure the database does not hold,
> from a string nothing validates. A learner shown a confidently wrong
> start time is worse served than one shown the note their teacher wrote.

Absent fields say so — *"not assigned yet"* for a teacher, *"not
scheduled yet"* for a time, `—` for a room — rather than leaving blanks
the reader has to interpret. `class_enrollments.status = 'active'` means
the schedule agrees with the roster: a learner transferred out of Pearl
keeps their marks there and stops appearing on its timetable.

### Proposed for approval, NOT built

A real day-by-day grid needs:

```sql
class_meetings (
  id, school_id, class_id,
  day_of_week smallint,   -- 1..7
  starts_at time, ends_at time,
  room text,
  unique (class_id, day_of_week, starts_at)
)
```

…plus an editor for teachers or the registrar, plus a migration path for
existing `schedule_note` text (which cannot be parsed reliably, so it
would be a manual re-entry). That is substantial new schema **and** a
scheduling-management module — **stop conditions 1 and 8**. Phase 1.5
stops here and asks.

## 10. Security results

| Check | Result |
|---|---|
| `my_schedule()` takes no parameter; learner from the JWT | PASS |
| A learner sees exactly one learner — themselves | PASS (production and local) |
| No other learner's class membership is readable | PASS — 0 visible |
| Unpublished period grades invisible | PASS — 0 visible |
| Every class on the schedule is the learner's own | PASS — 0 foreign |
| Staff calling `my_schedule()` get no learner's timetable | PASS — null enrolment, 0 classes |
| `anon` has no EXECUTE on `my_schedule` | PASS |
| Teacher cannot approve their own submission | PASS |
| Only the student role has the menu entry | PASS (4 roles checked in the browser) |

Both UI **and** database were tested: the e2e suite proves the menu and
the screen, the SQL suites prove that a direct query returns the same
thing. Nothing here relies on client-side protection.

## 11. Tenant-isolation results

School A → School B, counted across `students`, `enrollments`, `classes`,
`period_grades` and `enrollment_events`:

```
PASS  a School A school_admin sees 0 School B row(s)
PASS  a School A registrar    sees 0 School B row(s)
PASS  a School A teacher      sees 0 School B row(s)
PASS  a School A adviser      sees 0 School B row(s)
PASS  cannot transfer a School B learner  -> enrolment not found
PASS  nor withdraw one                    -> enrolment not found
PASS  nor give one a portal account       -> No such learner in this school.
```

The three write attempts pass **real** School B ids, resolved as
superuser first. An earlier version let RLS hide the ids and passed on
*"a section is required"* — technically green, but proving the wrong
thing.

## 12. Regression results

All 20 e2e suites and all 240 unit tests pass:

accounts 29 · analytics-parity 16 · class-roster 27 · classes-and-sections 12 ·
consolidated-grades 9 · custody-chain 18 · enrollment-lifecycle 21 ·
global-reports 15 · import-center 16 · import-choices 10 · legibility 13 ·
**loa-report 28** · recorded-grades · school-setup 16 · student-detail 16 ·
student-directory 17 · student-management 14 · **student-schedule 14** ·
subjects-and-admin 23 · teacher-add-class 21

**LOA is unchanged** — no file under `app/src/lib/loa.ts` was touched and
its 28 checks pass. **The grading engine is unchanged** — the vendored
copy still diffs clean. **Three terms remain three terms.**

## 13. Production verification

- Migration 0043 applied; `my_schedule` present in both `rds` and
  `public`, granted to `authenticated`, revoked from `anon`.
- The full lifecycle ran against production functions and rolled back.
- A real production learner's schedule resolves: Sampaguita, 1 class, 0
  foreign.

## 14. Cleanup results

Every rehearsal ran inside a transaction ending in `rollback`. Verified
afterwards on production:

| | |
|---|---|
| test students (`lrn 000000000001`) | **0** |
| students named Zzztest | **0** |
| rehearsal user accounts | **0** |
| assessments titled "Rehearsal WW" | **0** |
| `grade_submissions` | **0** (as before) |
| `period_grades` | **0** (as before) |
| `enrollment_events` | **0** (as before) |
| total students | **8** (unchanged) |
| total enrolments | **9** (unchanged) |
| audit rows for `grade_submissions` | 6, all dated 22–26 Aug — **0 created today** |

**No orphaned auth identity was created**, because none could be: on
production `public.users.id` carries a foreign key to `auth.users`
(`users_auth_fk`), so a portal account cannot be fabricated in SQL at
all. Only a real GoTrue identity satisfies it — which is precisely why
`manage-users` must mint one, and is a difference from the local database
worth knowing.

## 15. Remaining limitations

1. **No timetable model.** The schedule is a list, not a grid, until
   `class_meetings` exists (§9). Awaiting approval.
2. **No schedule administration.** Teachers and registrars still type
   `schedule_note` free-hand on the class forms. Unchanged this phase.
3. **No historical schedule.** Current enrolment only, by design.
4. **`grade_submissions` and `period_grades` are still empty on
   production** — the rehearsal proved the chain works and then rolled
   back. They fill when a real teacher submits.
5. **The GoTrue round trip was not exercised in the rehearsal.** Portal
   *authorization* was proven at the database; portal *sign-in* is
   covered by the `accounts` e2e suite.
6. ~~**`joshua@anhs.test` is a learner and an administrator at once**~~
   **(D5) — WITHDRAWN in Phase 2.1. This was never a finding.**
   The school's owner has confirmed that `joshua@anhs.test` is the
   **system owner / developer account**, and that its holding every role
   at once is deliberate. It is not to be split, narrowed, or replaced.
   What D5 actually found stands and is worth keeping: a *test harness*
   that picks "the first learner with a portal account" will pick this
   one and report an RLS failure that is not there. Pick the account by
   name. See `docs/28-principal-demo-checklist.md` §Owner account.
7. **The seven demo passwords are still unrotated**, and leaked-password
   protection is still off in Supabase Auth. Both standing from Phase 0.

## 16. Recommended Phase 2 scope

**Academic year and academic structure**, unchanged from the Phase 1
recommendation, with one addition earned this phase.

1. **The schema is complete; Phase 2 is a screen.** `academic_years` has
   its statuses, `academic_periods` are rows, and
   `app.reject_write_to_archived_year()` enforces the archive as a
   trigger.
2. **Two constraints should land with the screen:** nothing prevents two
   `active` years in one school, and the brief's `locked` state does not
   exist (`closed` is the nearest and is enforced by nothing). The
   schedule now depends on `status = 'active'` picking exactly one year,
   which makes the first of these more than tidiness.
3. **Promotion is the missing act** — rolling a section into next year,
   which needs `enrollment_events` to record it.
4. **Decide on `class_meetings`** (§9) — a small, separable piece of
   Phase 2 that would turn the schedule list into a real timetable.

Three terms stay three terms. `period_structure` remains data, and no
production code path assumes a count of periods — re-verified this phase.
