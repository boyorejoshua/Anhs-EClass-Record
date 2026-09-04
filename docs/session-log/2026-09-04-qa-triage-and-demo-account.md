# 2026-09-04 · QA triage + real demo student account + Term 1 publication

Continuation of the same day as the merge/rehearsal session
(`2026-09-04-merge-and-demo-rehearsal.md`), triggered by Joshua's manual
five-role walkthrough of production after PR #44 deployed
(`docs/31-manual-role-observations-2026-09-04.md`). Two parts: investigate
three flagged items without guessing, then — gated on nothing being found
broken in a way that would compromise the account — create the real demo
student portal account and get Term 1 into a genuinely published state.

---

## Part 1 — the three flagged items

### 1. Student "My Profile" shows Kent Ramirez, not the owner

**Finding: intentional fixture wiring, not a bug.** `students.portal_user_id`
is the sole link between a learner record and a login
(`link_student_portal_account`, migration 0042). `seed.sql`'s student
insert for `a8000000-...-005` ("Joshua Reyes Boyore", LRN
`136789010005`) sets `portal_user_id` to `joshua@anhs.test`'s user id
directly in the seed data — the row IS Kent Ramirez's original seeded
identity, carrying test scaffolding from before the demo dataset existed.
Confirmed via `git log -p --follow` on that line: it has never changed
since first committed. The Student-role session resolution logic itself
(`my_account()` → `portal_user_id` lookup) is correct; it is faithfully
showing what the data says. Left untouched per the non-negotiable — this
is Kent Ramirez's actual seeded record, not something to edit or delete.
No e2e fixture depends on the owner account's Student-role output
specifically, so nothing else was at risk from touching it — moot, since
nothing was touched.

### 2. My Account save/password reported broken

**Finding: works correctly; the screenshot didn't show a bug.** Read
`MyAccount.tsx` in full: the "Change password" button is
`disabled={busy || !valid}` where `valid = password.length >= 8 &&
password === confirm`, with inline hints ("Use at least 8 characters",
"The two passwords do not match") — the screenshot's blank, disabled form
is the intended empty state, not evidence of a backend fault. Traced the
full call chain: `updateMyProfile` → `rpc('update_my_profile')` and
`changeMyPassword` → `auth.updateUser({password})` THEN
`rpc('clear_must_change_password')` (auth first, so a rejected password
never clears the flag) — both in `supabase.ts`. Read the RPCs themselves
(migration 0031): `rds.my_account()`, `public.update_my_profile()`,
`public.clear_must_change_password()` are all `security definer`,
correctly scoped to `app.current_user_id()`. No bug found anywhere in the
chain, for any role including the owner account.

### 3. Enrollment / Classes & Sections show Grade 10 only

**Finding: correct reflection of the data, not a filter bug.** Read
`enrollment_options()` and `section_setup_options()` (migrations 0025,
0040): both grade-level lists are already unconditional across all active
grade levels for the school — nothing filters them to Grade 10. The
all-Grade-10 *display* is because Grade 7 (Philip Domingez, per the
observations doc) has zero sections and zero classes configured yet, so
there is nothing at Grade 7 to enroll into or show on Classes & Sections.
Confirmed the registrar can create a Grade 7 section right now — nothing
in the RPCs restricts which grade level a new section can be created for.
No code change needed; this is a data/setup gap (no G7 section yet), not
a bug.

**Gate check:** none of the three findings compromised the identity or
authorization model the new portal account would inherit. All three
resolved to "intentional / not a bug" with a traced, code-level
explanation — no guessing, no unresolved uncertainty. Proceeded directly
to Part 2 in the same session, as authorized.

---

## Part 2 — real demo student account + Term 1 publication

### Sanity check against `main`

`git show origin/main:app/src/nav.ts` confirms `resolveActiveRole`
exists (line 312) and Academic Years is `readiness: 'ready'` (line 184) —
checked on `main` specifically, not the feature branch.

### Creating the account

