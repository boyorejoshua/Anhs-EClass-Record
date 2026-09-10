# Current Work — Project Handoff

Last updated: 2026-09-11

## Current objective

Use the newly established repository-based AI handoff protocol through 2–3
contained Codex sessions before broader Mendtrix rollout.

No feature, production, database, authentication, or deployment work is
authorized by this workstream.

## Current state

- VERIFIED: The handoff protocol is merged into `main`.
- VERIFIED: `AGENTS.md` and `progress.md` are the active repository handoff mechanism.
- VERIFIED: The handoff self-test passed.
- VERIFIED: The prior non-demo multi-role switching defect is fixed in source: the sidebar setter feeds `resolveActiveRole()`, which accepts held-role overrides outside DEMO_MODE.
- VERIFIED: Session 1C used `npm ci` against the committed lockfile; `package.json` and `package-lock.json` remained unchanged, and Vitest is available locally.
- VERIFIED: Targeted `src/nav.test.ts` passed: 1 file, 33/33 tests, including the six non-demo active-role regression cases.
- VERIFIED: E2E uses exact project-local `playwright@1.56.0`, a shared resolver, and ignored project-local browser assets. No E2E script resolves Playwright from the global npm prefix.
- VERIFIED: A clean `npm ci` followed by `npm run e2e:install-browser` completed Chromium 1194 installation and the focused browser regression under the existing isolated Node 24.19.0 runtime.
- DOCUMENTED ENVIRONMENT INTERACTION: Under this machine's Node 26.5.0 runtime, the same pinned install completed the archive download but stalled during Chromium extraction. This is not evidence that Node 26 is unsupported.
- VERIFIED: The fixture-backed non-demo `Your roles` browser regression passed all eight checks: held roles, no demo preview, Administrator → Registrar switch, Dashboard reset, Registrar navigation, and no page/console errors.
- VERIFIED: The approved Session 2B testing/documentation-only change set was merged through PR #46, and the required post-merge local verification passed: `src/nav.test.ts` (33/33), typecheck, the focused eight-check browser regression, and E2E syntax/import validation.
- DOCUMENTED BUT UNVERIFIED: Current live-site behavior for role switching and role-specific navigation has not been freshly exercised in this session.
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
- Session 1: role-switching and reports/documents source investigation completed; no code change made.
- Session 1B: pre-verification confirmed only `progress.md` is modified; targeted unit verification stopped before execution because the local Vitest runner is absent.
- Session 1C: reproducible local dependency setup completed without tracked dependency-file changes; the targeted role-navigation unit test passed. No application source or test was changed.
- Session 2B: the project-local Playwright migration was completed and tested. The exact browser installation works with Node 24.19.0; the focused non-demo role-switching E2E passes all eight checks. E2E syntax (26 files), local resolver imports (24 suites), TypeScript, and `src/nav.test.ts` (33/33; latest 2.82s) pass. No application business logic changed.
- Session 2C: PR #46 was merged using the normal GitHub merge method. On merged `main`, the targeted navigation unit test (33/33; 3.24s), typecheck, the focused non-demo browser regression (8/8), and E2E syntax/import validation (26 scripts; 24 shared imports; no global resolver references) passed. No application business logic changed.

## Current task

- [x] Investigate current role-switching and reports/documents behavior without changing code.

## Next tasks

- [x] Complete the contained Session 2 testing-only change set and its normal merge workflow.
- [ ] Assess the handoff pilot after the intended contained sessions before proposing broader rollout.
- [ ] Evaluate whether `progress.md` remains concise, accurate, and useful.
- [ ] Decide whether to standardize the protocol across other Mendtrix repositories.

## Blockers / risks

- `progress.md` must remain a current-work checkpoint, not a roadmap or changelog.
- Live Git mechanics must be verified with Git rather than copied into this file.
- Historical test results must not be reported as current verification.
- Dependency setup must remain lockfile-based; do not install or update dependencies without explicit approval.
- Browser tooling is project-contained and version-pinned. On this machine, use the existing isolated Node 24.19.0 runtime if the Node 26.5.0 extraction stall recurs; do not replace global Node or change Playwright without approval.
- `npm ci` reported three dependency audit findings (two moderate, one high) and one pending `esbuild` install-script notice. No audit, approval, or dependency change was performed in this test-only workstream.
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
- Role-switch source trace: PASS
- Unit — targeted `src/nav.test.ts`: PASS (Vitest 3.2.7; 1 file, 33/33 tests; 2.73s)
- Session 2 targeted `src/nav.test.ts`: PASS (Vitest 3.2.7; 1 file, 33/33 tests; 1.14s)
- Session 2 post-harness `src/nav.test.ts`: PASS (Vitest 3.2.7; 1 file, 33/33 tests; 1.49s)
- Session 2B browser installation: PASS (exact local Playwright 1.56.0; Chromium 1194 and headless shell; Node 24.19.0)
- E2E harness syntax/import: PASS (26 `.mjs` files; 24 suite imports through `e2e/playwright.mjs`; zero global resolver references)
- Typecheck: PASS (Node 24.19.0)
- Unit — targeted `src/nav.test.ts`: PASS (Vitest 3.2.7; 1 file, 33/33 tests; 2.82s; Node 24.19.0)
- Non-demo browser regression: PASS (fixture-backed local browser run; 8/8 checks; Node 24.19.0)
- Session 2C merged-main unit — targeted `src/nav.test.ts`: PASS (Vitest 3.2.7; 1 file, 33/33 tests; 3.24s; Node 24.19.0)
- Session 2C merged-main typecheck: PASS (Node 24.19.0)
- Session 2C merged-main non-demo browser regression: PASS (fixture-backed local browser run; 8/8 checks; Node 24.19.0)
- Session 2C merged-main E2E harness syntax/import: PASS (26 `.mjs` files; 24 suite imports through `e2e/playwright.mjs`; zero global resolver references; Node 24.19.0)
- Playwright prerequisite strategy: project-local exact `playwright@1.56.0` verified; no global package required.
- Database / SQL: NOT RUN
- Security / RLS: NOT RUN
- E2E full suite: NOT RUN
- Build: NOT RUN

## Repository reference

For live branch, working-tree, remote-tracking, or commit state, verify directly
with Git rather than relying on this file.

## Handoff

Last completed:
Session 2C merged the approved testing/documentation-only PR #46 and completed
the required merged-main verification. The lightweight repository handoff
protocol and the reproducible focused role-switching regression are now stable
on `main`; live non-demo behavior remains unverified.

Currently stopped at:
A stable post-merge checkpoint. No feature, production, database,
authentication, or deployment work is authorized by this pilot.

Next smallest safe step:
Obtain a separately scoped, explicitly approved task. Before any implementation,
identify its durable documentation and current source of truth; do not begin
feature work automatically.
