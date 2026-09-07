# Project State

Compact, current. Read this before re-deriving anything from the
conversation, `git log`, or other docs. Detailed history lives in
`docs/session-log/` and the phase docs (`docs/23`–`docs/29`); this file
is the index into them, not a replacement.

> **Renamed.** This file was `docs/30-project-state.md` until the
> 2026-09-05 documentation migration. Session logs written before that
> date still refer to it by the old name; those are historical records
> and were deliberately left unedited.

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

**Help is now ordered per role (2026-09-05).** The one code change since
the merge. Help used to render the eleven-step teacher guide first to
everyone, so a registrar landed on somebody else's job and scrolled past
it to reach their own four moves. It now leads with the signed-in role's
own guide under a "Your guide" heading and keeps everybody else's below
"What the other roles do" — ordering, not filtering, so nothing is
hidden and no guide text changed. The rule is a pure function,
`helpPlan()` in `app/src/screens/Help.tsx`, unit-tested across all five
roles. Closes the second finding in `docs/31`.

**Grade-level/section ordering is now one shared comparator
(2026-09-06).** `docs/31`'s most-repeated finding — nine screens listing
classes and learners in orders that disagreed with each other — is
resolved. `app/src/lib/ordering.ts` orders by grade level *numerically*
then section, and the six components behind those nine screens all call
it. The audit found the real diagnosis was not "unsorted" but **sorted
as text**: `rds.my_classes` orders on `c ->> 'gradeLevel'`
(`0014_app_data_sources.sql:117`) and `ReportPicker` sorted the
assembled label, and `'Grade 10' < 'Grade 7'` as text. The fix is
client-side and presentation-only — no contract, permission, RLS
boundary or grading-engine code was touched, and no schema change was
needed. Two corrections to the finding: the sections table on Classes &
Sections was already ordered correctly server-side, and Reports &
Documents is a `readiness: 'planned'` placeholder with no list in it.
Sorted, deliberately **not** grouped — there is no grouped-list pattern
in this codebase to match, so headings would be inventing a visual
pattern rather than fixing an order. See the resolved entry in
`docs/31`.

**The adviser's two screens now explain themselves (2026-09-07).**
`docs/31`'s "Incoming Grades vs Consolidated Grades" finding is
resolved, and the investigation found **no functional overlap** — they
share no columns, no contract and no grain. Incoming Grades
(`rds.adviser_queue`) is one row per class *submission*: status and
custody timestamps, no marks by design, and it writes. Consolidated
Grades (`rds.consolidated_grades`) is one row per *learner*: the
computed period grade, no status, read-only. The distinction had already
been decided and written down in `docs/20-assumptions-register.md`
(27 Aug 2026) — it just appeared on no screen, in no tooltip and in no
menu. Each screen's `page-sub` now states what it is, what it
deliberately is not, and names the other one. Names were kept
deliberately: "Consolidated Grades" is the legacy Record Book's own
name, and both labels appear in the `docs/28` demo checklist Joshua is
about to walk.

Two defects surfaced while fixing it, both closed. `AdviserQueue` was
the only top-level screen rendering as a bare `panel` with an `<h2>`
while seventeen others use `page` / `page-head` / `<h1 class="greeting">`
— it read as a fragment rather than a destination, and now uses the same
markup as `RegistrarQueue`. And the in-app Help told the adviser to
"check the grades" on the one screen that deliberately shows none; the
adviser's four steps now read in sequence.

**Phase 3.0 — Public Enrollment audit and design — complete
(2026-09-06). No code, no schema, no migration was written.** The
deliverable is `docs/32-public-enrollment-design.md`: the data model, the
application state machine, the security model for the first anonymous
write path in the system, what is reused versus new, a 3.1–3.5 phase
breakdown, and ten questions that need Joshua's answer first.

**Phase 3.1+ is blocked on two things, in this order.** First,
`KNOWN-ISSUES.md` #1 — the audit's §0 concludes Public Enrollment is
precisely the mechanism by which real learner data (minors', from the
public, before anyone has decided they are students) enters the system,
so shipping intake before rotating the passwords and enabling
leaked-password protection would create the condition #1 exists to
prevent. Second, the ten open questions — three of them change the
schema, not just the UI.

