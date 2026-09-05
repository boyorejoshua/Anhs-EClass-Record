# Decisions

Architectural and product decisions, with the reasoning that produced
them. Written so that a later agent can tell the difference between *a
choice that was made deliberately* and *an accident that hardened*.

Each entry says whether it is still current. Where the reasoning was not
recorded anywhere in the repository, the entry says so rather than
inventing one.

Sources: `docs/README.md` ("Decisions already locked"),
`docs/00`–`docs/20` (the planning set), `docs/23`–`docs/29` (the build
phases), `supabase/README.md` (design notes), `VERCEL.md`, `AGENTS.md`,
migration comments, and `docs/session-log/`.

---

## D-001 · Rebuild as V1 rather than extend V0

**Status:** current · **Date:** ~August 2026 (planning set)

**Context.** ANHS had a working single-file E-Class Record system
("V0") — `index.html` plus `assets/`, Supabase accessed directly from
the browser.

**Decision.** Rebuild the application as V1, porting the *valuable
logic* from V0 (transmutation table, LOA bands, SF layouts, Excel
structures) but not its persistence, identity model or tenancy.

**Reason.** `docs/03-existing-system-assessment.md` returns a *KEEP*
verdict on V0's domain logic and a not-salvageable verdict on its
persistence, identity and tenancy. The domain knowledge was the
expensive part and it was correct; the infrastructure was the part that
could not become multi-tenant.

**Consequence.** V0 is retained rather than deleted — it is the most
accurate surviving description of how the school actually works, and it
still serves as a demo asset. It lives at `/legacy/` in the same
deployment. See `PROJECT-STATE.md` § "Three things named the old system"
for the three distinct artifacts this produced.

---

## D-002 · One multi-tenant platform, not a deployment per school

**Status:** current, and load-bearing · **Date:** ~August 2026

**Problem.** Ten schools could mean ten codebases, ten databases, ten
migration timelines — or one platform configured ten ways.

**Decision.** One multi-tenant platform. `school_id NOT NULL` on every
tenant table, forced RLS, composite foreign keys carrying `school_id`.

**Reason.** The initial market is DepEd public schools (JHS/SHS), where
shared standards mean maximum reuse per deployment (D-003). Per-school
development does not scale to the commercial model in
`docs/16-commercialization.md`.

**Consequence — the tripwire.** `supabase/tests/01_tenant_isolation.sql`
asserts table by table that a School B user sees zero School A rows.
It must run on every migration and block the deploy on failure. **If it
ever fails, this decision is void and a database per school becomes
correct by default.** That is written down deliberately: the decision
carries its own falsification condition.

`seed.sql` proves the configurability claim rather than asserting it —
School A runs three trimesters, School B four quarters, on identical
code.

---

## D-003 · Initial market is DepEd public schools (JHS/SHS)

**Status:** current · **Date:** ~August 2026

**Reason.** Shared national standards (DO 015 s.2026 grading, DO 011
s.2018 school forms) mean one implementation serves many schools.

**Consequence.** Two dates anchor the plan: **4 January 2027**, when
Term 3 opens and a school could realistically pilot (a school cannot
switch grading systems mid-term); and **~June 2027**, when SY 2027–2028
opens and DepEd replaces transmutation with zero-based grading, breaking
every Excel template in every school at once. `docs/README.md` calls the
latter the strongest commercial opening available.

---

## D-004 · The database is the security boundary, not the application

**Status:** current, non-negotiable · **Date:** ~August 2026

**Problem.** With no server of our own, a browser client talks to
Postgres directly. Anything the client is trusted to enforce, an
attacker simply does not enforce.

**Decision.** RLS is the boundary. Tenant and identity come from the
verified JWT (`app.current_school_id()`), never from a client
parameter. Publication is gated in RLS, not in application code.

**Consequences.**
- Cross-table policies go through `SECURITY DEFINER` helpers in `app.*`.
  A policy on A that inline-queries B triggers B's policies, which may
  query A — Postgres raises *infinite recursion detected in policy*. The
  helpers avoid that and are markedly faster. Found by the isolation
  suite, not by review.
