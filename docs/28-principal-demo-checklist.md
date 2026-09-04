# 28 · Principal demonstration checklist

**Phase 2.1 · verified 3 September 2026 against production
(`wxkxdqwhefezjfmysypa`) and against a database rebuilt from all 44
migrations plus `seed.sql`.**

One question decides whether this phase is finished:

> Can Joshua open the system in front of the principal and demonstrate
> the complete academic workflow without needing a developer to fix
> anything?

This is the sheet to run from. It is deliberately short. Everything on
it has been executed, not just read.

---

## Before the day

Four things, in order. The first is the only one that is not optional.

| # | Do this | Why | How long |
|---|---|---|---|
| 1 | **Give one demo learner a portal account.** Registrar → Students → Grade 10 → `Demo Student 01` → *Create portal account* | Without it there is no learner to sign in as, and the demonstration cannot show its last and best beat. See *Owner account* below for why the owner's own login is not a substitute. | 1 min |
| 2 | Run steps 1–14 once yourself, then publish | Step 15 shows a learner their published grades. If nothing has ever been published, it is honestly empty — correct, but a flat ending | 10 min |
| 3 | Open the app once on the actual laptop and network you will use | The typeface is fetched from Google Fonts. On a slow or filtered school network it falls back to a system face — legible, but not what you rehearsed | 1 min |
| 4 | Have `docs/27-phase-2-demo-readiness.md` open in a second tab | It carries the full 15-step script. This sheet is the checklist, not the script | — |

## Owner account — intentional, not a defect

`joshua@anhs.test` is the **system owner / developer account**. It holds
`school_admin`, `registrar`, `adviser`, `teacher`, `principal` and
`student` simultaneously, **by design**. Do not remove roles from it, do
not narrow it, and do not create a student-only replacement for it.

Two consequences to know before you stand in front of anyone:

- **It is not a student.** It is linked to Kent Ramirez in **Pearl**, not
  to the demo section, and because it holds `grades.read.all` its
  My Grades screen reads through the *staff* policy. It shows a final
  grade of 93 with all three terms blank. That is the publication gate
  working exactly as designed — but it looks broken. Demonstrate the
  learner view with the demo account from step 1 above.
- **It will mislead a test harness.** Anything that picks "the first
  learner with a portal account" picks this one and reports an isolation
  failure that is not there. This cost an hour in Phase 1.5. Pick
  accounts by name.

The publication gate itself was re-verified in Phase 2.1 against a
genuinely student-only account (`learner@demo.test`):
`ce_all_periods_published = false`, `finalGrade: null`, every term null.
It holds.

## The demo data

Seeded by `supabase/demo-seed.sql`, verified in production on the date
above.

| | |
|---|---|
| Section | **Demo 10-A**, Grade 10 |
| Learners | `DEMO-0001` … `DEMO-0008`, **no LRN, ever** |
| Marked | every enrolment carries `DEMO DATA — not an official record` |
| Classes | MATH10, ENG10, SCI10 (Core, WW20/PT50/EX30) + MAPEH10 (WW20/PT60/EX20) |
| Term 1 | complete — 4 assessments × 8 learners × 4 classes = 128 scores |
| Term 2 | 120 scores. **`DEMO-0003` is missing Written Work 2 and Performance Task 2 in all four classes — 8 gaps**, so the missing-score workflow has something to find |
| Term 3 | **empty on purpose.** Nothing is set up. Every Record Book tab says so in a sentence |
| Submissions | **zero.** Nothing is pre-submitted; the workflow is driven live |
| Total | 32 assessments, 248 scores |

Re-running `demo-seed.sql` rebuilds the same dataset — verified by
applying it twice and counting: still 8 learners, still 248 scores.
`demo-seed-remove.sql` takes the subtree away and leaves the school's
seven real learners untouched, with no orphaned rows anywhere.

## The three terms, and what each one is for

This is the part most likely to draw a question, so it is worth knowing
what each term is demonstrating.