The two findings from that audit worth knowing even if Phase 3 never
happens: Supabase **default ACLs grant `anon` full DML on every future
table** created in `public`, so any new table is protected by RLS alone
unless its migration explicitly revokes; and across all six SQL suites
there is **exactly one** assertion about `anon` at all.

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

## Deployment

Vercel project `anhs-grading-system`, driven by `vercel.json` at the repo
root. `buildCommand` is `bash app/scripts/vercel-build.sh`, output
`app/dist`, `framework: null`, install a no-op (there is no root
`package.json`). Two paths are served:

| Path | Serves |
|---|---|
| `/` | the V1 React app, built from `app/` |
| `/legacy/` | V0, untouched, still working |

The `/legacy` → `/legacy/` redirect and the `(?!legacy/)` guard on the
SPA catch-all rewrite are both load-bearing — V0 references its assets
relatively and renders blank without them. `VERCEL.md` explains why in
full; read it before touching `vercel.json`.

Backend is Supabase project `wxkxdqwhefezjfmysypa` (region
`ap-southeast-1`). Required build-time variables are
**`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`**, kept in
`app/.env.production` rather than in `buildCommand` — Vercel caps that
field at 256 characters and rejects the deployment silently past it.
Dashboard environment variables beat `.env` files, which has already
caused one outage by pointing a build at a deleted project. Optional
flags: `VITE_DEMO_MODE`, `VITE_SINGLE_FILE`.

## Three things named "the old system" — they are not the same thing

This has confused sessions before. There are three distinct artifacts:

1. **`boyorejoshua/anhsgradingsystem`** — a *separate public GitHub
   repository*, last commit 2026-04-03. Four tracked files
   (`index.html`, `assets/css/style.css`, `assets/js/main.js`,
   `README.md`). This is the original standalone legacy repo.
2. **V0 at the root of *this* repository** — `index.html` + `assets/`,
   served at `/legacy/`. It has **diverged** from repo 1: 267 lines
   against that repo's 289, and the files differ by checksum. Neither is
   a mirror of the other. Which of the two is authoritative for any given
   behaviour is **UNVERIFIED — REQUIRES HUMAN CONFIRMATION**.
3. **`supabase_schema.sql` at the repo root** — V0's schema, kept as
   historical reference only. The live backend is
   `supabase/migrations/`, and the two are not interchangeable.

V0 is retained deliberately: `VERCEL.md` records that it is the most
accurate surviving description of how the school actually works, and it
still functions as a demo asset. Do not delete any of the three without
asking.

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

**Re-executed 2026-09-07** after the adviser-screen copy change.
Unit, e2e, typecheck and build numbers below were observed this session;
the SQL row is carried forward from the 2026-09-05 clean-checkout run on
commit `8d51d5c`, because nothing in this change touches SQL.

| Suite | Result | How it was run |
|---|---|---|
| Unit (vitest) | **276 passed**, 14 files, 0 failed | `cd app && npx vitest run` |
| E2E (Playwright) | **24 of 24 suites passed** | see prerequisite below |
| SQL / database | **6 of 6 suites passed**, 76 checks | see prerequisite below |
| Typecheck | clean | `cd app && npx tsc --noEmit` |
| Production build | clean | `cd app && npm run build` |

Unit test breakdown: `nav` 33, `import/three-term` 33, `recordbook` 29,
`grading` 28, `data/enrollment` 27, `import/official` 22, `data/workflow`
20, `status` 19, `loa` 18, `import/plan` 16, `lib/ordering` 14,
`screens/Help` 8, `grading/edge-function` 5, `config` 4.

The `lib/ordering` fourteen arrived with the 2026-09-06 grade/section
ordering fix, and the `screens/Help` eight with the 2026-09-05 Help
ordering fix; the other twelve files are the 254 counted on `8d51d5c`.

