# Architecture

How the platform actually works, as built. Verified against the source
tree and against a database rebuilt from all 44 migrations plus
`seed.sql` on 2026-09-05.

Planning-era architecture documents (`06-data-architecture.md`,
`07-system-architecture.md`, `08-security-and-privacy.md`) describe what
was *intended*. Where they disagree with this file, this file is what
the code does — migration 0014 already had to reconcile one such drift
(`subject_categories.grading_scheme_id`, documented as the curriculum /
grading join point, was never created by migration 0003).

---

## 1. System shape

```
Browser (React 19 + TypeScript, built by Vite 7)
   │
   │  supabase-js  ·  JWT in every request
   ▼
Supabase project wxkxdqwhefezjfmysypa  (ap-southeast-1)
   │
   ├── PostgREST ──► public.*  (thin wrappers only)
   │                    │
   │                    ▼
   │                 rds.*    (application contracts)
   │                    │
   │                    ▼
   │                 app.*    (SECURITY DEFINER predicate helpers)
   │                    │
   │                    ▼
   │                 46 base tables, RLS forced on 45 of them
   │
   └── Edge Functions
        ├── compute-period-grades   (vendored copy of the TS engine)
        └── manage-users
```

There is no server of our own. The database is the application server:
authorization, tenancy and the grade lifecycle all live in Postgres, and
the React app is a client that cannot exceed what its JWT allows.

## 2. Why the boundary is in the database

The single most important structural decision: **RLS is the security
boundary, not application code.** Tenant and identity are read from the
verified JWT via `app.current_school_id()`, never from a client
parameter. A screen that forgets a filter returns fewer rows; it cannot
return another school's rows.

This has three consequences that shape everything else:

- **Cross-table policies must go through `SECURITY DEFINER` helpers.** A
  policy on table A that inline-queries table B triggers B's policies,
  which may query A — Postgres then raises *infinite recursion detected
  in policy*. The `app.*` predicate helpers exist for exactly this, and
  are also markedly faster. The isolation suite caught this, not review.
- **Composite foreign keys carry `school_id`**, so a cross-tenant
  reference is a constraint violation rather than a logic bug.
- **Writes that carry policy are RPCs, not table grants.** There is
  deliberately no client write grant on `period_grades`,
  `grade_submissions` or `generated_documents`.

`public.permissions` is the one table of 46 without FORCE RLS. It holds
no tenant data, has no `anon` access, and its single policy is
`USING (true)`. Reported, not changed — see `KNOWN-ISSUES.md` #3.

## 3. Data model

### The student spine

```
students          identity — one row per human, ever
   │
   ▼
enrollments       one row per student per academic year
                  carries grade level, section, status
   │
   ▼
class_enrollments one row per student per class
   │
   ▼
period_grades  ·  final_subject_grades
```

**Nothing is ever deleted.** Withdrawal and transfer are recorded
events (`enrollment_events`), not row removals. This is a hard rule: a
school's academic record is a legal artifact.

The roster join is `class_enrollments → enrollments → students`. This
matters: migration 0009 gave teachers scoped access to `students` and
`class_enrollments` but not `enrollments`, so a teacher opening their own
gradebook saw an **empty roster** while their learners' scores sat right
there. The isolation suite could not catch it — returning too *few* rows
is invisible to a test that only asserts no foreign rows leak. Migration
0014 fixed it.

### Academic structure

```
academic_years    status: planning │ active │ closed │ archived
   │
   ▼
academic_periods  status: upcoming │ active │ closed
```

Both are **rows, not constants**. The current calendar is three terms,
but nothing in the code assumes a count — `seed.sql` proves it by
building School A with three trimesters and School B with four quarters
on identical code. Multiple years coexist: there is no
`unique(school_id)` on `academic_years`, only `unique(school_id, label)`.

Archiving means historical, not deleted.
`app.reject_write_to_archived_year()` refuses writes to an archived
year's rows — even for an admin — without touching existing data.
`my_academic_history()` reads `enrollments` by student with no filter on
year status, so history stays reachable.

