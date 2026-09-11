# Known Issues

Active problems, technical debt and gaps. Each entry says what kind of
thing it is, because "bug" and "not built yet" need different responses.

**Nothing here is a guess about a *symptom*.** Where a previous session
described a problem and this audit found it fixed, that is recorded in
§ Resolved rather than left standing — a stale bug report costs as much
as a missing one.

Baseline status verified on **2026-09-05** against commit `8d51d5c` and a
database rebuilt from all 44 migrations + `seed.sql`. Auth status was updated
through an authorized read-only production check on **2026-09-12**.

Severity: **High** = blocks real learner data or a school going live ·
**Medium** = wrong behaviour or real risk, contained · **Low** =
cosmetic, latent, or unimplemented-by-choice.

---

## Open

### 1 · Leaked-password protection blocked by the current plan
**Security / plan blocker** · **High** · open since Phase 0

Joshua manually rotated the seven existing production demo/test-account
passwords on 2026-09-12. The corresponding accounts, pre-existing identities,
role assignments, and learner-link counts were verified unchanged through a
read-only production check; no credential values are recorded here.

Leaked-password protection remains unavailable while the connected Supabase
organization is on its current Free plan. Supabase documents the control as a
Pro-or-higher feature.

**Must be closed before any real learner data enters the system.** This
is still the single highest-severity item in the file. It is not a code change
or migration; it requires an explicitly authorized plan decision followed by a
Supabase Auth configuration change.

**Next step:** if Joshua separately authorizes a plan upgrade, enable
leaked-password protection in the Supabase dashboard for project
`wxkxdqwhefezjfmysypa`, then record only the non-secret completion state.

---

### 2 · No demo learner has a portal account yet
**Incomplete feature** · **Medium**

The demo dataset builds eight learners (`DEMO-0001`…`DEMO-0008`) but
none has a portal login, so the student-portal half of a demonstration
cannot be shown live.

**Not a defect** — the product path works. It is one minute of clicking:
Registrar → Students → a Demo Student → *Create portal account*. It is
the first item on `docs/28-principal-demo-checklist.md`, which defaults
to `DEMO-0001` if no learner is specified.

**Blocked on:** a decision to do it against production rather than as a
rehearsal to roll back.

---

### 3 · `app.reject_write_to_archived_year()` misses most tables
**Confirmed bug, latent** · **Medium**

**Current behaviour.** The trigger refuses writes to an archived year's
rows only on tables carrying `academic_year_id` **directly** —
`enrollments` and `classes`.

**Expected behaviour.** An archived year is read-only across all of its
data.

**Cause.** `assessments`, `period_grades`, `final_subject_grades` and
similar reach a year only via `class_id`, so the trigger's predicate
finds no column to test and is a no-op for them.

**Why it is not currently exploitable.** No in-app action archives a
year. Archiving is still "update the column directly", an onboarding-time
operation. So the gap is latent.

**It stops being latent the moment anyone builds an archive action** —
including as part of the Academic Years screen (D-015 deliberately left
that screen read-only). Whoever builds that must fix this first.

**Left unfixed deliberately:** patching 6+ more tables' triggers was out
of scope for "the minimum foundation" in Phase 2.2.

---

### 4 · `public.permissions` has no FORCE RLS
**Technical debt** · **Low** · found in Phase 2.1, re-confirmed 2026-09-05

The only table of 46 without FORCE RLS. Re-verified directly against a
rebuilt database, not taken on the previous session's word.

Contains no tenant data, has no `anon` access, and its single policy is
`USING (true)`. Reported and deliberately not changed — but it is an
exception to an otherwise complete invariant, so it will keep being
re-discovered by anyone auditing the schema. That is the actual cost.

---

### 5 · `principal` has no client-side mapping
**Unimplemented by choice** · **Low**

Seeded as a database role and held by the owner account, but the client
has no `ROLE_LABEL` and no `NAV` entry, so `rolesFromSession` filters it
out silently.

**This is not a bug — do not "fix" the filter.** No screen currently
needs the role. See `DECISIONS.md` D-018.

---

### 6 · `AGENTS.md` understates the database test prerequisites
**Documentation gap** · **Low** · found by this audit, 2026-09-05

`AGENTS.md` says the database suites "need a Postgres rebuilt from every
migration plus `seed.sql`". That is true for suites 01–05 and **false for
06**, which asserts against the `DEMO-` dataset and needs
`supabase/demo-seed.sql` loaded as well.

**Observed failure:** `FAIL 1. the demo class is in the teacher's My
Classes`, then `ERROR: no grading scheme resolves for class <NULL>` — a
failure that reads like a schema defect and is not one.

Corrected in `PROJECT-STATE.md` § Current Test Status. `AGENTS.md` itself
was updated in the same commit.

---

### 7 · E2E browser assets must be installed from the pinned local Playwright
**Environment setup requirement** · **Medium** · updated 2026-09-11

