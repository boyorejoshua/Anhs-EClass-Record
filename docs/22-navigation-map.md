# 22 — Navigation Map

*Every role, every screen, and whether it is built.*

The source of truth is `app/src/nav.ts`. This document describes it;
`app/src/nav.test.ts` enforces it. A menu entry marked `ready` must have
a case in App's `screen()` switch or the test suite fails.

---

## The rule

> Navigation state decides what renders. A route either opens its own
> screen, or opens an explicit **Not available yet** page naming what it
> depends on. It never silently renders a different screen.

Before this phase, 13 of 27 menu entries rendered the dashboard.

---

## Route model

```ts
type RouteId =
  | 'dashboard'
  | 'classes' | 'class' | 'attendance' | 'reports' | 'submissions' | 'help'
  | 'consolidated'
  | 'students' | 'enrollments' | 'queue' | 'records' | 'documents'
  | 'setup' | 'years' | 'users' | 'sections' | 'grading'
  | 'profile' | 'history';

interface Route {
  id: RouteId;
  classId?: string;    // set for 'class'
  tab?: ClassTab;      // which workspace tab
  studentId?: string;  // set for 'records' once a learner is chosen
}
```

`class` is never a menu entry — it is reached by opening a class, and
carries its tab in the route so that opening from the dashboard, from My
Classes, or from a registrar queue row each lands where that journey
expects.

No React Router. The application is a single authenticated shell with no
deep-linking requirement yet; a route-shaped state model carries its
weight and a router would not. When shareable URLs are needed — a
registrar sending a colleague a link to one submission — that is the
point to add one.

---

## Subject Teacher

| Menu | Route | Status | Screen |
|---|---|---|---|
| Dashboard | `dashboard` | ✅ | Counts, returned-submission callout, class cards. Every tile navigates |
| My Classes | `classes` | ✅ | Filter by status, search, progress bar, Open |
| Attendance | `attendance` | ✅ | Class picker → workspace Attendance tab |
| Submissions | `submissions` | ✅ | Class picker → workspace Submission tab |
| Reports | `reports` | ✅ | Class picker → workspace Reports tab |
| Help | `help` | ✅ | Gradebook keyboard reference, status glossary, save-failure guidance |

## Advisory Teacher

Everything above, plus:

| Menu | Route | Status | Blocked on |
|---|---|---|---|
| Consolidated Grades | `consolidated` | ⏳ | Period grades being materialised (docs/21 §4) |

## Registrar

| Menu | Route | Status | Screen / blocker |
|---|---|---|---|
| Dashboard | `dashboard` | ✅ | Queue counts by status; every tile opens the queue |
| Grade Submissions | `queue` | ✅ | Review · Return · Approve · Finalize · Publish |
| Students | `students` | ✅ | Server-side search by name, LRN, student number |
| Academic Records | `records` | ✅ | Learner picker → SF10 |
| Enrollments | `enrollments` | ⏳ | Import pipeline, docs/10 |
| Reports & Documents | `documents` | ⏳ | Document engine, docs/11 |

## School Administrator

| Menu | Route | Status | Screen / blocker |
|---|---|---|---|
| Dashboard | `dashboard` | ✅ | Academic year and its periods, read-only |
| School Setup | `setup` | ⏳ | Onboarding-time configuration |
| Academic Years | `years` | ⏳ | Onboarding-time; archiving is trigger-enforced |
| Users | `users` | ⏳ | Auth identity creation must be server-side |
| Classes & Sections | `sections` | ⏳ | Onboarding-time |
| Grading Configuration | `grading` | ⏳ | Already data; editing mid-year would alter computed grades |

## Student

| Menu | Route | Status | Screen |
|---|---|---|---|
| My Grades | `dashboard` | ✅ | Published periods only; unreleased reads as “—” |
| My Profile | `profile` | ✅ | Identity · Enrolment · Address. Read-only |
| Academic History | `history` | ✅ | One row per school year, expandable to that year's grades |

---

## Class workspace

Reached by opening a class. All six tabs are built.

| Tab | What it does |
|---|---|
| Overview | Four tiles, each opening the tab it summarises |
| Gradebook | The grid — unchanged by this phase |
| Attendance | Per-date marking against the school's own status rows |
| Students | Roster with student number, LRN, enrolment status, final grade |
| Reports | CSV exports and print; planned reports marked as such |
| Submission | Validate → confirm → submit, with live status |

Header controls: **Export ▾** (Gradebook CSV, Grade summary CSV, Print)
and **Submit / View submission**, which jumps to the Submission tab.

---

## The workflow, as navigation

```
TEACHER                          REGISTRAR                     STUDENT
───────────────────────────────  ────────────────────────────  ──────────────
Dashboard
  └ class card
Class ▸ Gradebook   enter marks
Class ▸ Submission  validate
                    submit  ───▶ Grade Submissions
                                   ├ Review ──▶ Class ▸ Gradebook
                                   ├ Return (reason) ──┐
                                   ├ Approve           │
                                   ├ Finalize          │
                                   └ Publish ──────────┼────▶ My Grades
Dashboard ◀── returned callout ────────────────────────┘       My Profile
Class ▸ Gradebook   correct                                    Academic History
Class ▸ Submission  resubmit ──▶ …
```

Each arrow is an RPC that writes an audit row and refuses an illegal
transition. The UI reads the same transition table to decide which
buttons to *offer*; the database decides what is *allowed*.

---

## Status vocabulary

Seven statuses are stored. `in_progress` is the eighth thing you will see
on screen and is **derived, never stored** — `draft` with at least one
score entered. Migration 0007's CHECK does not include it.

| Shown | Stored | Editable | Meaning |
|---|---|---|---|
| Draft | `draft` | ✅ | Nothing entered |
| In progress | `draft` (derived) | ✅ | Partly entered, not sent |
| Submitted | `submitted` | ○ | With the registrar |
| Returned | `returned` | ✅ | Sent back with a reason |
| Approved | `approved` | ○ | Accepted, not final |
| Finalized | `finalized` | ○ | Closed, not released |
| Published | `published` | ○ | Visible to learners |
| Reopened | `reopened` | ✅ | Unlocked for correction |

---

## Not-available screens

A planned route renders `NotAvailable`, which states the feature, why it
is not there, and which design document covers it. The note text lives on
the nav entry in `nav.ts`, and `nav.test.ts` requires every planned entry
to carry one of at least 40 characters — a dead end is acceptable, an
unexplained one is not.