- Writes that carry policy are RPCs (`submit_grades`, `return_grades`,
  `approve_grades`, `finalize_grades`, `publish_grades`,
  `reopen_grades`), each verifying permission, verifying the transition
  is legal, writing, and auditing. No client write grant exists on
  `period_grades`, `grade_submissions` or `generated_documents`.
- Audit is append-only: `UPDATE`/`DELETE` on `audit_logs` revoked from
  every role, `service_role` included.
- A screen that forgets a filter returns *fewer* rows, never another
  school's rows.

---

## D-005 · Every `public.` function must revoke EXECUTE from `public, anon`

**Status:** current · **Date:** learned twice; swept in migration 0044
(Phase 2.1)

**Problem.** Postgres grants EXECUTE on a new function to PUBLIC by
default. A `SECURITY INVOKER` contract published for PostgREST is
therefore reachable by `anon` unless explicitly revoked.

**Decision.** Every `public.` function revokes execute from `public,
anon` in the same migration that creates it.

**Reason for it being a written rule rather than a habit.** It was
missed twice. Migration 0044 (`0044_anon_execute_sweep.sql`) closed the
last two `anon`-executable RPCs and was applied directly to the live
project during Phase 2.1.

---

## D-006 · A permission granted in a migration must also be added to `seed.sql`

**Status:** current · **Date:** Phase 1 era

**Problem.** Migrations run *before* `seed.sql` creates the roles. A
`grant` in a migration aimed at a non-admin role therefore matches
nothing on a fresh database, and does so **silently**.

**Decision.** Any permission granted to a non-admin role in a migration
is also added to `seed.sql`.

**Consequence.** Rebuilding from migrations alone is not a valid test of
permissions; the seed is part of the schema contract, not sample data.

---

## D-007 · Application contracts in `rds.*`, thin wrappers in `public.*`

**Status:** current · **Date:** migration 0014

**Problem.** PostgREST exposes the `public` schema only. Exposing the
whole working schema would publish every future function the moment it
was written.

**Decision.** Contracts live in `rds.*`; one thin `public.*` wrapper is
published per function, deliberately.

**Also decided here: camelCase keys.** Payloads are keyed in camelCase
because the JSON crosses into TypeScript unchanged. **Reason:** a
mapping layer between SQL and TS is one more place for a typo to survive
both a typecheck and a test.

**All contracts are `SECURITY INVOKER`** — they add reachability, never
authority.

**What migration 0014 also had to fix**, which is the reason this file
exists at all:
- `subject_categories.grading_scheme_id` **never existed**.
  `docs/06-data-architecture.md` describes it as "the join point between
  the curriculum and the grading engine" and `rds.gradebook` needs it,
  but migration 0003 never created the column. The documented model and
  the implemented one had drifted silently.
- **Teachers could not read `enrollments`**, so a teacher opening their
  own gradebook got an empty roster. The isolation suite could not catch
  it: returning too *few* rows is invisible to a test that only asserts
  no foreign rows leak.

Both are the argument for verifying against a live authenticated session
rather than as a superuser.

---

## D-008 · One grading engine, vendored — never reimplemented

**Status:** current, non-negotiable · **Date:** Phase 0 era

**Problem.** The arithmetic must run in the browser (live gradebook
totals) *and* server-side (`compute-period-grades`). Two implementations
drift, and grade arithmetic that drifts is a data-integrity incident.

**Decision.** One TypeScript module, `app/src/lib/grading/`, vendored
into `supabase/functions/compute-period-grades/` by
`scripts/vendor-grading-engine.mjs`. `npm run build` runs `engine:check`
first, so a drifted copy **fails the build**.

**Consequence.** Never write a second implementation. To change the
arithmetic, change the module and re-vendor.

---

## D-009 · Nothing academic is hard-coded — periods, weights and bands are rows

**Status:** current · **Date:** ~August 2026

**Decision.** Periods, grade levels, grade components, weights,
transmutation bands, attendance statuses and descriptor bands are all
data.

