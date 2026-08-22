# Backend — Mendtrix Academic Records Platform

Versioned SQL for the V1 platform. **Not** the same thing as the
`supabase_schema.sql` at the repo root, which belongs to V0 and is kept
only as a historical reference.

## Layout

```
supabase/
├── migrations/   applied in filename order
├── tests/        run after migrations; the isolation suite gates deploys
└── seed.sql      two synthetic schools with DIFFERENT period structures
```

## Running locally

```bash
createdb mendtrix
psql -d mendtrix -c "create role anon nologin;
                     create role authenticated nologin;
                     create role service_role nologin bypassrls;"

for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d mendtrix -f "$f"; done
psql -v ON_ERROR_STOP=1 -d mendtrix -f supabase/seed.sql

psql -d mendtrix -f supabase/tests/01_tenant_isolation.sql
psql -d mendtrix -f supabase/tests/02_student_privacy.sql
```

Against a Supabase project the `anon` / `authenticated` / `service_role`
roles already exist, so only the migration loop and seed are needed.

## The two tests are not optional

`01_tenant_isolation.sql` asserts, table by table, that a School B user
sees zero School A rows. **It must run on every migration and block the
deploy on failure.** If it ever fails, the multi-tenant decision is void
and a database per school becomes correct by default.

`02_student_privacy.sql` asserts the publication gate: a learner sees a
grade only when it is theirs *and* the registrar has published it, and
visibility reverts the moment a record is reopened.

Both suites are self-cleaning and can be re-run against a seeded
database.

## Design notes

**Tenancy.** `school_id NOT NULL` on every tenant table, forced RLS, and
composite foreign keys carrying `school_id` so a cross-tenant reference
is a constraint violation rather than a logic bug. The tenant is read
from a verified JWT claim (`app.current_school_id()`) and never from
client input.

**Cross-table policies go through `SECURITY DEFINER` helpers.** A policy
on table A that inline-queries table B triggers B's policies, which may
query A — Postgres then raises *infinite recursion detected in policy*.
The `app.*` predicate helpers avoid that and are markedly faster. This
was caught by the isolation suite rather than in review.

**Writes that carry policy are RPCs.** `submit_grades`, `return_grades`,
`approve_grades`, `finalize_grades`, `publish_grades` and `reopen_grades`
each verify permission, verify the transition is legal, write, and audit.
There is deliberately no client write grant on `period_grades`,
`grade_submissions` or `generated_documents`.

**Audit is append-only.** `UPDATE` and `DELETE` on `audit_logs` are
revoked from every role including `service_role`.

**Nothing academic is hard-coded.** Periods, grade levels, components,
weights, transmutation bands, attendance statuses and descriptor bands
are all rows. The seed proves it: School A runs three trimesters and
School B four quarters, on identical code.

## Application contracts (migration 0014)

Screens call these, never tables. Each returns its payload in one round
trip, keyed in camelCase because the JSON crosses into TypeScript
unchanged — a mapping layer between SQL and TS is one more place for a
typo to survive both a typecheck and a test.

| Function | Returns |
|---|---|
| `session_context()` | user, roles, school, academic years and periods |
| `my_classes(year)` | class list with per-period status and completeness |
| `gradebook(class, period)` | scheme, assessments, roster, scores, editability |
| `sf10_jhs(student)` | the permanent record |
| `save_scores(jsonb)` | upserts dirty cells, returns how many were written |

They live in `rds.*`, with thin `public.*` wrappers because PostgREST
exposes `public` only. Publishing wrappers per function rather than
exposing the whole schema means a future contract is not published the
moment it is written.

All are `SECURITY INVOKER`. They add reachability, never authority.

### Two things migration 0014 fixed

**`subject_categories.grading_scheme_id` never existed.**
`docs/06-data-architecture.md` describes it as "the join point between
the curriculum and the grading engine", and `rds.gradebook` needs it,
but migration 0003 never created the column. The documented model and
the implemented one had drifted. Scheme resolution is now: the class's
override, else the category's — which is what lets core subjects inherit
DO 015's 20/50/30 and MAPEH/EPP-TLE 20/60/20 without setting a scheme on
every class by hand.

**Teachers could not read `enrollments`.**
Migration 0009 gave teachers scoped access to `students` and
`class_enrollments` but left `enrollments` readable only by staff
holding `enrollments.read` or `students.read.all` — neither of which a
teacher has. The roster join is
`class_enrollments -> enrollments -> students`, so a teacher opening
their own gradebook got an **empty roster** while their learners' scores
sat right there.

The isolation suite could not have caught it: returning too *few* rows
is invisible to a test that only asserts no foreign rows leak. It
surfaced the first time the contract was called as a real authenticated
teacher — which is the argument for verifying against a live session
rather than as a superuser.