### Nothing academic is hard-coded

Periods, grade levels, grade components, weights, transmutation bands,
attendance statuses and descriptor bands are all rows. DO 015 s.2026
weights (Core WW20/PT50/EX30; MAPEH/TLE WW20/PT60/EX20) are
configuration.

Scheme resolution is: **the class's override, else the subject
category's.** That is what lets core subjects inherit 20/50/30 and
MAPEH/EPP-TLE 20/60/20 without setting a scheme on every class by hand.

## 4. The grade lifecycle

```
draft → in_progress → submitted → received → forwarded
      → registrar_received → returned ⇄ approved → finalized → published
                                                        │
                                                   (reopened)
```

Every transition is an RPC that verifies permission, verifies the
transition is legal, writes, and appends an audit row. **Publication is
gated in RLS** on `period_grades` / `final_subject_grades` — a student
sees nothing before it, and visibility reverts the moment a record is
reopened. `supabase/tests/02_student_privacy.sql` asserts exactly this.

Audit is append-only: `UPDATE` and `DELETE` on `audit_logs` are revoked
from every role including `service_role`.

## 5. One grading engine, two runtimes

The arithmetic exists once, in `app/src/lib/grading/`. It is **vendored**
into `supabase/functions/compute-period-grades/` by
`scripts/vendor-grading-engine.mjs`, and `npm run build` runs
`engine:check` first — a drifted copy fails the build.

Never write a second implementation of the arithmetic. This is
non-negotiable rule 2 in `AGENTS.md`.

`app/src/lib/loa.ts` (Level of Achievement banding) is likewise
authoritative and must not be changed.

## 6. Application contracts (migration 0014)

Screens call functions, never tables. Each returns its payload in one
round trip, keyed in **camelCase** — the JSON crosses into TypeScript
unchanged, because a SQL↔TS mapping layer is one more place for a typo
to survive both a typecheck and a test.

| Function | Returns |
|---|---|
| `session_context()` | user, roles, school, academic years and periods |
| `my_classes(year)` | class list, per-period status and completeness |
| `gradebook(class, period)` | scheme, assessments, roster, scores, editability |
| `sf10_jhs(student)` | the permanent record |
| `save_scores(jsonb)` | upserts dirty cells, returns how many were written |
| `my_academic_history()` | the learner's own history across years |

They live in `rds.*` with thin `public.*` wrappers, because PostgREST
exposes `public` only. Publishing one wrapper per function — rather than
exposing the whole schema — means a future contract is not published the
moment it is written.

All are `SECURITY INVOKER`. **They add reachability, never authority.**

> Every `public.` function must `revoke execute … from public, anon`.
> Postgres grants EXECUTE to PUBLIC by default. This has been missed
> twice; migration 0044 was the sweep that closed the last two.

## 7. Frontend

```
app/src/
  App.tsx          session load, active role/year/period resolution
  nav.ts           the route model — see below
  data/            the data layer
    index.ts       getDataSource(): Supabase if configured, else fixtures
    supabase.ts    the real source
    fixtures.ts    the fake source
    source.ts      the interface both satisfy
    types.ts       shared types incl. Role, AcademicYear
  lib/
    grading/       THE grading engine (vendored to the edge function)
    loa.ts         authoritative LOA banding — do not change
    import/        three-term and DepEd-official Excel importers
    recordbook.ts  status.ts  export.ts  supabase.ts
  screens/         30 screens
  components/      8 shared components
```

### Navigation state decides what renders

`nav.ts` is not a menu config; it is the route model, and it exists
because navigation once looked like it worked and silently did not.
`navKey` was stored in state and consulted in exactly one place —
everything else fell through to "dashboard, or the gradebook if a class
happens to be open". Attendance, Reports and Users all showed the
dashboard.

