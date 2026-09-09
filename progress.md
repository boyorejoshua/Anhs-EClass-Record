# Current Work — Project Handoff

Last updated: 2026-09-10

## Current objective

Use the newly established repository-based AI handoff protocol through 2–3
contained Codex sessions before broader Mendtrix rollout.

No feature, production, database, authentication, or deployment work is
authorized by this workstream.

## Current state

- VERIFIED: The handoff protocol is merged into `main`.
- VERIFIED: `AGENTS.md` and `progress.md` are the active repository handoff mechanism.
- VERIFIED: The handoff self-test passed.
- DOCUMENTED BUT UNVERIFIED: Existing Phase 2.2 production/live behavior remains outside this pilot.
- UNKNOWN: Current production environment state unless separately verified.

## Completed in current work

- Clean authoritative Git clone established.
- Existing durable handoff documentation confirmed.
- Minimal session-handoff rules added to `AGENTS.md`.
- Root `progress.md` created.
- Repository-only handoff self-test passed.
- Pilot documentation branch created, reviewed, and merged into `main`.
- Handoff protocol is active for controlled normal-session use.

## Current task

- [ ] Begin the first contained real Codex session using the new handoff protocol.

## Next tasks

- [ ] Complete 2–3 contained real Codex sessions.
- [ ] Evaluate whether `progress.md` remains concise, accurate, and useful.
- [ ] Decide whether to standardize the protocol across other Mendtrix repositories.

## Blockers / risks

- `progress.md` must remain a current-work checkpoint, not a roadmap or changelog.
- Live Git mechanics must be verified with Git rather than copied into this file.
- Historical test results must not be reported as current verification.
- Existing documented production/security risks remain authoritative in `docs/KNOWN-ISSUES.md`.
- No production, Supabase/Auth, Vercel, RLS, grading-engine, or Phase 3 changes are authorized by this pilot.

## Important files

- `AGENTS.md`
- `progress.md`
- `docs/HANDOFF.md`
- `docs/PROJECT-STATE.md`
- `docs/KNOWN-ISSUES.md`
- `docs/ROADMAP.md`

## Verification

Last verification:

- Repository / Git baseline: PASS
- Handoff self-test: PASS
- Main merge verification: PASS
- Typecheck: NOT RUN
- Unit: NOT RUN
- Database / SQL: NOT RUN
- Security / RLS: NOT RUN
- E2E: NOT RUN
- Build: NOT RUN

## Repository reference

For live branch, working-tree, remote-tracking, or commit state, verify directly
with Git rather than relying on this file.

## Handoff

Last completed:
The lightweight repository-based handoff protocol was implemented, self-tested,
reviewed, and merged into `main`.

Currently stopped at:
Before the first contained real Codex session.

Next smallest safe step:
Start a normal repository session using AGENTS.md → progress.md → Git status →
task-specific evidence.
