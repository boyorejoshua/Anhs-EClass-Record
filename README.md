# Mendtrix Academic Records Platform

A multi-tenant DepEd school records and grading platform for Philippine
public schools (JHS/SHS).

Teachers record scores; the engine computes period and final grades under
DO 015 s.2026 weights; grades move through a custody chain (teacher →
adviser → registrar) with an audit row per transition; the registrar
publishes; learners then — and only then — see their grades in a student
portal.

**Angono National High School is the first tenant, not the product.** The
repository name is historical; the package is `mendtrix-academic-records`.

A Mendtrix IT Services project.

---

## Start here

| If you are… | Read |
|---|---|
| **An AI agent or a new developer** | **[`AGENTS.md`](AGENTS.md)** — the rules, then [`docs/HANDOFF.md`](docs/HANDOFF.md) |
| Catching up on where things stand | [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) |
| About to change code | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) → [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Looking for a known problem | [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) |
| Planning work | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Looking for depth on one area | [`docs/README.md`](docs/README.md) — the full 30-document index |

## Running it

```bash
cd app
npm ci
npm run dev                 # fixtures when VITE_SUPABASE_URL is unset
npx tsc --noEmit && npm test && npm run build
```

Required environment variables for a real backend: `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_DEMO_MODE`,
`VITE_SINGLE_FILE`. With no Supabase configured the app runs on fixtures
rather than failing — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7.

**Testing has two non-obvious prerequisites** — both produce failures that
look like application defects and are not. See
[`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) § Current Test Status
before running the e2e or database suites.

Last full verification (2026-09-05): **254 unit tests · 23/23 e2e suites ·
6/6 SQL suites (76 checks) · typecheck and production build clean.**

## Layout

```
app/                 the V1 application — React 19 + TypeScript + Vite 7
  src/lib/grading/   THE grading engine (vendored to the edge function)
  src/lib/loa.ts     authoritative Level of Achievement banding
  src/nav.ts         the route model
  e2e/               23 Playwright suites
supabase/
  migrations/        44 migrations — the live schema
  seed.sql           roles, permissions, two schools with DIFFERENT period structures
  demo-seed.sql      the marked DEMO- dataset
  tests/             6 SQL suites — tenancy, privacy, contracts, lifecycle
  functions/         compute-period-grades · manage-users
docs/                the current-state set, plus 30 planning and phase documents
index.html, assets/  V0, kept deliberately and served at /legacy/
supabase_schema.sql  V0's schema — historical reference only
```

## The four things you cannot work here without knowing

1. **The database is the security boundary**, not application code. RLS,
   `SECURITY DEFINER` helpers, contracts in `rds.*` with thin `public.*`
   wrappers. Tenant and identity come from the verified JWT, never a
   client parameter.
2. **One grading engine.** `app/src/lib/grading/` is vendored into
   `supabase/functions/compute-period-grades/` and diff-checked by the
   build. Never write a second implementation of the arithmetic.
3. **Nothing academic is hard-coded.** Periods, weights, bands and grade
   levels are rows. `seed.sql` proves it — School A runs three
   trimesters, School B four quarters, on identical code. **Never assume
   a fixed count of periods.**
4. **Nothing is ever deleted.** Withdrawal and transfer are recorded
   events; archiving a year makes its rows read-only, not gone. A
   school's academic record is a legal artifact.

## Deployment

Vercel project `anhs-grading-system`, serving the V1 app at `/` and the
preserved V0 at `/legacy/`. Backend is Supabase. Both rewrites in
`vercel.json` are load-bearing — read [`VERCEL.md`](VERCEL.md) before
touching it.

## Sources

DepEd Order No. 015 s.2026 (grading), No. 011 s.2018 (school forms),
No. 009 s.2026 (three-term calendar); Republic Act No. 10173 (Data
Privacy Act).