The rule the file enforces: **every route resolves to a screen, and a
route with no screen resolves to an explicit "not available yet" — never
to some other screen.** `readiness` is data (`'ready' | 'planned'`), not
a comment: a `planned` route renders `NotAvailable`, and the test suite
asserts every route reachable from every role's menu maps to a screen.
Adding a menu entry without a screen fails the build rather than
shipping a dead button.

Per-role menus are a courtesy, not a control — each screen also fails
closed on its own if the role's permissions disallow the underlying read.

### Data source selection

`getDataSource()` returns the Supabase source when `VITE_SUPABASE_URL`
is set and the fixture source otherwise. The fallback is not a
convenience: it keeps local development, the e2e suite and the
single-file staging build working with no backend, and it makes a
missing environment variable degrade to obviously-fake data rather than
a blank screen. **Screens import from `data/index.ts` and never from
either implementation.**

### DEMO_MODE is not the data source

Two independent switches, repeatedly confused:

| Switch | Set by | Controls |
|---|---|---|
| `DEMO_MODE` | `VITE_DEMO_MODE` (on in dev, off in a production build) | the "Preview as" role grid, the fixture/period-structure toggle |
| data source | whether `VITE_SUPABASE_URL` is set | Supabase vs fixtures |

### Role resolution

Client roles are `teacher`, `adviser`, `registrar`, `school_admin`,
`student`. The database also seeds `principal`, which the client does not
map to a menu — `rolesFromSession` filters it out silently. Not a bug;
unimplemented.

`resolveActiveRole()` in `app/src/nav.ts` is the single resolver.
`roleOverride` backs **two** switchers — the DEMO_MODE preview grid *and*
the sidebar "Your roles" group, which renders for any real account
holding more than one role, in every build. The Phase 2.2 bug was that
the formula read `roleOverride` only when `DEMO_MODE` was on, so a
genuinely multi-role account could click a different role in production
and see nothing change. The DEMO_MODE grid may force any of the five
roles; the "Your roles" switcher may only land on a role `heldRoles`
actually holds.

### Active year and period

`App.tsx`'s session-load effect uses `.find(status === 'active') ?? [0]`
— not a hardcoded date, browser storage, or role state. `ReportPicker`
and `ConsolidatedGrades` use the same pattern for their own year
pickers, as of Phase 2.2.

> **The failure mode to know about.** A field the session RPC returns
> must not be dropped in the client type it lands in. `AcademicYear`
> discarded `status` after `session_context()` had fetched it, so both
> those screens fell back to `years[0]` — and a `planning` next year,
> prepared ahead of time by an ordinary registrar action, sorts to index
> 0 ahead of the active year. Twice now the bug has been "the data was
> right there and got thrown away on the way to the screen."

## 8. Testing architecture

Three layers, each catching what the others structurally cannot.

| Layer | Where | Catches |
|---|---|---|
| Unit (vitest) | `app/src/**/*.test.ts` | arithmetic, banding, parsing, route resolution |
| E2E (Playwright) | `app/e2e/*.mjs` | the app actually driven, fixture-backed |
| SQL | `supabase/tests/*.sql` | tenancy, privacy, contracts, lifecycle |

`01_tenant_isolation.sql` asserts table by table that a School B user
sees zero School A rows. **It must run on every migration and block the
deploy on failure.** If it ever fails, the multi-tenant decision is void
and a database per school becomes correct by default.

The e2e suites resolve Playwright from the *global* npm prefix, not from
`app/node_modules`, so `npm ci` stays small. See `PROJECT-STATE.md` for
the version-matching prerequisite — getting it wrong fails all 23 suites
identically and misleadingly.

> **Run the path, don't just read it.** Every serious defect in this
> project was found by executing a workflow end to end, never by review:
> rosters that never synced, a learner who could not rejoin a class,
> history with no deterministic order, a detached `this` in
> `submitGrades`. No unit test was ever going to see the last one.

## 9. Deployment architecture

See `PROJECT-STATE.md` § Deployment and `VERCEL.md`. In short: one Vercel
project serving the V1 app at `/` and the preserved V0 at `/legacy/`,
with a redirect and a rewrite guard that are both load-bearing.
