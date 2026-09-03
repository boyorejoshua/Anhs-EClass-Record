# Phase 2 — Demo readiness

**Status:** COMPLETE · **No migration** · **Demo data applied to production**
**Phase 3:** not started

---

## Scope

Make the platform demonstrable end to end for a principal, on the
school's three-term SY 2026–2027 calendar, using a controlled demo
dataset — because the school has not given us their learner list yet.

Not in scope, and not started: public enrolment, parent portal,
multi-school SaaS, AI, visual redesign.

## What was implemented

| | |
|---|---|
| **`supabase/demo-seed.sql`** | A marked demo dataset, built through the product's own RPCs |
| **`supabase/demo-seed-remove.sql`** | Takes it back out, and nothing else |
| **`supabase/tests/06_demo_workflow.sql`** | The demo script, as a test |
| **In-app User Guide** | Eleven plain-language steps on the Help screen |
| **`app/e2e/navigation-audit.mjs`** | Every menu item, every role, clicked — 198 checks |
| Fixes | Suite 04 made state-independent; guide step numbers made real text |

No migration was needed. Everything the workflow requires already
existed; this phase proved it and filled the gaps around it.

---

## Demo data

### What it is

| | |
|---|---|
| Section | **Demo 10-A** — Grade 10, ANHS, SY 2026–2027, adviser Juan Dela Cruz |
| Learners | **Demo Student 01–08**, numbers `DEMO-0001`…`DEMO-0008` |
| LRN | **none, ever** — see below |
| Classes | Mathematics 10, English 10, Science 10 (Core, 20/50/30) and MAPEH 10 (20/60/20), all taught by Maria Santos |
| Assessments | 4 per class per term — two Written Works, two Performance Tasks |
| Scores | 248, spread so the class average is realistic and nobody looks broken |
| Term 1 | complete |
| Term 2 | complete **except a deliberate gap: `DEMO-0003` is missing Written Work 2 and Performance Task 2 in all four classes — 8 scores**, so the missing-score state is visible |
| Term 3 | **empty on purpose**, so an untouched term sits beside finished ones |
| Submissions | none — see *why no grades are seeded* |

### How it is marked

`DEMO-` student numbers, `Demo Student NN` names, a section named
`Demo 10-A`, and `remarks = 'DEMO DATA — not an official record'`.

**No demo learner ever carries an LRN.** An LRN is a national
identifier: a demo record must not hold one, and a null LRN also means
these rows can never collide with a real learner imported later.

### Why no grades or submissions are seeded

Computed grades are the canonical engine's output, and the engine lives
in `compute-period-grades`. Reproducing its arithmetic in a seed would
be a second implementation of the grading rules — the one thing this
project does not allow. So the seed prepares scores and stops. The
lifecycle is driven through the product during the demonstration, which
is the part worth showing anyway.

### How to reset or remove it

```bash
psql "$DATABASE_URL" -f supabase/demo-seed.sql          # build or rebuild
psql "$DATABASE_URL" -f supabase/tests/06_demo_workflow.sql   # prove it works (rolls back)
psql "$DATABASE_URL" -f supabase/demo-seed-remove.sql   # take it out
```

The seed is **idempotent**: re-running removes the previous demo subtree
and rebuilds it, so a demonstration always starts from the same place.
Run it the morning of a demo to clear whatever the last one left behind.

### The safety guard

The seed only ever *adds* rows inside a subtree it names itself, so its
guard is proportionate rather than absolute:

- **Refuses** if a `DEMO-` learner somehow carries an LRN — that would
  mean something real acquired a demo number, and the rebuild would be
  unsafe.
- **Warns and continues** about learners of unknown provenance carrying
  an LRN. Nothing the seed does can touch them, but an LRN deserves a
  human's attention.

> ⚠️ **One such learner exists on production:** *Domingez, Philip G*,
> student number `001`, carrying an LRN, with no section and no classes.
> It was not created by `seed.sql` or by any script here. It looks like
> a manual test row from registrar testing, but **that has not been
> confirmed**, so nothing has touched it. Confirm and delete it, or
> clear its LRN, before the school's real list is imported.

---

## Demo workflow

The recommended sequence. Every step is covered by
`supabase/tests/06_demo_workflow.sql`, so it can be verified before
walking into the room.

**Before the demo** — run the seed, then run suite 06. Two minutes.

| # | As | Do | What it shows |
|---|---|---|---|
| 1 | **Teacher** (`maria@anhs.test`) | My Classes → **Demo 10-A · Mathematics 10** → Open class | Classes come from the registrar's assignment, not a spreadsheet |
| 2 | | Choose **Term 2** | Three terms, independent of each other |
| 3 | | **Setup** tab | The assessments *are* configuration — the school decides them |
| 4 | | **Grade Entry** tab | Type a score; the dot goes orange then green. No Save button to forget |
| 5 | | Press Enter a few times | Built for a teacher's hands: down a column, no mouse |
| 6 | | **Summary** tab | Grades computed by the server, with the subject's own weights |
| 7 | | Switch to **MAPEH 10**, Summary | The same learners, graded 20/60/20 instead of 20/50/30 — configuration, not code |
| 8 | | **Student Detail** | One learner across the whole term |
| 9 | | **LOA** tab | The learning-outcome report the school already uses |
| 10 | | **Analytics** (left menu) | Class average, pass count, the distribution |
| 11 | | Back to Term 2 → **Submission** tab | It names the missing score *before* submitting |
| 12 | | Fill the gap, then **Submit** | The moment it leaves the teacher's hands |
| 13 | **Adviser** (`juan@anhs.test`) | Incoming Grades → receive → forward | A chain of custody, not a shared folder |
| 14 | **Registrar** (`registrar@anhs.test`) | Grade Submissions → receive → approve → finalize → **publish** | Publishing is a decision somebody makes and signs for |
| 15 | **Student** | My Grades | Only what was published. Nothing before that moment |
| 16 | | My Profile · My Schedule | The learner's own record, resolved from their login |
| 17 | **Teacher** | Help | The guide a teacher reads on their first day |

