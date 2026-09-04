# 29 · Where the project stands

**Mendtrix Academic Records Platform · as of 3 September 2026**

One page, kept current. For the detail behind any line, follow the
reference. For the demonstration itself, use
`docs/28-principal-demo-checklist.md`.

---

## In one paragraph

The platform is **built, deployed and demonstrable**. A subject teacher
can set up a record book, enter a term's marks, see them computed under
the correct DepEd DO 015 s.2026 weights, and submit; an adviser receives
and forwards them; a registrar approves, finalizes and publishes; and
the learner then — and only then — sees the grade. That whole chain runs
on live Supabase, enforced in the database rather than in the browser.
What is *not* done is the school's real data: no learner roster, no
official forms, and no rotated credentials. The next real milestone is
not a feature, it is onboarding.

## Where each part is

| Area | State | Notes |
|---|---|---|
| Database, RLS, tenancy | **Done** | 44 migrations, 46 tables, FORCE RLS on 45 of them. Tenant from a verified JWT claim, never a client parameter |
| Permission model | **Done** | 43 permission codes, composable roles. Every write RPC gates on one |
| Grading engine | **Done** | One TypeScript module, run in the browser for feedback and in a Deno Edge Function as the authority. DO 015 Core and MAPEH/TLE trees, transmutation as data |
| Grade lifecycle | **Done** | Ten states plus recall. Every transition is an RPC that writes an audit row |
| Publication gate | **Done** | Enforced in RLS on `period_grades` and `final_subject_grades`, not in application code |
| Teacher screens | **Done** | Record book setup, grade entry grid, summary, analytics, LOA, attendance, submission |
| Adviser screens | **Done** | Incoming grades, consolidated grades, forward |
| Registrar screens | **Done** | Submission queue, students, sections and classes, subjects, academic records |
| Administrator | **Done** | Everything the registrar reaches, plus school setup and users |
| Student portal | **Done** | My Grades, My Profile, My Schedule, Academic History |
| Student master records | **Done** | Admit, enrol, transfer section, withdraw with reason, re-enrol. Nothing is ever deleted |
| Portal provisioning | **Done** | Through the `manage-users` Edge Function; a GoTrue identity cannot be made in SQL |
| Excel import | **Done** | The school's own three-term workbook parses, previews, and commits |
| User guide | **Done** | In-app, reachable by every role, with a section per role |
| Demo dataset | **Done** | `demo-seed.sql` — marked, idempotent, removable |
| SF9 report card | **Partial** | SF10 data source and preview exist; SF9 is not built |
| SF1–SF8 | **Not started** | Strategy is written (`docs/05`); templates are not |
| Attendance forms | **Partial** | Capture and monthly summary work; formal SF2/SF4 deferred |
| Reports & Documents | **Planned** | Renders an explanation, not a screen |
| Academic Years UI | **Planned** | Schema is complete; the screen is not built. Years are seeded during onboarding |
| Grading Configuration UI | **Planned** | Deliberately deferred — editing a scheme mid-year would alter grades already computed under it |
| Parent portal, notifications, SMS | **Out of scope** | Unchanged from the MVP definition |

## What the last four phases did

| Phase | Delivered | Doc |
|---|---|---|
| **0** | Current-state audit of the whole platform | `23` |
| **1** | Student master records, enrolment events, section transfer, duplicate and namesake guards, portal account provisioning | `24` |
| **1.5** | Whole academic lifecycle rehearsed against a rebuilt database; student schedule added on existing schema only | `25`, `26` |
| **2** | A marked demonstration dataset, the in-app guide, a navigation audit of 198 checks | `27` |
| **2.1** | Hardening and verification. Six defects found and fixed, two findings withdrawn, one reported and left alone | this, `28` |

### What Phase 2.1 found

Every one of these was found by *running* the thing, not by reading it.

1. **An unstarted term looked broken.** Grade Entry drew the full roster
   with an em dash in every cell and no explanation — the only one of
   four Record Book tabs that did not say why it was empty, and the
   first screen a principal clicking Term 3 would meet. *Fixed.*
2. **Demo mode did not match the demo data.** The fixtures scored all
   three terms; the production dataset seeds two and stops. So the state
   most likely to embarrass a demonstration was the one state never
   rendered. *Fixed — and it exposed the next two.*
3. **Importing into an empty term silently imported nothing.** The
   import decided which columns to create by consulting the shared
   assessment template rather than the period's own list, created none,
   matched no marks, and reported success. *Fixed.*
4. **Marks entered into an empty term were dropped.** Replaying a saved
   score skipped any learner with no existing score row. Silent: the
   grid simply rendered blank. *Fixed.*
5. **The guide was reachable only by the subject teacher.** The
   registrar — the likeliest person to be handed this system cold, and
   the only one who can publish — could not open it, and it described
   only a teacher's job anyway. *Fixed: Help is in every menu, with a
   section per role.*
6. **Two RPCs were executable by `anon`.** `students_directory` and
   `grade_level_census`. Neither leaked — both are SECURITY INVOKER and
   are refused at the `rds` schema boundary, which was verified rather
   than assumed — but the grant contradicted the project's own rule.
   *Fixed in migration 0044, applied to production.*

**Withdrawn, having been wrong:** that `joshua@anhs.test` holding every
role is a defect. It is the system owner account and its breadth is
intentional. Phases 1.5 and 2 recorded it as a finding; `docs/26` and
`docs/27` now say otherwise.

**Reported, not changed:** `public.permissions` is the only table
without FORCE RLS. No tenant data, no `anon` access, one policy of
`USING (true)`. Altering owner-side RLS semantics days before a
demonstration is the riskier move.

## What is verified, and how

| | |
|---|---|
| Unit tests | 241, passing |
| End-to-end suites | 23, passing — real browser, real screens |
| SQL suites | 6, 109 assertions, against a database rebuilt from all 44 migrations |
| Typecheck, build | clean |
| Tenant isolation | 34 assertions, table by table, no foreign row visible |
| Publication gate | re-verified against a genuinely student-only account |
| `anon` reach | no function outside an extension, locally and in production |

## The three things that actually block a school going live

Not features. These are the order they have to happen in.

1. **The school's data.** No learner roster, no section list, no
   staff list has been supplied. Everything in the system today is
   seed or demonstration data. This is an onboarding conversation, not
   a build task.
2. **Credentials.** Seven demo passwords are unrotated and
   leaked-password protection is off in Supabase Auth. Standing since
   Phase 0. This must close before a single real learner exists.
3. **The forms the school files.** SF9 in particular. A school cannot
   leave Excel behind while it still needs Excel to print a report
   card. See `docs/05` for the strategy and `docs/12` for where it sits
   in the roadmap.

## The dates that shape what comes next

- **Term 3 opens 4 January 2027** — the realistic pilot window.
- **SY 2027–2028 opens ~June 2027** — full deployment, and the year
  **zero-based grading replaces transmutation** across DepEd. Every
  Excel template every school owns breaks that year. The engine already
  treats transmutation as data keyed by effective school year, so
  absorbing it is a configuration change here and a crisis elsewhere.
  That is the commercial argument, and it has a date on it.
