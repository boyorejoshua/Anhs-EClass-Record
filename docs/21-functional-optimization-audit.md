# 21 — Functional Optimization Audit

*Post-planning implementation phase. What was found, what was fixed, what was deliberately left.*

---

## The headline finding

**Navigation was decorative.** `navKey` was held in App state and read in
exactly one place:

```tsx
// App.tsx, before
const showSf10 = navKey === 'records' || navKey === 'history';
```

Every other menu entry fell through to a ternary that rendered *the
dashboard, or the gradebook if a class happened to be open*. So:

| Clicked | Rendered |
|---|---|
| Attendance | Dashboard |
| Reports | Dashboard |
| Submissions | Dashboard |
| Help | Dashboard |
| Students · Enrollments · Grade Submissions · Reports & Documents | Dashboard |
| School Setup · Academic Years · Users · Classes & Sections · Grading Configuration | Dashboard |
| My Profile | Dashboard |

Nothing errored. The wrong screen simply appeared — the hardest class of
defect to notice, because the application looks like it is working.

That is now structurally impossible: `src/nav.ts` holds the route model,
App's `screen()` is a single switch over it, and `src/nav.test.ts`
asserts every menu entry marked `ready` has a case. Adding a menu entry
without a screen fails the test run.

---

## 1. Problems discovered

### Dead controls

| # | Problem | Evidence |
|---|---|---|
| 1 | Navigation rendered the wrong screen for 13 of 27 menu entries | `App.tsx` — `navKey` read once |
| 2 | **`Submit {period}`** had no `onClick` | `ClassWorkspace.tsx` — `<button className="btn btn-primary btn-sm" disabled={!gradebook.editable}>` |
| 3 | **`Export`** had no `onClick` | same file, line above |
| 4 | 5 of 6 class workspace tabs rendered “Not built yet” | `ClassWorkspace.tsx` — `tab === 'gradebook' ? … : <div className="empty">` |
| 5 | Dashboard stat tiles were `<div>`s — a missing-score count with no way to reach it | `TeacherDashboard.tsx` |

### Fabricated data rendered as fact

| # | Problem | Evidence |
|---|---|---|
| 6 | Sidebar badge “2” hard-coded on teacher Submissions | `Sidebar.tsx` — `count: 2` |
| 7 | Sidebar badge “8” hard-coded on registrar Grade Submissions | `Sidebar.tsx` — `count: 8` |
| 8 | Breadcrumb hard-coded `Teaching / My Classes` on every screen | `App.tsx` |
| 9 | SF10 always loaded one hard-coded learner | `App.tsx` — `SF10_DEMO_STUDENT = 'a8000000-…-005'` |

### Role handling

| # | Problem | Evidence |
|---|---|---|
| 10 | Role hard-coded to `teacher` and never derived from the session | `App.tsx` — `useState<Role>('teacher')` |
| 11 | `user.roles` built as `[role]`, discarding the user's real roles | `App.tsx` — a registrar signing in got the teacher menu |
| 12 | No handling for an account with no role at all | would render an empty teacher shell |

### Data-model drift

| # | Problem | Evidence |
|---|---|---|
| 13 | `in_progress` in the TypeScript union is **not a database status** — migration 0007's CHECK allows `draft/submitted/returned/approved/finalized/published/reopened` | `data/types.ts` vs `0007_grades_workflow.sql` |
| 14 | Fixtures emitted `in_progress`, so the "mirrors the database exactly" fixture layer produced a value the backend cannot return | `data/fixtures.ts` |

### Security

| # | Problem | Evidence |
|---|---|---|
| 15 | **A student could read final grades with nothing published.** `final_grades_read_student` checked ownership only, while `period_grades_read_student` correctly checked `app.ce_period_is_published` | verified live: the seeded learner read 93.00 and 85.00 with 0 published submissions |
| 16 | `subject_categories.grading_scheme_id` described in docs/06 but never created | found earlier, fixed in 0014 |
| 17 | `anon` could execute every workflow RPC | found earlier, fixed in 0016/0017 |

### Missing states

Every async screen had, at most, one shared banner at the top of the app
and a blank body underneath. Loading, empty, error and retry were not
distinguishable — a teacher on a school connection cannot tell a slow
request from an empty class from a broken one.

---

## 2. Problems fixed

### Navigation and shell (P0)

- **`src/nav.ts`** — route model. `RouteId` union, per-role menus, and a
  `readiness` field per entry. A route is `ready` (App handles it) or
  `planned` (renders `NotAvailable`). No third state.
- **`App.tsx`** rewritten around one `screen()` switch. Navigation state
  decides what renders, always.
- **`components/NotAvailable.tsx`** — the honest dead end. Names the
  feature, says what it depends on, points at the design document.
- **Role from session.** `rolesFromSession` / `defaultRole` derive from
  `session.user.roles`; `roleOverride` is demo-only and gated on
  `DEMO_MODE`. An account with no role now gets an explicit screen.
