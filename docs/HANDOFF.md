# Handoff

For the next agent or developer. Assumes you have **never seen a
previous conversation about this project** and cannot ask the person who
built it.

Written 2026-09-05 as part of the Claude → Codex migration. Everything
below was verified against the code, or is marked as unverified.

---

## Project summary

**Mendtrix Academic Records Platform** — a multi-tenant DepEd school
records and grading system for Philippine public schools (JHS/SHS).

Angono National High School (ANHS) is the **first tenant, not the
product.** The repository name understates the scope; `app/package.json`
names the package `mendtrix-academic-records`, which is accurate.

Teachers record scores; the arithmetic produces period and final grades
under DepEd DO 015 s.2026 weights; grades move through a custody chain
(teacher → adviser → registrar) with an audit row per transition; the
registrar publishes; learners then — and only then — see their grades in
a student portal.

Business purpose: `docs/16-commercialization.md`. Owned by Mendtrix IT
Services (Joshua Boyore). This is the company's most technically
substantial product.

---

## Current state

**A clean checkpoint.** Nothing is half-built.

- Working tree clean, everything merged to `main` (`8d51d5c`), 89 commits.
- Phase 2.2 complete and merged via PR #44 (`6136091`).
- Vercel production deploy triggered on that commit.
- **All test suites pass** — re-executed from scratch 2026-09-05:
  254 unit · 23/23 e2e · 6/6 SQL (76 checks) · typecheck clean · build clean.

One thing is pending and it is not code: **live confirmation of the
production deploy** is awaiting Joshua. See `ROADMAP.md` § In progress.

---

## Read in this order

```
AGENTS.md            the rules — read before touching anything
   ↓
docs/PROJECT-STATE.md   where things stand, and how to run the tests
   ↓
docs/ARCHITECTURE.md    how it actually works
   ↓
docs/DECISIONS.md       why it is like that
   ↓
docs/KNOWN-ISSUES.md    what is broken, and what only looks broken
   ↓
docs/ROADMAP.md         what to do next
   ↓
source
```

`docs/README.md` indexes the 30-document planning and phase set. Read it
when you need depth on a specific area, not to get started.

---

## What was recently worked on

**Phase 2.2** (the last development phase) did three things:

1. **Fixed multi-role switching in production.** `role` in `App.tsx` was
   `(DEMO_MODE ? roleOverride : null) ?? sessionRole ?? 'teacher'`. But
   `roleOverride` backs **two** switchers — the DEMO_MODE preview grid
   *and* the sidebar "Your roles" group, which renders in every build for
   any account holding more than one role. Outside DEMO_MODE the formula
   never read it, so a real multi-role account could click a different
   role and see nothing change. Fixed as `resolveActiveRole()` in
   `app/src/nav.ts`, unit-tested, verified live in a
   `VITE_DEMO_MODE=false` build.

2. **Audited the academic-year architecture** — found it mostly already
   correct. The one real gap: `session_context()` returns each year's
   `status`, but the client `AcademicYear` type discarded it, so
   `ReportPicker` and `ConsolidatedGrades` defaulted to `years[0]` — and
   a `planning` next year, prepared ahead by an ordinary registrar
   action, sorts ahead of the active one.

3. **Built a read-only Academic Years screen**, replacing a placeholder.
   No new backend call — every fact was already in `allYears`.

Then a merge session squash-merged it to `main` and confirmed the deploy
was triggered.

---

## What is unfinished

Nothing is mid-edit. The unbuilt work, in priority order, is in
`ROADMAP.md`. The short version:

1. Rotate demo passwords + enable leaked-password protection — **blocks
   real learner data**
2. Create a demo learner's portal account (needs explicit go-ahead —
   it is against production)
3. Run the principal demo checklist
4. Phase 3, Public Enrollment — **do not start without being asked by name**

Biggest unbuilt area overall: **the document engine** — SF9 report card
and SF1–SF8. Designed in `docs/11-document-engine.md`, not built. A
registrar will ask for it first.