**Term 3 is untouched** — worth showing at step 2. It makes the point
that a term is a real boundary, not a column heading.

### The one thing to say out loud

At step 14, before publishing: *"until I click this, no learner can see
these grades — and that is enforced in the database, not by hiding a
button."* That is the difference between this and a spreadsheet.

---

## Roles

| Role | Account | In the demo |
|---|---|---|
| Teacher | `maria@anhs.test` | Steps 1–12, 17 |
| Adviser | `juan@anhs.test` | Step 13 |
| Registrar | `registrar@anhs.test` | Step 14 |
| Administrator | `admin@anhs.test` | Not in the script; reaches everything the registrar does |
| Student | see limitations | Steps 15–16 |

## Grade lifecycle, as implemented

```
draft → in_progress → submitted
                          ↓
                      received            (adviser signs for it)
                          ↓
                      forwarded           (adviser passes it on)
                          ↓
                  registrar_received      (registrar signs for it)
                          ↓
        returned ⇄ approved → finalized → published
                                              ↓
                                          reopened
```

Ten states. The three middle ones are a **chain of custody** through the
adviser — how the school actually works, and more than a linear
draft→publish model expresses. `recall_grades` lets a teacher take a
submission back before anyone has signed for it. Every transition is an
RPC with a permission check and an audit row.

**Publication is the privacy gate, enforced in RLS** on `period_grades`
and `final_subject_grades` — a direct query returns exactly what the
portal shows.

## User Guide

**Help**, in the teacher's left menu. Eleven steps in plain language,
from *Open your class* to *If you need to fix something later*, each
with the one thing that most often goes wrong at that step. Below it,
the keyboard reference and the status glossary for a teacher's fifth day
rather than their first.

Step numbers are real text, not a CSS counter — a counter is invisible
to a screen reader and to anyone copying the guide into a handout.

## Testing performed

| | Result |
|---|---|
| Typecheck · Build | pass |
| Unit | **240** across 12 files |
| E2E | **21 suites**, ~530 checks |
| — `navigation-audit` | **198** — every menu item, every role |
| — `loa-report` | **28**, unchanged |
| Database suites 01–06 | **76 assertions**, 0 failures, repeatable |
| Production demo workflow | **12/12**, rolled back |

Both the local and production runs exercised the real functions. LOA,
the grading engine and the three-term model were not modified, and their
tests pass unchanged.

## Production status

- Demo dataset **applied**: 8 learners, 4 classes, 32 assessments, 248
  scores, 16 enrolment events. 0 submissions, 0 period grades, by design.
- The demo workflow was run against production functions **inside a
  transaction that was rolled back**, so the Term 1 submission the demo
  itself makes is still available.
- Nothing pre-existing was modified or deleted.

## Known limitations

1. **No student portal account for the ANHS demo.** Re-verified in
   Phase 2.1 against production: none of `DEMO-0001`…`DEMO-0008` has a
   portal account, so the demonstration's last beat — the learner
   opening their own record — has no demo learner to open it as.
   `joshua@anhs.test` is linked to Kent Ramirez in **Pearl**, not to the
   demo section, and as the owner it also holds `grades.read.all`, so
   its Student view reads through the *staff* policy and shows a final
   grade of 93 with all three terms blank. Correct, and confusing in
   front of a principal. **Do this before the demo**: Registrar →
   Students → a Demo Student → *Create portal account*. One minute,
   through the product. See `docs/28-principal-demo-checklist.md`.
2. ~~**`joshua@anhs.test` is a learner and an administrator at once.**~~
   **WITHDRAWN in Phase 2.1 — this was never a defect.** The school's
   owner has confirmed the account is the **system owner / developer
   account** and that its breadth is intentional. Do not remove roles
   from it and do not build a student-only replacement for it.
3. **Term 1 is not pre-published**, so step 15 shows nothing until the
   demo itself publishes something. Run steps 1–14 once beforehand if
   you want the portal populated from the start.
4. **The schedule is a list, not a grid** — unchanged from Phase 1.5.
   `class_meetings` is still future work.
5. **Seven demo passwords unrotated**, leaked-password protection off.
6. **Three planned routes** (Reports & Documents, Academic Years,
   Grading Configuration) render an explanation rather than a screen.
   Intentional, and the audit suite asserts they say why.

## Deferred

- **Excel import / migration** of the school's real list — the Import
  Center handles the three-term ECR workbook; student, enrolment and
  class importers are not built.
- **Public enrolment** — not started, by instruction.
- **Parent portal** — not started, by instruction.
- **SF1–SF10** beyond the SF10 preview: numbering, signatories, stored
  PDFs.
- **Structured `class_meetings`** for a real timetable.
- **Multi-school onboarding** — isolation is proven; a create-a-school
  path is not built.

## Standing facts

- **No actual school student data is available.** Everything shown is
  demo data, marked as such.
- Real data arrives through the future import phase, not by hand.
- LOA logic is preserved exactly.
- The platform is a multi-school product; ANHS is one tenant.