- **Real multi-role switching.** A user holding both teacher and adviser
  gets a switcher offering only roles the database granted — the case V0
  could not express at all, since its role column is a mutually
  exclusive CHECK.
- Hard-coded badge counts removed. Breadcrumb derives from the route.

### Screens built

| Screen | File |
|---|---|
| My Classes — filters, search, progress, Open | `screens/MyClasses.tsx` |
| Class Overview | `screens/ClassWorkspace.tsx` |
| Class Students | `screens/ClassStudents.tsx` |
| Class Attendance | `screens/ClassAttendance.tsx` |
| Class Reports | `screens/ClassWorkspace.tsx` |
| Class Submission | `screens/ClassSubmission.tsx` |
| Registrar dashboard / queue / students | `screens/Dashboards.tsx`, `RegistrarQueue.tsx`, `RegistrarStudents.tsx` |
| Admin dashboard | `screens/Dashboards.tsx` |
| Student grades / profile / history | `screens/StudentPortal.tsx` |
| Help — gradebook keyboard reference | `screens/Help.tsx` |

### The submission workflow

Three explicit steps, none of them faked:

1. `validate_submission` against the **server**, not local state — the
   client cannot see what another tab has done.
2. Confirmation naming what will be locked. Submission is not a save; it
   takes the gradebook away from the teacher.
3. `submit_grades` RPC, then re-read the real status.

Errors block. Warnings require acknowledgement, and
`p_acknowledge_warnings` is an argument the **server** checks — not a
client courtesy.

### Registrar review

`return_grades` (reason required, enforced by the database),
`approve_grades`, `finalize_grades`, `publish_grades`. Which buttons
appear comes from the same transition table `app.assert_transition`
enforces; the refusal itself happens in the database.

### Export

`lib/export.ts` — gradebook CSV, summary CSV, print. A UTF-8 BOM is
prepended because Excel on Windows otherwise renders "Peñaflor" as
"PeÃ±aflor" on first open, which Filipino names make immediate rather
than theoretical.

### Loading / empty / error / retry