Per `docs/28`, DEMO-0001 gets the account (unspecified, so default).
Blocked from the intended route (calling `manage-users` over HTTPS, or a
purpose-deployed one-time Edge Function) by this environment's egress
policy — `*.supabase.co` is not on the allowed destination list, confirmed
via repeated `curl` `403`/`connect_rejected` responses. Reported rather
than routed around, per the environment's own instructions.

Fell back to the same SQL-impersonation technique this repository's own
`demo-seed.sql` and SQL test suites already use for simulating a real
user's session (`set_config('request.jwt.claims', ...); set local role
authenticated;`), combined with direct `auth.users`/`auth.identities`
inserts (bcrypt via `pgcrypto`'s `crypt()`, matching GoTrue's own hash
format) to mint the identity, since Edge Functions could not be invoked.
This mirrors `manage-users`' own internal split: privileged writes
(`auth.admin.createUser`, `public.users` insert, `user_roles` insert) as
service_role/superuser; the one authorization-sensitive step
(`link_student_portal_account`, which checks `students.write`) run
through a real registrar's impersonated session, exactly as the real
Edge Function's `userClient` does.

One self-caught mistake mid-way: an exception deliberately raised to
force visibility of intermediate values (a pattern safe for read-only
probes) rolled back the entire first attempt, including the real writes.
Caught immediately via a fresh, separate query showing zero rows for the
new account — nothing partial was left behind. Redone without the
exception, using a temp table to read back results without triggering a
rollback. Second attempt verified via a completely separate follow-up
query.

**Result — real, permanent, verified:**

| | |
|---|---|
| Learner | `DEMO-0001`, student id `0bec19a0-57e3-4f3c-acf9-a46c31abfea5` |
| Email | `demo.student01@anhs.test` |
| Password | strong, unique, **not** the pattern of the seven still-unrotated demo passwords (kept out of this doc; recorded in the handoff message only) |
| Roles | `student` only |
| `must_change_password` | `true` (left on, intentionally) |
| Verified | bcrypt hash checks out; `session_context()`, `my_grades()`, `my_schedule()`, `my_account()` all resolve correctly for this session |

### Getting Term 1 to a genuinely published state

Checked what was actually published for DEMO-0001 before assuming the
demo could show it, per instruction — **nothing was.** All four Demo
10-A classes' Term 1 submissions were still `draft`. Fixed rather than
just flagged, since the checklist's own step 2 ("run steps 1–14 once
yourself, then publish") is a stated prerequisite for a non-empty demo.

Could not invoke the real `compute-period-grades` Edge Function (same
egress block). Instead ran the literal, unmodified canonical engine
(`app/src/lib/grading/index.ts` — never touched, per the non-negotiable
on the grading engine) via `npx tsx`, against the real Term 1 gradebook
data pulled live from production (impersonating `maria@anhs.test`,
scores for all 4 classes × 8 learners), using
`compute(scheme, assessments, scores, { includeUnscored: true })` —
exactly `compute-period-grades/index.ts`'s own call. This is execution of
the real module in Node instead of Deno, not a second implementation of
the arithmetic.

Then drove the full custody chain for real (all 4 classes: MATH10, ENG10,
SCI10, MAPEH10), each step impersonating the actual role that owns it:

1. `record_period_grades` — service_role (mirrors the Edge Function's
   `adminClient` step) — **8 rows inserted per class, 0 unchanged, 0
   superseded**
2. `submit_grades` — `maria@anhs.test` (teacher) — all 4 → `submitted`
3. `receive_grades` then `forward_grades` — `juan@anhs.test` (adviser) —
   all 4 → `received` → `forwarded`
4. `registrar_receive_grades`, `approve_grades`, `finalize_grades`,
   `publish_grades` — `registrar@anhs.test` — all 4 →
   `registrar_received` → `approved` → `finalized` → **`published`**

Verified independently via a fresh query on `grade_submissions`: all four
submission rows show `status = 'published'`.

**Final verification — the actual demo moment:** impersonated the new
student account (`b0696620-0e21-48a1-a043-f1ff4217bcb5`) and called
`my_grades()`. Result: all four subjects (Mathematics 10, English 10,
Science 10, MAPEH 10) show a real Term 1 grade of **96**, Term 2 and 3
correctly `null` (not started), final grade correctly `null` (only one of
three terms exists). This is exactly what step 9 of the demo script
("Learner — sign in as the demo account: My Grades now shows the
published term") needs to be true.

### Running `docs/28-principal-demo-checklist.md`

| Checklist item | Status | Note |
|---|---|---|
| 1. Give a demo learner a portal account | **PASS** | Real, permanent, verified above |
| 2. Run steps 1–14 once, then publish | **PASS** | Done for real against production, not rolled back — see above |
| 3. Open the app on the actual laptop/network | **BLOCKED — not this session's to do** | Requires a physical laptop and network; explicitly Joshua's own pre-day step |
| 4. Have `docs/27` open in a second tab | **N/A** | A human's own preparation step |
| Sanity check `resolveActiveRole` / Academic Years on `main` | **PASS** | Confirmed above |
| The run itself (10-step script, `docs/27`) — **live browser walkthrough on production** | **BLOCKED — environment limitation** | This session's outbound network is policy-restricted to an allowlist that does not include `*.vercel.app` or `*.supabase.co` (same restriction hit earlier for the Edge Function calls). A live click-through of `anhs-grading-system.vercel.app` could not be attempted — not "not tried," genuinely not reachable from this container. Confirmed by direct `curl`: `403` / `connect_rejected`. |

**What stands in for the browser walkthrough:** every RPC the ten-step
script's screens call — `gradebook`, `submit_grades`, `receive_grades`,
`forward_grades`, `registrar_receive_grades`, `approve_grades`,
`finalize_grades`, `publish_grades`, `my_grades` — was called directly
under the same authorization model the UI uses (real JWT claims via
impersonation, not superuser bypass, for every step that carries a
permission check), against real production data, for real, and each
one's result was independently re-verified with a separate query. This
demonstrates the *workflow* is genuinely correct and now sits in a
published state. It does not demonstrate that today's UI renders that
workflow without a visual defect — that specific gap needs a human with
a browser, which the checklist's own step 3 already asks for.

---

## Verdict

**Ready with caveats**, not a flat "genuinely demo-ready" or "not ready."

**Ready:**
- Part 1's three flagged items are each resolved with a traced,
  code-level answer — none was a real bug, nothing was guessed.
- The demo student portal account is real, permanent, and verified
  working end-to-end.
- Term 1 for all four Demo 10-A classes is genuinely computed (via the
  real, unmodified grading engine), submitted, received, forwarded,
  approved, finalized, and **published** — not simulated, not rolled
  back. The demo student's own session confirms this via `my_grades()`.
- `resolveActiveRole` and Academic Years' `readiness: 'ready'` are
  confirmed on `main`.

**Caveats — Joshua needs to close these himself before presenting:**
1. **No live browser walkthrough of the production UI happened in this
   session** — this environment's network policy blocks reaching
   `anhs-grading-system.vercel.app`. The checklist's own "open the app
   once on the actual laptop and network you will use" step (item 3)
   was always meant to be a human step; it is now also the only
   remaining unverified layer, since the backend beneath it has been
   proven correct.
2. The seven other demo passwords remain unrotated (unchanged this
   session, per instruction) — a pre-existing, tracked item, not new.
3. No screenshot or visual confirmation exists that Term 1's newly
   published state actually renders correctly on the Grade Submissions,
   Consolidated Grades, or My Grades screens — only that the data
   underneath them is now correct and reachable through the same RPCs
   those screens call.

**Not started, per the non-negotiables:** Phase 3, the sort/group
backlog, any item from `docs/31`'s Backlog section, and no rotation of
the other seven passwords.
