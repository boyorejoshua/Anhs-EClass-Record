# Project State

Compact, current. Read this before re-deriving anything from the
conversation, `git log`, or other docs. Detailed history lives in
`docs/session-log/` and the phase docs (`docs/23`–`docs/29`); this file
is the index into them, not a replacement.

## Product

Mendtrix Academic Records Platform — a multi-tenant DepEd school records
and grading system. Angono National High School (ANHS) is the first
tenant; the product is not ANHS-specific. React + TypeScript + Vite
frontend, Supabase (Postgres + Auth + Edge Functions) backend, RLS as
the tenant/security boundary.

## Current Phase

**Phase 2.2 — role switching + academic year lifecycle foundation.**
Complete and **merged to `main`** via PR #44 (squash commit `6136091`,
confirmed `merged: true` via the GitHub API, not inferred). Vercel
production deploy was triggered on the merge (commit `6136091`,
target `production`), confirmed `READY` and aliased to
`anhs-grading-system.vercel.app`.

**Phase B — demo student account + rehearsal — done, with one caveat.**
Joshua ran a manual five-role walkthrough of production
(`docs/31-manual-role-observations-2026-09-04.md`), flagging three items
for a follow-up session. All three were investigated and resolved as
intentional/not-a-bug (no code changed) — see
`docs/session-log/2026-09-04-qa-triage-and-demo-account.md`. The real
demo student portal account (`demo.student01@anhs.test`, linked to
DEMO-0001) was then created for real against production, and Term 1 for
all four Demo 10-A classes was computed, submitted, received, forwarded,
approved, finalized, and genuinely **published** — confirmed by the demo
student's own `my_grades()` session showing real Term 1 grades. **The one
open caveat: this environment's network policy blocked reaching the
production URL, so no live browser walkthrough of the actual UI happened
this session** — the backend workflow is proven correct end-to-end, but
Joshua still needs to open the app on his own laptop/network (checklist
item 3) before presenting, per the verdict in that session log.

The feature branch `claude/mendtrix-eclass-architecture-x0z7ef` was
**not deleted** — left as a rollback reference per instruction.

## Completed Phases

- **0** — current-state audit (`docs/23`)
- **1** — student master records, enrolment lifecycle, portal
  provisioning (`docs/24`)
- **1.5** — whole academic lifecycle rehearsed against a rebuilt
  database; student schedule added on existing schema (`docs/25`, `26`)
- **2** — marked demo dataset, in-app guide, navigation audit (`docs/27`)
- **2.1** — hardening pass: unstarted-term empty state, demo/fixture
  parity, guide reachable by every role, two `anon`-executable RPCs
  closed (migration 0044) (`docs/28`, `29`)
- **2.2** — this phase (below)

## What Phase 2.2 did

1. **Fixed multi-role switching outside DEMO_MODE.** Root cause: `role`
   in `App.tsx` was computed as
   `(DEMO_MODE ? roleOverride : null) ?? sessionRole ?? 'teacher'`.
   `roleOverride` backs TWO switchers — the DEMO_MODE preview grid AND
   the sidebar's "Your roles" group, which renders for any REAL account
   holding more than one role, in every build. Outside DEMO_MODE the
   formula never read `roleOverride` at all, so a genuinely multi-role
   account (the owner account among them) could click a different role
   and see nothing change. Extracted the fix into `resolveActiveRole`
   (`app/src/nav.ts`), unit-tested (`app/src/nav.test.ts`), and verified
   live in a browser built with `VITE_DEMO_MODE=false` (production's
   actual flag) walking Administrator → Registrar → Advisory Teacher →
   Subject Teacher → Student → Administrator.

2. **Audited the academic year architecture — mostly already correct.**
   Verified against a database rebuilt from all 44 migrations + seed:
   - Multiple years already coexist (no `unique(school_id)` constraint,
     only `unique(school_id, label)`). Confirmed by inserting a third
     year for the seeded school with no violation.
   - Archiving already means historical, not deleted:
     `app.reject_write_to_archived_year()` refuses writes to an
     archived year's rows (even for an admin) without touching existing
     data. `seed.sql` exercises this for real — creates a prior year,
     populates it with enrolment/grade rows, then archives it.
   - Historical records stay reachable: `my_academic_history()` reads
     `enrollments` by student with no filter on year status.
   - The active year/term were already found correctly at the top of
     the app (`App.tsx`'s session-load effect,
     `.find(status === 'active') ?? [0]`), not from a hardcoded date,
     browser storage, or role state.
   - Registrar already cannot administer years: `school.config.write`
     (gates writes to `academic_years`) is granted only to
     `school_admin` in `seed.sql`.

   **The one real gap:** `session_context()` fetches each year's
   `status` and orders the list most-recent-start-date-first, but the
   client's `AcademicYear` type discarded `status`, so `ReportPicker`
   and `ConsolidatedGrades` defaulted to `years[0]` instead of the
   active year. Confirmed live: a 'planning' next year (prepared ahead
   of time, an ordinary registrar action) sorts to index 0 ahead of the
   active year. Fixed by threading `status` through the type and
   matching `App.tsx`'s existing `.find(active) ?? [0]` pattern in both
   screens.

