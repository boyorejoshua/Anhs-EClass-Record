# Phase 1.5 — Validation plan

**Scope:** validate the academic lifecycle end to end, and add a student-facing
Schedule if the existing architecture supports one. **Not** Phase 2. **Not** a
scheduling-management system.

---

## Current relevant architecture

| Layer | State |
|---|---|
| Identity | `students.id` UUID; LRN and student number are attributes. Portal identity resolves server-side from `app.current_student_id()` — no client-supplied id anywhere |
| Enrolment | `students` → `enrollments` → `class_enrollments`, with `enrollment_events` written since Phase 1 |
| Grading | One canonical engine (`app/src/lib/grading`), vendored into the `compute-period-grades` Edge Function and diff-checked on every build |
| Submission | Ten states, guarded transitions, audit row per transition |
| Publication | Gate lives in **RLS** on `period_grades` / `final_subject_grades`, not in application code |
| Portal | `my_profile`, `my_grades`, `my_academic_history` — no parameters |

## Existing lifecycle components — all present, none exercised on production

`grade_submissions` and `period_grades` are still **empty** on production. Every
state transition, the Edge Function's grade persistence, and the publication gate
have run only in tests.

## Existing schedule capability — partial, and free-text only

Searched the migrations and the app for `schedule`, `timetable`, `start_time`,
`end_time`, `day_of_week`, `room`, `time_slot`. What exists:

| Column | Type | Set by | Shown today |
|---|---|---|---|
| `classes.schedule_note` | `text`, e.g. `'MWF 8:00-9:00'` | teacher / registrar, free-typed | My Classes, Dashboard |
| `classes.room` | `text` | same | My Classes |
| `sections.room` | `text` | registrar | Classes & Sections |

**There is no schedule schema.** No day, no start time, no end time, no meeting
table, no teacher timetable, no room booking. The day and time exist only inside
an unparsed string a person typed.

### What that permits, and what it does not

A student schedule can be **derived entirely from existing structures**:

```
authenticated student → app.current_student_id()
   → enrollments (active academic year)
      → class_enrollments (status 'active')
         → classes → subjects, users, schedule_note, room
```

That yields Subject, Teacher, When (the note, verbatim), and Room — every field
from the authoritative model, nothing fabricated.

It does **not** yield a day-by-day timetable grid. Producing one would mean
parsing `'MWF 8:00-9:00'`, and that string has no guaranteed format: it is free
text with no validation, so a parser would be inventing structure the database
does not hold. A learner shown a confidently wrong Monday 08:00 is worse served
than one shown the note their teacher actually wrote.

**Decision: reuse, do not invent.** Phase 1.5 ships the derived schedule. A real
timetable needs a `class_meetings (class_id, day_of_week, starts_at, ends_at,
room)` table plus an editor for it — documented in the results as a proposal,
**not built**, because it is substantial new schema and business logic (stop
condition 1 and 8).

---

## What will be tested

The full journey, not the unit tests:

```
student → enrolment → section → class membership → teacher → assessment
  → grade entry → submission → adviser → registrar → finalize → publish
  → student portal → schedule
```

Plus the three Phase 1 fixes as explicit regressions: new enrolment joins
existing classes; re-enrolment restores membership; event ordering is
deterministic.

Plus permissions for administrator / registrar / teacher / student, and tenant
isolation across the two seeded schools.

## What will be changed

1. **Migration 0043** — `rds.my_schedule()` / `public.my_schedule()`. One read
   function, no parameters, additive. No table, no column, no policy change.
2. `DataSource.getMySchedule()`, with Supabase and fixture implementations.
3. A `schedule` route in the student menu, and a `StudentSchedule` screen.
4. Tests for all of the above, plus any defect the rehearsal uncovers.

## What will NOT be changed

- **LOA** — business logic, calculations, banding, tests. Untouched.
- **The grading engine** — no rewrite, no rule change, no recalculation.
- **The three-term model** — no fourth term, no trimester change.
- RLS, authentication, the DataSource abstraction, tenant isolation, UUID
  identity, enrolment history, role permissions.
- No schedule-management module for teachers or registrars.
- No historical schedule browsing.

---

## Production safety strategy

The preferred order is a dedicated test tenant, then reversible production
records, then transaction/rollback, then a production-equivalent environment.
Phase 1.5 uses **rollback on production plus a production-equivalent local
environment**, and says plainly what each one proves.

| Where | How | What it proves | What it cannot prove |
|---|---|---|---|
| **Production** | The entire lifecycle inside one transaction, `rollback` at the end | The real deployed functions, the real RLS policies, the real seeded data shapes | Anything needing a GoTrue identity — an auth user cannot be created and destroyed inside a Postgres transaction |
| **Local, rebuilt from all migrations + seed** | Same SQL, plus the browser journey | The same, and the UI path end to end | Nothing about production drift |
| **Production, read-only** | Smoke queries after deployment | The new function exists, is granted correctly, and returns for a real learner | — |

**No production academic data is created permanently.** A rolled-back
transaction leaves no rows, no sequence gaps that matter, and no audit entries.
Portal *sign-in* is validated at the database boundary — `app.current_student_id()`
resolving from a JWT claim and RLS refusing everything else — which is where the
enforcement actually lives; the GoTrue round trip is covered by the existing
`accounts` e2e suite.

## Success criteria

- Every step of the journey succeeds against production functions, or a defect
  is recorded with its root cause.
- A student sees their own published grades and schedule; unpublished grades and
  every other learner's data are refused **at the database**, not just hidden.
- School A cannot reach School B, for all four roles.
- LOA's 28 checks and the grading engine's tests pass unchanged.
- Typecheck, build, unit, database and e2e suites all green.
- Nothing temporary remains anywhere.

## Stop conditions

Work stops and asks before: a substantial new schedule schema; rewriting or
recalculating existing academic data; changing the grading engine or LOA;
weakening RLS; changing authentication; a destructive migration; or cleanup
that cannot be performed safely.

**Already triggered and handled by documenting rather than building:** a real
timetable needs new schema (conditions 1 and 8). Phase 1.5 ships the derived
schedule instead and proposes the schema for approval.
