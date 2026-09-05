# Working in this repository

Mendtrix **Academic Records Platform** — a multi-school DepEd records
system. ANHS is one tenant, not the product.

## Read first
- `docs/PROJECT-STATE.md` — compact, current: phase, architecture facts,
  known issues, exact next step. Read this BEFORE re-deriving anything.
  (Was `docs/30-project-state.md` until 2026-09-05.)
- `docs/HANDOFF.md` — start here if you have no prior context on this
  project at all; it routes you through everything else.
- `docs/ARCHITECTURE.md` — how it works · `docs/DECISIONS.md` — why
- `docs/KNOWN-ISSUES.md` — what is broken, and what only *looks* broken
- `docs/ROADMAP.md` — what to do next
- `docs/23-phase-0-current-state-audit.md` — architecture and feature map
- `docs/README.md` — the full 30-document index

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
8. **A field the session RPC returns must not be dropped in the client
   type it lands in.** Happened twice: `roleOverride` was wired to only
   half of what could set it, and `AcademicYear` dropped `status` after
   `session_context()` fetched it — so two screens defaulted to
   `years[0]` instead of the active year. Both bugs were "the data was
   right there and got thrown away on the way to the screen."
9. **The owner account (`joshua@anhs.test`) is intentionally multi-role.**
   Do not remove roles from it, do not build a student-only replacement,
   and do not let a test harness pick "the first account with N roles"
   without checking which account that is — it silently picks this one.

## Verifying
```
cd app && npx tsc --noEmit && npm test && npm run build
# e2e (23 suites): start vite FROM app/, then run the suites
VITE_DEMO_MODE=true VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5199 --strictPort
for f in e2e/*.mjs; do node "$f"; done
```
Two prerequisites that are NOT obvious. Both produce failures that look
like application defects and are not — full recipes in
`docs/PROJECT-STATE.md` § Current Test Status:

- **E2E resolves Playwright from the GLOBAL npm prefix**, not
  `app/node_modules`. Install the version matching the browser build
  already on the machine (build 1194 → `playwright@1.56.0`). A mismatch
  fails all 23 suites identically with "Executable doesn't exist at …".
- **SQL suite 06 also needs `supabase/demo-seed.sql`.** Suites 01–05 need
  a Postgres rebuilt from every migration plus `seed.sql`; 06 asserts
  against the `DEMO-` dataset and aborts without it. They roll back; run
  them anywhere.

Last full run: 2026-09-05 on `8d51d5c` — 254 unit, 23/23 e2e, 6/6 SQL
(76 checks), typecheck and build clean.

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