---

## Known bugs

Full detail with severity and reproduction in `docs/KNOWN-ISSUES.md`.
The three that will actually affect you:

- **Demo passwords unrotated, leaked-password protection off.** Highest
  severity in the project. Config, not code.
- **`app.reject_write_to_archived_year()` only covers tables with
  `academic_year_id` directly.** Latent — nothing archives a year in-app
  yet. **Becomes live the moment anyone builds an archive action.**
- **E2E fails 23/23 if the Playwright version doesn't match the
  installed browser build.** Environmental, not a regression. Recipe in
  `PROJECT-STATE.md`.

### Six things you may be told are broken that are not

Role switching, reports/documents, LOA reporting, analytics, the student
portal, and class/enrollment relationships were all described as active
problems in the context handed to this migration. **This audit found the
repository disagrees** — each is either fixed with a passing test, or
was never true of the current schema.

`KNOWN-ISSUES.md` § Resolved gives the evidence per item. Two carry a
nuance worth knowing up front:

- "Reports don't display" was **one real fixed bug plus one unbuilt
  feature**. The `years[0]` defaulting is fixed; the Reports & Documents
  screen was never built. Don't read it as a single problem.
- "The student portal is broken" is most likely "no demo learner has a
  portal account", which is issue #2. An empty portal is not a broken
  portal.

If you see one of these symptoms for real, file it fresh with evidence.
The old reports do not survive the current test results.

---

## Important architecture

Full version in `docs/ARCHITECTURE.md`. The four things you cannot work
here without knowing:

1. **The database is the security boundary.** No server of our own. RLS,
   `SECURITY DEFINER` helpers in `app.*`, contracts in `rds.*` with thin
   `public.*` wrappers. Tenant and identity come from the verified JWT,
   never a client parameter.
2. **One grading engine**, `app/src/lib/grading/`, vendored into
   `supabase/functions/compute-period-grades/` and diff-checked by the
   build. Never write a second implementation.
3. **Nothing academic is hard-coded.** Periods, weights, bands, grade
   levels are rows. `seed.sql` proves it: School A three trimesters,
   School B four quarters, identical code.
4. **Navigation state decides what renders.** `nav.ts` is the route
   model; `readiness` is data; a menu entry without a screen fails the
   build.

---

## Important business rules

- Three terms **today** — never assume a fixed count of periods.
- **Nothing is deleted.** Withdrawal and transfer are recorded events.
  Archiving makes rows read-only, not gone. A school's academic record is
  a legal artifact.
- **A learner sees a grade only when it is theirs *and* published**, and
  visibility reverts the moment a record is reopened. Enforced in RLS,
  asserted by `supabase/tests/02_student_privacy.sql`.
- LOA logic (`app/src/lib/loa.ts`) is authoritative.
- Scheme resolution: the class's override, else the subject category's.
- **Never invent data.** No parsing `schedule_note` into times, no
  fabricated grades, no ANHS-specific logic in generic workflows.

---

## Important files

| Path | Why it matters |
|---|---|
| `AGENTS.md` | The nine non-negotiables. Read first. |
| `app/src/lib/loa.ts` | Authoritative LOA banding. **Do not change.** |
| `app/src/lib/grading/` | The one grading engine. Vendored; diff-checked. |
| `app/src/nav.ts` | Route model + `resolveActiveRole()`. |
| `app/src/App.tsx` | Session load; active role/year/period resolution. |
| `app/src/data/index.ts` | `getDataSource()` — Supabase vs fixtures. |
| `supabase/migrations/` | 44 migrations. The live schema. |
| `supabase/seed.sql` | Roles, permissions, two schools. **Part of the schema contract**, not sample data. |
| `supabase/demo-seed.sql` | The `DEMO-` dataset. Required by SQL suite 06. |
| `supabase/tests/01_tenant_isolation.sql` | The tripwire for the whole multi-tenant decision. |
| `scripts/vendor-grading-engine.mjs` | Vendors + diff-checks the engine. |
| `vercel.json`, `VERCEL.md` | Deployment. Both rewrites are load-bearing. |
| `supabase_schema.sql` (root) | **V0's** schema. Historical reference only — not the live one. |
| `index.html`, `assets/` (root) | **V0**, served at `/legacy/`. Deliberately not touched. |