`components/Async.tsx` — `useAsync` with request sequencing (a superseded
response is discarded, which is the race that shows the wrong term's
grades under the right term's heading), plus `Skeleton`, `ErrorState`,
`EmptyState` and an `Async` renderer. Used by every async screen.

### The publication gate (migration 0018)

`app.ce_all_periods_published` plus a rewritten
`final_grades_read_student`. A final grade is a year-level record with no
single period, so the rule is "every submission for this enrolment is
published, and at least one exists". Verified live: the learner went from
seeing 2 final grades to 0.

### New database contracts (migration 0018)

`rds.submission_queue`, `rds.class_students`, `rds.students`,
`rds.attendance`, `public.save_attendance`, `rds.my_profile`,
`rds.my_grades`, `rds.my_academic_history` — all SECURITY INVOKER, all
with `search_path` pinned, all revoked from `anon`.

The three portal functions **take no student id.** The learner is
resolved from `app.current_student_id()`, which reads the verified JWT. A
student id accepted as a parameter is an IDOR that no amount of frontend
care prevents.

### SF10

`SF10_DEMO_STUDENT` is gone. The registrar picks a learner from the
directory; the server decides whether that caller may read the record.

---

## 3. Two bugs the browser found that tests did not

Worth recording, because both were introduced by *me* during this work
and neither would have shown up in a unit test.

1. **Role switch left a registrar inside a teacher's gradebook.** The
   reset effect skipped `route.id === 'class'`, and the class workspace
   is not a menu entry.

2. **The naive fix stopped classes opening at all.** Resetting whenever
   the route was not in the current menu bounced every "Open class"
   straight back to the dashboard — `class` is never in a menu.

The fix keys on the *role* changing, via a ref. Both were caught by
driving the real built app in Chromium, which is why that check is worth
keeping.

---

## 4. Problems intentionally deferred

### ⚠️ Period grades are never materialised — the top item

`submit_grades` moves the submission's status. Nothing writes
`period_grades`. Verified live: after a full
`submit → approve → finalize → publish` chain, the student could read
their `final_subject_grades` row and **zero** `period_grades`.

So the chain in the brief —

```
TEACHER ENCODES → SYSTEM CALCULATES → TEACHER SUBMITS → … → STUDENT ACCESSES
```

— is missing *SYSTEM CALCULATES* as a persisted step. The gradebook
computes correctly in the browser for immediate feedback, and that number
is currently never stored.

**Why it was not fixed here.** The obvious shortcut is to reimplement the
grading engine in PL/pgSQL inside `submit_grades`. `docs/07` explicitly
rejects that: one engine, one implementation, no drift. Transmutation
bands, a two-level component tree, excused-vs-missing handling and
rounding modes reimplemented in a second language is precisely the
divergence that document exists to prevent — and a grading engine that
disagrees with itself is the worst possible bug in this product.

**The correct fix** is a Supabase Edge Function running the same
TypeScript module in Deno, invoked during submission, writing
`period_grades` with `scheme_snapshot` populated. That is a backend
task; this phase was scoped to the frontend.

**Consequence until then.** The student portal shows enrolled subjects
with grades withheld. That is honest — an unpublished grade is *supposed*
to read as "not released" — but a published period will also read that
way until the computation exists. The portal is correct about permission
and incomplete about content.

### Deferred, by design

| Feature | Why |
|---|---|
| Consolidated Grades (adviser) | Needs period grades materialised first |
| Enrollments (registrar) | Needs the import pipeline in docs/10; no registrar enrols 1,500 learners by hand |
| Reports & Documents | Needs docs/11 — atomic numbering, frozen signatories, stored artifacts. A client-side PDF would look official without being official |
| School Setup, Academic Years, Classes & Sections | Onboarding-time configuration |
| Users | Creating an auth identity with a tenant in `app_metadata` must be server-side; a client holding the anon key must never mint accounts |
| Grading Configuration | Already data rather than code. Editing mid-year would alter grades already computed under the old scheme |
| XLSX export | V0's `excelGrades()` already emits the DepEd workbook shape; docs/10 says that ports across rather than being re-derived |
| SF9 report card | Same pipeline as SF10 — the document engine |

Every one of these is reachable from its menu and says exactly this when
opened.

---

## 5. Database changes

`supabase/migrations/0018_app_contracts_and_publication_gate.sql`

- `app.ce_all_periods_published(uuid)` — new predicate
- `final_grades_read_student` — **replaced**, now publication-gated
- `rds.submission_queue`, `rds.class_students`, `rds.students`,
  `rds.attendance`, `rds.my_profile`, `rds.my_grades`,
  `rds.my_academic_history` — new read contracts
- `public.save_attendance` — new write path; refuses a date that is not a
  class day in the school calendar, because inventing one would silently
  change the expected-days denominator on SF2 and SF4
- Public wrappers, per function
- `search_path` re-pinned across all 64 of our functions

No table was altered. No column was added. The existing schema already
supported everything these contracts read.

---

## 6. Security changes

| Change | Effect |
|---|---|
| Publication gate on final grades | A student cannot read a final grade until every period is published |
| Portal functions take no student id | The IDOR class of bug is unreachable by construction |
| `search_path` pinned on new functions | Consistent with 0016 |
| New functions revoked from `anon` | Consistent with 0017 |
| Role derived from session | The UI no longer shows a teacher menu to a registrar; the database was always the boundary, but the menu now agrees with it |

The frontend role still controls **only** which navigation is drawn. RLS
and the workflow RPCs remain the authorization boundary.

---

## 7. Tests added

45 new, 73 total, all passing.

| File | Count | Covers |
|---|---|---|
| `src/nav.test.ts` | 13 | Every ready route is handled; every planned route is explained; role resolution, including no-role and unknown-role |
| `src/lib/status.test.ts` | 14 | Derived `in_progress`; `pct` with a zero denominator; the transition table matches migration 0010 **and** the fixture copy; illegal transitions refused |
| `src/data/workflow.test.ts` | 18 | Validation errors vs. warnings; acknowledgement required; double-submit refused; queue excludes drafts; return requires a reason; approve→finalize→publish order; publish-without-finalize refused; student sees only published periods; portal signatures take no student id; weekend is not a class day |
| `src/lib/grading/grading.test.ts` | 28 | Unchanged — the engine was not touched |

**Browser smoke test** (`Chromium`, the real built bundle): 6/6 distinct
screens per teacher menu entry, 6/6 class tabs rendering content, real
validation on the submission panel, registrar queue with live actions,
planned route showing NotAvailable, all three student screens, no
horizontal overflow at 390px. Only network failure is Google Fonts,
blocked by this sandbox's egress policy.

---

## 8. Remaining risks

| Risk | Severity | Note |
|---|---|---|
| Period grades not materialised | **High** | The published grade a learner sees does not exist as a stored value yet. Needs the Edge Function |
| No `period_grades` means no SF9/SF10 grade columns from live data | Medium | SF10 renders structure correctly; grade cells come from `period_grades` |
| Attendance has capture but no SF2/SF4 | Medium | docs/12 scopes these as a Phase 2 fast-follow, before the school's first monthly filing |
| Admin configuration is onboarding-only | Medium | A school cannot self-serve a new academic year |
| `in_progress` is derived, not stored | Low | Documented in `lib/status.ts`. If a future migration adds it as a real status, that derivation must be removed |
| Bundle is 518 kB | Low | One chunk. Code-splitting is worthwhile before the document engine adds a renderer |
| Demo credentials exist on the live project | Medium | Must be deleted before any real learner record is loaded |

---

## 9. What did not change

Per the brief: no redesign. No new component library, no new typeface, no
replaced CSS. `styles/screens.css` uses only tokens already defined in
`tokens.css` — verified mechanically by diffing the tokens it references
against the tokens the file defines.

The grading engine was not touched. No bug was found in it.

The gradebook grid was not rewritten. Keyboard model, paste, autosave,
dirty tracking, retry, gaps filter, bulk mode, excused state, locked
state and the mobile card fallback are all as they were.