**Reason.** DO 015 s.2026 weights (Core WW20/PT50/EX30; MAPEH/TLE
WW20/PT60/EX20) are current policy, not permanent truth — DepEd replaces
transmutation with zero-based grading around June 2027 (D-003). A
hard-coded weight is a code change per policy change per school.

**Consequence.** **Never assume a fixed count of periods.** Three terms
today is data. `academic_years` has no `unique(school_id)` — only
`unique(school_id, label)` — so years coexist.

**Scheme resolution: the class's override, else the subject category's.**
That is what lets core subjects inherit 20/50/30 and MAPEH/EPP-TLE
20/60/20 without setting a scheme on every class by hand.

---

## D-010 · Nothing is ever deleted; archiving makes rows read-only

**Status:** current · **Date:** Phase 1

**Decision.** Withdrawal and transfer are recorded events
(`enrollment_events`), not row removals. Archiving a year makes its rows
read-only via `app.reject_write_to_archived_year()` — refused even for
an admin — without touching existing data. `my_academic_history()` reads
`enrollments` with no filter on year status, so history stays reachable.

**Reason.** A school's academic record is a legal artifact.

**Known limit.** The trigger only covers tables carrying
`academic_year_id` directly (`enrollments`, `classes`). Tables like
`assessments` / `period_grades` reach a year only via `class_id`, so it
is a no-op for them. Latent rather than exploitable — no in-app action
archives a year yet. See `KNOWN-ISSUES.md` #2.

---

## D-011 · Navigation state decides what renders

**Status:** current · **Date:** Phase 0 / Phase 1

**Problem.** `navKey` was stored in App state and consulted in exactly
one place. Every other nav item fell through to "dashboard, or the
gradebook if a class happens to be open". Attendance, Reports and Users
all silently showed the dashboard. **The navigation looked like it
worked.**

**Decision.** `nav.ts` is the route model. Every route resolves to a
screen; a route with no screen resolves to an explicit "not available
yet", never to some other screen. `readiness` is **data**
(`'ready' | 'planned'`), not a comment, and the test suite asserts every
route reachable from every role's menu maps to a screen.

**Consequence.** Adding a menu entry without a screen fails the build
rather than shipping a dead button.

---

## D-012 · Fixtures are a first-class data source, not a test double

**Status:** current · **Date:** Phase 0 era

**Decision.** `getDataSource()` returns the Supabase source when
`VITE_SUPABASE_URL` is set and the fixture source otherwise. Screens
import from `data/index.ts`, never from either implementation.

**Reason.** It keeps local development, the 23-suite e2e sweep and the
single-file staging build working with no backend, and it makes a
missing environment variable degrade to obviously-fake data rather than
a blank screen.

**Corollary, repeatedly confused:** `DEMO_MODE` is **not** the data
source. `VITE_DEMO_MODE` gates the "Preview as" role grid and the
fixture/period-structure toggle; the data source is decided
independently by whether `VITE_SUPABASE_URL` is set.

---

## D-013 · The class schedule stays free text

**Status:** current · **Date:** Phase 1.5

**Decision.** `classes.schedule_note` is free text, shown verbatim,
never parsed into structured times.

**Reason.** Under the general rule *never invent data*: parsing a
human-written note into start/end times fabricates precision the school
never supplied. A structured `class_meetings` model is deferred, not
forbidden — it would be a real modelling exercise with the school, not a
parser.

---

## D-014 · The owner account is intentionally multi-role

**Status:** current · **Date:** Phase 2.2

**Decision.** `joshua@anhs.test` holds several roles at once. Do not
remove roles from it, do not build a student-only replacement, and do
not let a test harness pick "the first account with N roles" without
checking which account that is — it silently picks this one.

**Reason.** It is the account that exercises role switching, which is
precisely the thing that broke in production and could not be seen with
a single-role account.

---

## D-015 · Academic Years is read-only in the app

**Status:** current · **Date:** Phase 2.2

**Decision.** The Academic Years screen displays years, their statuses,
their periods and each period's status. It has no create / close /
archive action.