---

## Important database information

Supabase project **`wxkxdqwhefezjfmysypa`**, region `ap-southeast-1`
(Singapore). Postgres 16.

- **46 base tables** in `public`; schemas `app`, `public`, `rds`.
- FORCE RLS on all but `public.permissions` (`KNOWN-ISSUES.md` #4).
- Roles seeded: `adviser`, `principal`, `registrar`, `school_admin`,
  `student`, `teacher`.
- Student spine: `students → enrollments → class_enrollments →
  period_grades / final_subject_grades`.
- Academic structure: `academic_years` (planning/active/closed/archived)
  → `academic_periods` (upcoming/active/closed).
- **Migrations run before `seed.sql` creates the roles.** A permission
  granted to a non-admin role in a migration must also be added to the
  seed, or it silently matches nothing.
- **Every `public.` function must `revoke execute … from public, anon`.**
  Postgres grants EXECUTE to PUBLIC by default. Missed twice; migration
  0044 was the sweep.

To rebuild locally: recipe in `PROJECT-STATE.md` § Current Test Status.
It works — this audit did exactly that on 2026-09-05, all 44 migrations
and the seed applied without error.

---

## Important security information

- RLS is the boundary; JWT is the source of tenant and identity.
- Publication is gated in RLS, not application code.
- Audit is append-only — `UPDATE`/`DELETE` on `audit_logs` revoked from
  every role including `service_role`.
- Writes carrying policy are RPCs; no client write grant on
  `period_grades`, `grade_submissions`, `generated_documents`.
- **Outstanding:** seven demo passwords unrotated and leaked-password
  protection disabled. Close before any real learner data.
- Secrets live in `app/.env.production` (gitignored) and the Vercel
  dashboard. **No secret values appear anywhere in `docs/`.** Required
  variable *names* only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`;
  optional `VITE_DEMO_MODE`, `VITE_SINGLE_FILE`.

---

## Important testing information

Three layers, each catching what the others structurally cannot. Exact
commands and the two non-obvious prerequisites are in `PROJECT-STATE.md`
§ Current Test Status. Do not skip that section — both prerequisites
produce failures that look like application defects and are not.

> **Run the path, don't just read it.** Every serious defect in this
> project was found by executing a workflow end to end, never by review.

---

## Current priority

**Waiting on Joshua's live confirmation** that the production deploy
works: sign in as `joshua@anhs.test`, click through all five roles,
confirm "Academic Years" no longer says SOON.

---

## Recommended next task

If the deploy check passes and you are given the go-ahead:

1. Confirm `resolveActiveRole` (`app/src/nav.ts`) and the Academic Years
   route (`readiness: 'ready'`) are on **`main`** specifically — not just
   on the feature branch.
2. Follow `docs/28-principal-demo-checklist.md`. Default to `DEMO-0001`
   unless told otherwise.
3. Create that learner's portal account **for real**, against production.
4. Run the checklist step by step and give an honest verdict.

If instead starting fresh, unrelated work: read `PROJECT-STATE.md` and
the latest `docs/session-log/*.md`, then confirm the baseline still
passes before assuming it does.

The highest-value *independent* task, needing no go-ahead: **rotate the
demo passwords and enable leaked-password protection**
(`KNOWN-ISSUES.md` #1). It blocks real learner data and nothing blocks it.

---

## Things not to break

1. `app/src/lib/loa.ts` — authoritative.
2. The single grading engine — never a second implementation.
3. The assumption that periods are rows — never assume a count.
4. RLS as the boundary — never trust a client parameter for tenant or identity.
5. The `revoke execute … from public, anon` rule on every `public.` function.
6. The migration↔seed permission pairing.
7. The `/legacy` redirect and the `(?!legacy/)` rewrite guard in `vercel.json`.
8. The owner account's multiple roles.
9. Historical records — nothing is deleted, ever.
10. V0 at the repo root, and `supabase_schema.sql`. Both deliberately kept.

---

## Things that require human confirmation

| Question | Why it matters |
|---|---|
| Did the production deploy of `6136091` actually succeed, and do role switching and Academic Years work on the live site? | Everything in `ROADMAP.md` § Next assumes yes. |
| Which V0 is authoritative — the standalone `boyorejoshua/anhsgradingsystem` repo, or this repo's root V0? | They have **diverged** (289 vs 267 lines, differing checksums). Ports of "V0 behaviour" could take the wrong source. |
| Is `boyorejoshua/anhsgradingsystem` still needed at all? | It is public, while this repo's siblings are private. |
| Should the archived-year trigger gap (#3) be closed now or when an archive action is built? | Determines whether it is debt or a blocker. |
| Can DO 015's transmutation model express the ~June 2027 zero-based grading rules as configuration? | D-009 says it should; **untested, and the new rules are not published in detail. UNVERIFIED.** |
| Which demo learner should get the portal account, and against production or a rehearsal? | The checklist defaults to `DEMO-0001`; the production question is not ours to decide. |

---

## External dependencies

| Dependency | Role | Notes |
|---|---|---|
| **Supabase** `wxkxdqwhefezjfmysypa` | Postgres, Auth, Edge Functions | `ap-southeast-1`. The whole backend. |
| **Vercel** `anhs-grading-system` | Hosting | Serves `/` and `/legacy/`. |
| React 19, Vite 7, TypeScript 5.7 | Frontend | |
| `@supabase/supabase-js` ^2.112 | Client | |
| `xlsx` (SheetJS) ^0.18.5 | Excel import/export | Heaviest bundle contributor. |
| Vitest 3 | Unit tests | Local dependency. |
| Playwright | E2E | **Global** install, version must match the browser build. |
| DepEd DO 015 s.2026, DO 011 s.2018, DO 009 s.2026 | Domain rules | Not code, but they define correctness. |
| RA 10173 (Data Privacy Act) | Compliance | Drives the publication gate and audit trail. |

---

## Deployment information

`PROJECT-STATE.md` § Deployment for the summary, `VERCEL.md` for the full
reasoning. Two traps recorded there because both have already cost a
deploy:

- `buildCommand` is capped at **256 characters**; exceed it and Vercel
  rejects the deployment before the build starts, with an empty log.
- **Dashboard environment variables silently beat `.env` files.** Stale
  V0 variables once pointed a build at a deleted Supabase project.

---

## Handoff notes

**What this repository does unusually well, and is worth preserving.**
The documentation records *why*, including the mistakes. Migration 0014's
notes say the documented data model and the implemented one had drifted;
`nav.ts` opens by explaining that navigation once looked like it worked
and silently did not; `AGENTS.md` rule 8 names the same bug class twice
because it happened twice. That habit is the reason this handoff could be
written from the repository alone. Keep it.

**The one methodological rule that produced every real finding here:**
run the path, don't just read it. This audit re-ran 254 unit tests, 23
e2e suites and 6 SQL suites against a database rebuilt from scratch, and
that is the only reason the "Resolved" table in `KNOWN-ISSUES.md` can say
six reported bugs are not reproducible — rather than repeating them
forward for another six months.

**Where the repository and the conversation disagreed**, this migration
took the repository as the technical source of truth and recorded the
discrepancy rather than silently picking a side. Those are collected in
`KNOWN-ISSUES.md` § Resolved and in the table above.

**What is deliberately still open:** the deploy confirmation, the
portal-account go-ahead, and the six human-confirmation questions. None
of them were guessed at.