The 24th e2e suite is `grade-section-ordering.mjs`, which reads the
**rendered DOM order** on four screens — a comparator unit test cannot
catch a screen that forgets to call the comparator. Worth knowing: four
existing suites (`consolidated-grades`, `custody-chain`,
`guide-and-exports`, `loa-report`) failed on the new order and were
right to — each opened a class with `.first()`, which silently meant
"Grade 10 – Pearl" only because the old wrong order put it first. All
four now select the class by name.

Four checks added 2026-09-07 (two in `custody-chain.mjs`, two in
`consolidated-grades.mjs`) assert the *rendered copy* on the adviser's
two screens — unusual for e2e and deliberate: the defect being fixed was
"the screen explains nothing", which only a rendered read can catch
coming back.

SQL check counts: `04_lifecycle_rehearsal` 29, `05_schedule_and_tenant_security`
15, `02_student_privacy` 13, `06_demo_workflow` 11, `03_my_classes_contract` 7,
`01_tenant_isolation` 1.

### Two prerequisites that are not obvious and cost real time

**1. E2E needs the Playwright package version to match the browser build
already on the machine.** The suites resolve Playwright from the *global*
npm prefix (`npm root -g`), not from `app/node_modules` — see the header
comment in `app/e2e/recorded-grades.mjs`. Installing plain
`npm install -g playwright` gets the newest release, which then demands a
browser revision that is not present, and **all 23 suites fail
identically** with `Executable doesn't exist at .../chromium_headless_shell-<n>`.
That failure is environmental and says nothing about the application.

Match the version to the browser build under `PLAYWRIGHT_BROWSERS_PATH`
(`/opt/pw-browsers` in the Claude Code web container, build **1194**,
which is Playwright **1.56.0**). To find the pairing for a different
build: read `browsers.json` inside the `playwright-core` tarball for a
candidate version.

```bash
npm install -g playwright@1.56.0     # must match the installed browser build
cd app
VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
  npx vite --port 5199 --strictPort &
for f in e2e/*.mjs; do node "$f" || echo "FAILED $f"; done
```

**2. `supabase/tests/06_demo_workflow.sql` additionally requires
`supabase/demo-seed.sql`.** Migrations + `seed.sql` alone are not enough:
suite 06 asserts against the `DEMO-` dataset, so without it the suite
reports `FAIL 1. the demo class is in the teacher's My Classes` and then
aborts on `ERROR: no grading scheme resolves for class <NULL>`. Suites
01–05 need only migrations + `seed.sql`. Full sequence:

```bash
createdb mendtrix
psql -d mendtrix -c "create role anon nologin;
                     create role authenticated nologin;
                     create role service_role nologin bypassrls;"
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d mendtrix -f "$f"; done
psql -v ON_ERROR_STOP=1 -d mendtrix -f supabase/seed.sql
psql -d mendtrix -f supabase/demo-seed.sql          # required by suite 06 only
for f in supabase/tests/*.sql; do psql -d mendtrix -f "$f"; done
```

Note that a passing suite still prints `NOTICE` lines beginning `psql:`.
Detect failure on the strings `FAIL ` and `ERROR:` — not on a leading
`psql:`, which matches every notice a *passing* run emits.

### Database facts re-verified against a rebuilt database

Rebuilt from all 44 migrations + `seed.sql` on Postgres 16.13:
**46 base tables** in `public`; schemas `app`, `public`, `rds`; roles
seeded `adviser`, `principal`, `registrar`, `school_admin`, `student`,
`teacher`; **`public.permissions` is the only table of the 46 without
FORCE RLS** — all three confirm the Known Issues below rather than
resting on the previous session's word.

## Current Phase Next Step