| Term | State | What it shows |
|---|---|---|
| **Term 1** | Complete | The happy path. Enter, compute, submit, receive, forward, approve, finalize, publish |
| **Term 2** | 8 missing scores | That the system **names the gap before it lets you submit**. The Submission tab reports `71% · 142 of 200 scores entered · 58 missing` and offers *Review missing* |
| **Term 3** | Empty | That an unstarted term **says it is unstarted**. All four Record Book tabs show "Nothing to enter yet / Nothing to summarise yet / No data to analyse / No achievement data yet", each with an *Open Setup* button |

Term 3 mattered more than it looks. Until Phase 2.1 the Grade Entry tab
drew the full roster with an em dash in every cell and no explanation —
the one screen of the four that did not say why it was empty, and the
first thing a principal clicking Term 3 would see.

## The run itself

The full script is §Demo script in `docs/27`. In outline:

1. **Owner** — sign in, show the school, the year, the three terms
2. **Teacher** — open Demo 10-A MATH10, Term 1, walk the grade entry grid
3. **Teacher** — Summary, then Analytics: the class at a glance
4. **Teacher** — switch to **Term 2**, open Submission: *it names the missing scores before it will submit*
5. **Teacher** — switch to **Term 3**: *it says the term has not started*
6. **Teacher** — back to Term 1, Submission → Submit
7. **Adviser** — Incoming Grades → receive → Consolidated Grades → forward
8. **Registrar** — Grade Submissions → receive → approve → finalize → **publish**
9. **Learner** — sign in as the demo account from step 1: My Grades now shows the published term, My Schedule shows their classes
10. **Anyone** — Help, which every role can now open

## If something goes wrong

| Symptom | Cause | What to say / do |
|---|---|---|
| A term looks empty | Term 3 is meant to be | Click it — the screen explains itself. This is the point |
| The learner sees nothing | Nothing has been published for them yet | Correct behaviour. Publish in step 8 first |
| A final grade shows with blank terms | You are signed in as the owner, not a learner | Switch to the demo learner account |
| A screen says "planned" | Reports & Documents, Academic Years, Grading Configuration | Deliberate. Each says why in a sentence |
| The type looks different | Google Fonts did not load | Cosmetic only |

## What is still open

Carried forward honestly rather than quietly closed.

1. **Seven demo passwords are unrotated**, and leaked-password protection
   is off in Supabase Auth. Standing since Phase 0. Rotate before any
   real learner data enters the system.
2. **`public.permissions` is the only one of 46 tables without FORCE row
   level security.** It holds 43 permission codes, has no `school_id`,
   `anon` cannot select it, and its one policy is `USING (true)` — so
   forcing it would change nothing visible. Reported rather than changed
   days before a demonstration.
3. **The schedule is a list, not a grid.** `class_meetings` is future
   work; `classes.schedule_note` is shown verbatim and never parsed.
4. **Three routes are planned, not built** — Reports & Documents,
   Academic Years, Grading Configuration. Each renders an explanation,
   and `e2e/navigation-audit.mjs` asserts they do.
5. **Attendance is capture and summary only.** Formal SF2/SF4 remain a
   fast-follow.

## What was verified for this sheet

Not inspected — executed.

| Check | Result |
|---|---|
| Unit tests | 241 passed |
| End-to-end suites | 23 passed, 0 failed |
| Typecheck, production build | clean |
| `01_tenant_isolation.sql` | 34 assertions, no foreign rows |
| `02_student_privacy.sql` | 13 assertions |
| `03_my_classes_contract.sql` | 7 assertions |
| `04_lifecycle_rehearsal.sql` | 29 assertions |
| `05_schedule_and_tenant_security.sql` | 15 assertions |
| `06_demo_workflow.sql` | 11 assertions, against the seeded demo data |
| `demo-seed.sql` applied twice | idempotent — 8 learners, 248 scores |
| `demo-seed-remove.sql` | demo gone, 7 real learners untouched, zero orphans |
| Functions executable by `anon` | none outside an extension, locally and in production |
| Publication gate, student-only account | holds — no grade visible before publication |
