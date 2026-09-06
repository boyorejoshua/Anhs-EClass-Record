# Known Issues

Active problems, technical debt and gaps. Each entry says what kind of
thing it is, because "bug" and "not built yet" need different responses.

**Nothing here is a guess about a *symptom*.** Where a previous session
described a problem and this audit found it fixed, that is recorded in
§ Resolved rather than left standing — a stale bug report costs as much
as a missing one.

Bulk status as of **2026-09-05**, verified against commit `8d51d5c` and a
database rebuilt from all 44 migrations + `seed.sql`. Amended
**2026-09-06**: the portal-account entry was re-checked against
production and moved to § Resolved, and #3 and #7 were re-measured. The
rest still rests on the 2026-09-05 audit.

> **Numbering changed on 2026-09-06.** The old #2 ("no demo learner has a
> portal account") was written from a snapshot that predated the
> 2026-09-04 session which actually created one; it has moved to
> § Resolved and everything below it shifted up by one. Two
> cross-references elsewhere in the docs — `ARCHITECTURE.md` on
> `public.permissions`, `DECISIONS.md` on the archived-year trigger —
> were already written against the numbering *without* that entry, and
> are now correct again rather than off by one.

Severity: **High** = blocks real learner data or a school going live ·
**Medium** = wrong behaviour or real risk, contained · **Low** =
cosmetic, latent, or unimplemented-by-choice.

---

## Open

### 1 · Demo passwords unrotated; leaked-password protection off
**Technical debt / security** · **High** · open since Phase 0

Seven demo accounts still carry their original passwords, and
leaked-password protection is disabled in Supabase Auth.

**Must be closed before any real learner data enters the system.** This
is the single highest-severity item in the file. It is not a code change
— it is a Supabase Auth configuration change plus a password rotation,
so no migration will fix it and no test will catch it.

**Next step:** rotate all seven, enable leaked-password protection in
the Supabase dashboard for project `wxkxdqwhefezjfmysypa`.

---

### 2 · `app.reject_write_to_archived_year()` misses most tables
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

### 3 · `public.permissions` has no FORCE RLS
**Technical debt** · **Low** · found in Phase 2.1, re-confirmed 2026-09-05

The only table of 46 without FORCE RLS. Re-verified directly against a
rebuilt database, not taken on the previous session's word.

Contains no tenant data, has no reachable `anon` access, and its single
policy is `USING (true)`. Re-checked 2026-09-06: that policy is
`roles={authenticated}`, and RLS is *enabled* (only FORCE is off, which
matters solely to the table owner) — so `anon` is refused despite holding
the default Supabase `SELECT` grant on the table. Reported and
deliberately not changed — but it is an
exception to an otherwise complete invariant, so it will keep being
re-discovered by anyone auditing the schema. That is the actual cost.

---

### 4 · `principal` has no client-side mapping
**Unimplemented by choice** · **Low**

Seeded as a database role and held by the owner account, but the client
has no `ROLE_LABEL` and no `NAV` entry, so `rolesFromSession` filters it
out silently.

**This is not a bug — do not "fix" the filter.** No screen currently
needs the role. See `DECISIONS.md` D-018.

---

### 5 · `AGENTS.md` understates the database test prerequisites
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

### 6 · E2E Playwright version must match the installed browser build
**Documentation gap / environment trap** · **Medium** · found by this audit

The e2e suites resolve Playwright from the **global** npm prefix, not
`app/node_modules`. `npm install -g playwright` installs the newest
release, which demands a browser revision that is not present, and **all
23 suites then fail identically** with `Executable doesn't exist at
.../chromium_headless_shell-<n>`.

That failure says nothing about the application, but it looks
catastrophic, and it will cost the next agent an hour if undocumented.

**Fix:** install the Playwright version matching the browser build under
`PLAYWRIGHT_BROWSERS_PATH`. In the Claude Code web container that is
build **1194** → **`playwright@1.56.0`**. Full recipe in
`PROJECT-STATE.md` § Current Test Status.

---

### 7 · Chunk size warning on production build
**Technical debt** · **Low**

`npm run build` succeeds but warns: `index-*.js` is 747.08 kB
(202.21 kB gzipped) and `three-term-*.js` 343.59 kB (117.83 kB gzipped),
both over Vite's 500 kB advisory. (Re-measured 2026-09-06; `index` grew
1.2 kB with the Help ordering fix, `three-term` is unchanged.)

No user-visible problem reported. Recorded so it is a known, accepted
state rather than a surprise. The obvious lever is a dynamic import for
the Excel import path, which is the heaviest thing most users never
touch.

---

### 8 · Grade persistence audit never written
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
| **Student portal broken** | **Not reproducible.** `e2e/student-schedule.mjs` and `student-detail.mjs` pass; `my_academic_history()` verified against a rebuilt database. The likely origin of this report is that no demo learner *had* a portal account to look at — an empty portal is not a broken portal. One exists as of 2026-09-04 (see the last row of this table). |
| **Class / enrollment relationship problems** | **Not reproducible.** `supabase/tests/04_lifecycle_rehearsal.sql` (29 checks) and `e2e/enrollment-lifecycle.mjs` both pass. The historical defects — rosters never syncing, a learner unable to rejoin a class, history with no deterministic order — were found and fixed in Phase 1.5. |
| **Academic years: only one year could exist / archiving deleted data** | **Never true of the current schema.** Verified 2026-09-05: no `unique(school_id)` on `academic_years` (only `unique(school_id, label)`); a third year inserts without violation. `app.reject_write_to_archived_year()` refuses writes without touching data, and `seed.sql` exercises it for real. Caveat: issue #2 above bounds *how much* it protects. |
| **No demo learner has a portal account** | **Done 2026-09-04, and this file said otherwise until 2026-09-06.** `DEMO-0001` (student `0bec19a0-…`) carries `portal_user_id b0696620-…` → `demo.student01@anhs.test`, status `active`, holding the `student` role and no other. Term 1 for all four Demo 10-A classes was computed with the canonical engine and driven through the full custody chain to **published**; the learner's own `my_grades()` returns a real grade in each of the four subjects. Re-verified by direct query on 2026-09-06 — `must_change_password` now reads `false`, so the account has been signed into since it was made. Records: `docs/session-log/2026-09-04-qa-triage-and-demo-account.md`. |

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