**Waiting on Joshua to open the app on his own laptop/network** (the
principal demo checklist's own item 3) and confirm the production UI
renders Term 1's now-published grades correctly across the Grade
Submissions, Consolidated Grades, and My Grades screens. This is the one
layer this session's environment could not reach — see the caveat in
`docs/session-log/2026-09-04-qa-triage-and-demo-account.md`. Everything
beneath that layer (the account, the grading engine, the full custody
chain, publication) is verified working against real production data.

Do not start Phase 3 (Public Enrollment) or any item from `docs/31`'s
Backlog section without an explicit instruction naming it — a positive
demo verdict does not authorize any of that on its own. The two Backlog
items still open are submission undo/cancel and visual polish;
sort/group was closed 2026-09-06 and the "Incoming Grades" vs
"Consolidated Grades" naming question on 2026-09-07.

If instead starting fresh, unrelated work:
1. Read this file and the latest `docs/session-log/*.md` entry.
2. If the task is UI-facing, confirm the dev server still boots and the
   e2e sweep still passes before assuming the baseline is intact.
3. Do not start Phase 3 (Public Enrollment) or any of the Deferred list
   above without an explicit instruction naming it.
4. Long-standing low-priority item, still open: task #33,
   `docs/grade-persistence-audit.md` (an audit doc, not code).

## Last Updated

2026-09-07, the adviser's two screens. `docs/31`'s "Incoming Grades vs
Consolidated Grades" finding closed as **naming only** — the audit found
no functional overlap, so nothing was merged or restructured. The
distinction was already decided and written in `docs/20` and simply
never reached a screen; it now lives in each screen's own copy, each
naming the other. Two defects found on the way and fixed: `AdviserQueue`
was the only top-level screen not using the `page`/`h1` pattern, and
Help told the adviser to check grades on the screen that shows none.
Labels unchanged, deliberately — `docs/28`'s demo checklist names both.
Verified: typecheck clean, 276 unit, 24 e2e suites (four new checks),
production build clean.

Previous entry: 2026-09-06, grade-level/section ordering. One shared comparator,
`app/src/lib/ordering.ts`, now orders by grade level numerically then
section across the six components behind the nine screens named in
`docs/31` (`MyClasses` alone is four of them). Presentation only: no
contract, permission, RLS boundary or grading-engine code touched, and
`grade_levels.ordinal` already existed so no schema change was needed.
Sorted, not grouped — no grouped-list pattern exists here to match.
14 new unit tests, one new e2e suite reading real DOM order, and four
existing suites corrected where they had been relying on the old wrong
order via `.first()`. Verified: typecheck clean, 276 unit, 24 e2e
suites, production build clean.

Previous entry: 2026-09-06, Phase 3.0 — Public Enrollment audit and design. No code, no
schema. Deliverable `docs/32-public-enrollment-design.md`; verdict is
"feasible, small footprint, wrong time" — see the Current Phase section
above and the design's §0. In the same session, `KNOWN-ISSUES.md` was
corrected: its #2 ("no demo learner has a portal account") was disproved
by direct query against production and moved to § Resolved, the
remaining open issues renumbered, and the cross-references that pointed
at the old numbering fixed in `HANDOFF.md`, `ROADMAP.md`, `docs/27` and
`docs/28`.

Previous entry: 2026-09-05, Help ordering fix. Help now leads with the signed-in role's
own guide and demotes (never hides) the rest under "What the other roles
do", resolving the second finding in `docs/31`. Ordering lives in a pure
`helpPlan()` so it could be unit-tested without a browser — eight new
tests, unit suite now 262. `e2e/guide-and-exports.mjs` check 9 was
rewritten: it previously asserted the teacher's steps lead for *every*
role, which was the defect and would have passed against the fix.
Verified: typecheck clean, 262 unit, 23 e2e suites, production build
clean. No other code touched.

Earlier entry: 2026-09-05 — documentation migration for the Claude →
Codex handoff. No application code changed. This file was renamed from
`docs/30-project-state.md`; `docs/ARCHITECTURE.md`, `DECISIONS.md`,
`ROADMAP.md`, `KNOWN-ISSUES.md` and `HANDOFF.md` were added beside it.
The whole test suite was re-executed from scratch and the results above
replaced with observed ones (they matched the previous session's claims
exactly). Two undocumented test prerequisites were found and recorded,
and the three-way "legacy" ambiguity above was untangled.

Earlier entry: 2026-09-04, QA triage + real demo account session: investigated three
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

Earlier entry: 2026-09-04, Phase A of the merge session: PR #44
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