3. **Built a read-only "Academic Years" viewer**, replacing the
   `readiness: 'planned'` placeholder. No new backend call — every fact
   it shows (`years`, each one's `status`, its `periods`, each period's
   `status`) was already in `allYears`. Administrator-only, matching the
   registrar/student permission boundary already enforced in the
   database. No create/close/archive action — that stays an onboarding
   -time operation, by the same reasoning the placeholder always gave.

Full detail, every SQL probe, and the exact commands run:
`docs/session-log/2026-09-03-phase-2.2.md`.

## Current Architecture

- **Student model:** `students` (identity) → `enrollments` (per year:
  grade, section, status) → `class_enrollments` (per class) →
  `period_grades`/`final_subject_grades`. Nothing is ever deleted;
  withdrawal/transfer are recorded events.
- **Academic structure:** `academic_years` (status: planning / active /
  closed / archived) → `academic_periods` (status: upcoming / active /
  closed), FK'd to their year. Three terms today; row-based, so a
  different count or structure (quarters) is data, not code.
- **Grade lifecycle:** draft → in_progress → submitted → received →
  forwarded → registrar_received → returned ⇄ approved → finalized →
  published, plus reopened. Every transition is an RPC that writes an
  audit row. Publication is gated in RLS on `period_grades` /
  `final_subject_grades` — a student sees nothing before that.
- **Grading engine:** one TypeScript module (`app/src/lib/grading/`),
  vendored into `supabase/functions/compute-period-grades/`, diff-
  checked by the build. DO 015 s.2026 weights (Core WW20/PT50/EX30;
  MAPEH/TLE WW20/PT60/EX20) are config, not constants.
- **Roles:** `teacher`, `adviser`, `registrar`, `school_admin`,
  `student` at the client (`Role` type). The database also has
  `principal`, which the client does not yet map to a menu — filtered
  out silently by `rolesFromSession`. Not a bug; just unimplemented.
- **Active role resolution:** `resolveActiveRole()` in `app/src/nav.ts`.
  DEMO_MODE's preview grid may force any of the 5 roles; the "Your
  roles" switcher may only land on a role `heldRoles` actually holds,
  in every build.
- **Active year/period resolution:** `App.tsx`'s session-load effect,
  `.find(status === 'active') ?? [0]`. `ReportPicker` and
  `ConsolidatedGrades` now use the same pattern for their own year
  pickers (Phase 2.2).
- **DEMO_MODE:** on in dev, off in a production build unless
  `VITE_DEMO_MODE=true` is set. Gates the "Preview as" role grid and the
  fixture/period-structure toggle. NOT the data source — that's decided
  independently by whether `VITE_SUPABASE_URL` is set
  (`getDataSource()` in `app/src/data/index.ts`).

## Critical Business Rules

- Current school calendar is three terms; never assume a fixed count of
  periods.
- LOA logic (`app/src/lib/loa.ts`) is authoritative — do not change it.
- Historical academic records must not be deleted. Archiving a year
  makes its rows read-only, not gone.
- The owner account (`joshua@anhs.test`) is intentionally multi-role —
  do not remove roles from it or build a student-only replacement.
- The class schedule stays free-text (`classes.schedule_note`), shown
  verbatim, never parsed into structured times.
- RLS and tenant isolation are the boundary. Tenant and identity come
  from the verified JWT, never a client parameter.

## Current Demo Data

`supabase/demo-seed.sql` — section "Demo 10-A", learners `DEMO-0001`
… `DEMO-0008` (no LRN, ever), 4 classes, Term 1 complete, Term 2 missing
8 scores on purpose (the missing-score workflow), Term 3 empty on
purpose (the unstarted-term state). Idempotent — re-running rebuilds the
same 8 learners / 248 scores. `supabase/demo-seed-remove.sql` removes
only that subtree. See `docs/28-principal-demo-checklist.md`.

## Known Issues

