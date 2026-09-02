# Working in this repository

Mendtrix **Academic Records Platform** — a multi-school DepEd records
system. ANHS is one tenant, not the product.

## Read first
- `docs/23-phase-0-current-state-audit.md` — architecture and feature map
- `docs/README.md` — the full document index

## Non-negotiables
1. **LOA logic is authoritative.** Do not change `app/src/lib/loa.ts`.
2. **One grading engine.** `app/src/lib/grading/` is vendored into
   `supabase/functions/compute-period-grades/` and diff-checked by the
   build. Never write a second implementation of the arithmetic.
3. **Three terms.** Periods are rows; never assume a count.
4. **RLS is the boundary.** Tenant and identity come from the verified
   JWT — never from a client parameter. Publication is gated in RLS, not
   in application code.
5. **Every `public.` function must `revoke execute … from public, anon`.**
   Postgres grants EXECUTE to PUBLIC by default. Missed twice already.
6. **A permission granted to a non-admin role in a migration must also
   be added to `seed.sql`** — migrations run before the seed creates the
   roles, so the grant silently matches nothing on a fresh database.
7. **Never invent data.** No parsing `schedule_note` into times, no
   fabricated grades, no ANHS-specific logic in generic workflows.

## Verifying
```
cd app && npx tsc --noEmit && npm test && npm run build
# e2e (21 suites): start vite FROM app/, then run the suites
VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5199 --strictPort
for f in e2e/*.mjs; do node "$f"; done
```
Database suites (`supabase/tests/01..06`) need a Postgres rebuilt from
every migration plus `seed.sql`. They roll back; run them anywhere.

**Run the path, don't just read it.** Every serious defect in this
project so far was found by executing a workflow end to end, never by
review: rosters that never synced, a learner who could not rejoin a
class, history with no deterministic order.

## Demo data
`supabase/demo-seed.sql` builds a marked demo dataset (`DEMO-` student
numbers, no LRN, section `Demo 10-A`); `demo-seed-remove.sql` removes
it. See `docs/27-phase-2-demo-readiness.md`.

## Conventions
Comments explain *why*, especially where a choice looks odd. When
replacing a large SQL function, extract the original verbatim and apply
targeted edits — rewriting from memory has silently dropped whole
blocks before.