**Reason.** Creating and closing years is an onboarding-time operation,
not a routine one, and the placeholder it replaced always gave that
reasoning. Every fact the screen shows was already in `allYears`, so it
needed no new backend call. Administrator-only, matching the boundary
already enforced in the database — `school.config.write` is granted only
to `school_admin` in `seed.sql`, so a registrar already could not
administer years.

---

## D-016 · Grading Configuration is deliberately *not* built

**Status:** current · **Date:** deferred through Phase 2.2

**Decision.** Schemes are already data (D-009), but no screen edits
them.

**Reason.** Editing a scheme mid-year would alter grades already
computed under the old scheme. This is a correctness decision, not a
scheduling one — do not implement it as "just a CRUD screen".

---

## D-017 · Vercel serves V1 at `/` and V0 at `/legacy/`

**Status:** current · **Date:** ~September 2026

**Problem.** The Vercel project predated the V1 app: `framework: null`,
no build step, serving the **repo root** as a static site. The root
`index.html` is V0, deliberately never touched, so the deployment kept
showing the old design no matter what landed on `main`. Nothing was
broken; nothing pointed at the new app.

**Decision.** `vercel.json` builds `app/` to `app/dist` and serves V0
under `/legacy/`.

**Two things that are load-bearing.** V0 references its assets
relatively. Served at `/legacy` without the trailing slash, the browser
resolves `assets/js/main.js` against the root, the SPA catch-all answers
with V1's `index.html`, and V0 loads HTML as JavaScript and renders
blank. The `/legacy` → `/legacy/` redirect and the `(?!legacy/)` guard on
the rewrite both exist for that. Do not remove either.

**Also decided:** `VITE_SUPABASE_*` live in `app/.env.production`, not
in `buildCommand`. Vercel caps `buildCommand` at 256 characters and
rejects the whole deployment past it — the build never starts and the log
is empty, which is a miserable failure to diagnose. Keeping them in a
file also means a local `npm run build` produces the same artifact as a
deploy. Note that dashboard environment variables beat `.env` files
silently; that has already pointed one build at a deleted project.

---

## D-018 · `principal` exists in the database with no client mapping

**Status:** current, deliberate · **Date:** seeded early

**Decision.** `principal` is a seeded database role held by the owner
account. The client has no `ROLE_LABEL` and no `NAV` entry for it, and
`rolesFromSession` filters it out silently.

**Reason.** No screen currently needs it. This is unimplemented, not
broken — recorded here so a later agent does not "fix" a filter that is
doing its job.

---

## D-019 · Multi-tenant platform, ANHS is a tenant

**Status:** current · **Date:** ~August 2026

**Decision.** The product is the *Mendtrix Academic Records Platform*.
ANHS is the first tenant, not the product. Nothing ANHS-specific goes
into generic workflows.

**Consequence.** The repository name (`Anhs-EClass-Record`) is
historical and understates the scope. `app/package.json` names the
package `mendtrix-academic-records`, which is the accurate name.

---

## Decisions whose reasoning is not recorded

Listed so a later agent does not mistake silence for arbitrariness, and
knows to ask rather than assume.

| Topic | What is unknown |
|---|---|
| React 19 / Vite 7 / plain CSS | No document records why this stack over alternatives, or why no CSS framework or component library. **UNVERIFIED.** |
| `xlsx` (SheetJS) for import/export | Chosen and used throughout `lib/import/`; no comparison recorded. **UNVERIFIED.** |
| Supabase over other BaaS | Implied by V0 already using it; no explicit V1 re-evaluation found. **REQUIRES HUMAN CONFIRMATION.** |
| Vitest over Jest | No rationale recorded (Vite-native is the obvious inference, but it is an inference). **UNVERIFIED.** |
| Hand-rolled `.mjs` Playwright scripts rather than `@playwright/test` | The e2e header comment explains only *where* Playwright is resolved from, not why the runner was not used. **UNVERIFIED.** |
| Which of the two V0 copies is authoritative | The standalone `anhsgradingsystem` repo and this repo's root V0 have diverged. **REQUIRES HUMAN CONFIRMATION.** |