1. **`app.reject_write_to_archived_year()` only covers tables carrying
   `academic_year_id` directly** (`enrollments`, `classes`). Tables like
   `assessments`/`period_grades` reach a year only via `class_id`, so
   this specific trigger is a no-op for them. Currently unreachable:
   there is no in-app action that archives a year yet (still update-the-
   column-directly, onboarding-time only), so this is latent, not
   exploitable. Left unfixed — patching 6+ more tables' triggers is out
   of scope for "the minimum foundation."
2. **`public.permissions` is the only table of 46 without FORCE RLS**
   (from Phase 2.1). No tenant data, no `anon` access, one policy of
   `USING (true)`. Reported, not changed.
3. **Seven demo passwords unrotated**, leaked-password protection off
   in Supabase Auth (from Phase 0). Must close before real learner data.
4. **`principal` exists as a DB role** (seeded, held by the owner
   account) **but has no client-side mapping** — no `ROLE_LABEL`, no
   `NAV` entry. Silently dropped by `rolesFromSession`. Not urgent; no
   screen currently needs it.

## Deferred

SF9 report card and SF1–SF8 generally; formal SF2/SF4 attendance
compliance; Reports & Documents screen; Grading Configuration screen
(schemes are already data — editing them mid-year would alter grades
already computed under the old scheme); structured class schedule
(`class_meetings`); Public Enrollment; parent portal; SMS notifications.
None of these are this session's concern — do not start them without
being asked.

## Current Test Status

(as of the commit below)

- Unit: **254 passed** (`app`, `npx vitest run`)
- E2E: **23 suites passed**, 0 failed (Playwright, fixture-backed,
  `VITE_DEMO_MODE=true`, port 5199)
- SQL/database: **6 suites**, all passing against a database rebuilt
  from all 44 migrations + `seed.sql` (`supabase/tests/01`–`06`)
- Typecheck: clean
- Production build: clean

## Current Phase Next Step

**Waiting on Joshua to open the app on his own laptop/network** (the
principal demo checklist's own item 3) and confirm the production UI
renders Term 1's now-published grades correctly across the Grade
Submissions, Consolidated Grades, and My Grades screens. This is the one
layer this session's environment could not reach — see the caveat in
`docs/session-log/2026-09-04-qa-triage-and-demo-account.md`. Everything
beneath that layer (the account, the grading engine, the full custody
chain, publication) is verified working against real production data.

Do not start Phase 3 (Public Enrollment), the sort/group backlog, or any
other item from `docs/31`'s Backlog section without an explicit
instruction naming it — a positive demo verdict does not authorize any
of that on its own.

If instead starting fresh, unrelated work:
1. Read this file and the latest `docs/session-log/*.md` entry.
2. If the task is UI-facing, confirm the dev server still boots and the
   e2e sweep still passes before assuming the baseline is intact.
3. Do not start Phase 3 (Public Enrollment) or any of the Deferred list
   above without an explicit instruction naming it.
4. Long-standing low-priority item, still open: task #33,
   `docs/grade-persistence-audit.md` (an audit doc, not code).

## Last Updated

2026-09-04, QA triage + real demo account session: investigated three
manually-flagged items (`docs/31-manual-role-observations-2026-09-04.md`)
— all resolved as intentional/not-a-bug, no code changed. Created the
real, permanent demo student portal account (`demo.student01@anhs.test`,
linked to DEMO-0001) against production. Computed, submitted, and drove
the full custody chain to **published** for Term 1 across all four Demo
10-A classes, using the real canonical grading engine and the real
custody-chain RPCs under proper role impersonation — confirmed by the
demo student's own `my_grades()` session. One caveat: this environment's
network policy blocked a live browser walkthrough of the production UI.
Session log: `docs/session-log/2026-09-04-qa-triage-and-demo-account.md`.

Previous entry: 2026-09-04, Phase A of the merge session: PR #44
squash-merged to `main` (commit `6136091`), confirmed `merged: true`.
Vercel deploy triggered on the same commit, targeting production.
Migration `0044_anon_execute_sweep.sql` independently confirmed already
applied to the live Supabase project (`wxkxdqwhefezjfmysypa`) — was
applied directly during Phase 2.1, this merge did not need to
(re-)apply it.
Session log: `docs/session-log/2026-09-04-merge-and-demo-rehearsal.md`.

Earlier entry: 2026-09-03, end of Phase 2.2 development, commit
`fe6989e` on `claude/mendtrix-eclass-architecture-x0z7ef` (now merged).
Session: `docs/session-log/2026-09-03-phase-2.2.md`.
