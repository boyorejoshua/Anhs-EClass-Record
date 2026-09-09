# Current Work — Project Handoff

Last updated: 2026-09-10

## Current objective

Establish and validate the lightweight repository-based AI handoff protocol
for E-Class. No feature, production, database, authentication, or deployment
work is authorized in this workstream.

## Current state

- VERIFIED: Clean authoritative Git clone established from `main` at `20c10a40`.
- VERIFIED: Existing durable handoff/state documentation and project-specific `AGENTS.md` are present.
- VERIFIED: The handoff self-test passed using only `AGENTS.md`, `progress.md`, and a documentation-only Git diff check.
- DOCUMENTED BUT UNVERIFIED: Phase 2.2 production deployment and live role-switching / Academic Years behavior.
- UNKNOWN: Current production environment state unless independently verified later.

## Completed in current work

- Clean Git development baseline established.
- Existing repository-based transition documentation confirmed.
- Handoff protocol design approved for pilot.
- Minimal `AGENTS.md` handoff rule and tracked `progress.md` created.
- Repository-only handoff self-test passed.

## Current task

- [x] Add and validate the lightweight `AGENTS.md` + `progress.md` handoff protocol.

## Next tasks

- [ ] Use the protocol through 2–3 contained Codex work sessions before deciding on wider Mendtrix rollout.

## Blockers / risks

- Do not allow progress.md to duplicate durable project documentation.
- Do not treat historical verification as a current test result.
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
- Typecheck: NOT RUN
- Unit: NOT RUN
- Database / SQL: NOT RUN
- Security / RLS: NOT RUN
- E2E: NOT RUN
- Build: NOT RUN

## Repository state

Branch: docs/eclass-handoff-pilot
Working tree: documentation-only changes; uncommitted
Baseline commit: `20c10a40`

## Handoff

Last completed: Minimal handoff protocol added; repository-only handoff self-test passed.
Currently stopped at: Documentation review checkpoint before a proposed pilot commit.
Next smallest safe step: Review and approve the documentation-only pilot commit.