The e2e suites now import exact local `playwright@1.56.0` through
`app/e2e/playwright.mjs`. Its browser assets live in ignored
`app/.playwright-browsers/`, not in a global npm prefix or shared cache. A
clean clone must run `cd app && npm ci && npm run e2e:install-browser` before
it can launch an E2E suite. Do not install Playwright globally.

On this Windows environment, Node 26.5.0 downloaded Chromium build 1194 but
stalled while extracting it; Node 24.19.0 completed the same pinned install
and ran the focused browser regression. This is an observed environment
interaction, not a claim that Node 26 is unsupported. Full recipe and scope
are in `PROJECT-STATE.md` § Current Test Status.

---

### 8 · Chunk size warning on production build
**Technical debt** · **Low**

`npm run build` succeeds but warns: `index-*.js` is 745.88 kB
(201.83 kB gzipped) and `three-term-*.js` 343.59 kB (117.83 kB gzipped),
both over Vite's 500 kB advisory.

No user-visible problem reported. Recorded so it is a known, accepted
state rather than a surprise. The obvious lever is a dynamic import for
the Excel import path, which is the heaviest thing most users never
touch.

---

### 9 · Grade persistence audit never written
**Documentation gap** · **Low** · long-standing, task #33

`docs/grade-persistence-audit.md` is referenced as an outstanding item
but does not exist. It is an audit document, not code.

---

## Resolved — do not re-report these

Previous sessions raised these; this audit confirmed each is fixed. They
are kept because a handoff that only lists open problems invites
re-investigation of closed ones.

| Was reported | Actual status 2026-09-05 |
|---|---|
| **Role switching inaccessible / not working** | **Fixed** in Phase 2.2. Root cause: `role` in `App.tsx` read `roleOverride` only when `DEMO_MODE` was on, but `roleOverride` also backs the sidebar "Your roles" switcher, which renders in every build for any multi-role account. Extracted to `resolveActiveRole()` in `app/src/nav.ts`, covered by 33 unit tests in `nav.test.ts` (all passing), and verified live in a `VITE_DEMO_MODE=false` build. |
| **Reports / documents not displaying as expected** | **Partly fixed, partly never built.** The *display* bug was real and is fixed: `ReportPicker` and `ConsolidatedGrades` discarded `status` from `AcademicYear` and so defaulted to `years[0]`, which a `planning` next year sorts ahead of. Both now match `App.tsx`'s `.find(active) ?? [0]`. But a **Reports & Documents screen** and **SF9 / SF1–SF8 generation** were never built — see `ROADMAP.md` § Deferred. Do not read "reports don't work" as one bug; it is a fixed defect plus an unbuilt feature. |
| **LOA reporting broken** | **Not reproducible.** `loa.test.ts` passes 18 unit tests, `e2e/loa-report.mjs` passes. `app/src/lib/loa.ts` is authoritative and unchanged. If a specific LOA symptom is still seen, it needs a fresh report — the old one does not survive this evidence. |
| **Analytics broken** | **Not reproducible.** `e2e/analytics-parity.mjs` passes. |
| **Student portal broken** | **Not reproducible.** `e2e/student-schedule.mjs` and `student-detail.mjs` pass; `my_academic_history()` verified against a rebuilt database. Issue #2 above (no demo learner *has* a portal account) is the likely origin of this report — an empty portal is not a broken portal. |
| **Class / enrollment relationship problems** | **Not reproducible.** `supabase/tests/04_lifecycle_rehearsal.sql` (29 checks) and `e2e/enrollment-lifecycle.mjs` both pass. The historical defects — rosters never syncing, a learner unable to rejoin a class, history with no deterministic order — were found and fixed in Phase 1.5. |
| **Academic years: only one year could exist / archiving deleted data** | **Never true of the current schema.** Verified 2026-09-05: no `unique(school_id)` on `academic_years` (only `unique(school_id, label)`); a third year inserts without violation. `app.reject_write_to_archived_year()` refuses writes without touching data, and `seed.sql` exercises it for real. Caveat: issue #3 above bounds *how much* it protects. |

> **On the "Resolved" column generally.** Six of these seven were
> reported as active problems in the context handed to this migration.
> The repository disagreed. Where a test now covers the behaviour, the
> test is the evidence cited. Where the report may have described a
> real-but-different thing (the portal, the reports screen), that is said
> explicitly rather than declared fixed.

---

## Not issues — deliberate constraints

Listed because each has been mistaken for a bug at least once.

- **Free-text class schedule.** `classes.schedule_note` is shown
  verbatim and never parsed into times. D-013.
- **No Grading Configuration screen.** Schemes are data, but editing
  them mid-year would alter grades already computed under the old
  scheme. D-016.
- **Academic Years is read-only.** No create/close/archive action, by
  design. D-015.
- **Term 3 empty and Term 2 missing 8 scores in the demo data.** Both
  intentional — they demonstrate the unstarted-term state and the
  missing-score workflow.
- **The owner account holds many roles.** Intentional. D-014.
