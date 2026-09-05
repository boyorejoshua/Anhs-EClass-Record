# Roadmap

Where the project has been, what is in flight, and what comes next.

This is the *current* roadmap. `docs/12-mvp-and-roadmap.md` is the
**planning-era** roadmap written before the platform existed — kept for
its milestone sizing and reasoning, but where the two differ, this file
is what actually happened.

Nothing below is invented. Items come from completed phase documents,
`PROJECT-STATE.md`, the deferred list carried across sessions, and the
two calendar dates the commercial plan is anchored to.

---

## Completed

| Phase | What it delivered | Record |
|---|---|---|
| **Planning** | 21-document audit of V0 and the full V1 plan | `docs/00`–`docs/20` |
| **0** | Current-state audit; the route model (`nav.ts`); navigation that actually navigates | `docs/23` |
| **1** | Student master records, enrolment lifecycle, portal provisioning — the three-table student model | `docs/24` |
| **1.5** | Whole academic lifecycle rehearsed against a rebuilt database; learner schedule added on existing schema | `docs/25`, `docs/26` |
| **2** | Marked demo dataset (`DEMO-` learners), in-app guide, navigation audit | `docs/27` |
| **2.1** | Hardening: unstarted-term empty state, demo/fixture parity, guide reachable by every role, two `anon`-executable RPCs closed (migration 0044) | `docs/28`, `docs/29` |
| **2.2** | Production role switching fixed; academic-year architecture audited; read-only Academic Years screen | `docs/session-log/2026-09-03-phase-2.2.md` |
| **merge** | PR #44 squash-merged to `main` (`6136091`), confirmed `merged: true`; Vercel production deploy triggered | `docs/session-log/2026-09-04-merge-and-demo-rehearsal.md` |

Foundational capabilities that exist and are tested: multi-tenant
isolation, the full grade lifecycle with audit, publication gated in
RLS, the single vendored grading engine, LOA banding, three-term and
DepEd-official Excel import, consolidated grades, global reports,
analytics, record book, SF10 preview, student portal with schedule and
academic history.

---

## In progress

**Nothing is mid-implementation.** The tree is clean, everything is
merged to `main`, and all suites pass. The project is at a checkpoint,
not in the middle of a change — which is the good state to hand over in.

One thing is genuinely *pending*, and it is not code:

- **Live verification of the production deploy.** The merge triggered a
  Vercel production deploy on `6136091`. Confirmation on the live site —
  sign in as `joshua@anhs.test`, walk all five roles, confirm "Academic
  Years" no longer reads SOON — is **awaiting Joshua**. Everything below
  assumes it passes; if it does not, that becomes the top priority.

---

## Next — in this order

The order is not arbitrary; each item's dependency is named.

### 1. Rotate demo passwords, enable leaked-password protection
**Blocks: any real learner data.** `KNOWN-ISSUES.md` #1. A Supabase Auth
configuration change plus seven rotations. No code, no migration, no
test will catch it if skipped. Do this before anything that touches a
real school.

### 2. Create a demo learner's portal account
**Blocks: showing the student portal in a demonstration.**
`KNOWN-ISSUES.md` #2. One minute through the product; `DEMO-0001` by
default. First item on `docs/28-principal-demo-checklist.md`.

**Requires an explicit go-ahead** — doing it against production is not a
rehearsal that can be rolled back. This is "Phase B" in earlier session
notes.

### 3. Run the principal demo checklist end to end
**Depends on 2.** `docs/28-principal-demo-checklist.md`, step by step,
delivering an honest verdict. This is the gate the pilot conversation
depends on.

### 4. Phase 3 — Public Enrollment
The next *development* phase. **Explicitly not started**, on
instruction. Do not begin it without being asked for it by name.

---

## Future

Not scheduled. Each carries the reason it is not next, so a later agent
can tell "deferred with cause" from "forgotten".

| Item | Why it is not next |
|---|---|
| **SF9 report card; SF1–SF8 generally** | The document engine (`docs/11`) is designed, not built. Biggest single unbuilt area, and the one a registrar will ask for first. |
| **Reports & Documents screen** | Route exists, screen does not. Pairs with the above. |
| **Formal SF2 / SF4 attendance compliance** | Attendance is captured; the compliance *forms* are not generated. |
| **Grading Configuration screen** | Deliberate — editing a scheme mid-year would alter grades already computed under the old one. D-016. Needs a correctness design, not a CRUD screen. |
| **Structured class schedule (`class_meetings`)** | Deliberate — D-013. A real modelling exercise with a school, not a parser over `schedule_note`. |
| **Archive action for academic years** | Would make `KNOWN-ISSUES.md` #3 exploitable. **Fix that trigger first.** |
| **`principal` role in the client** | No screen needs it yet. D-018. |
| **Parent portal** | Not designed. |
| **SMS notifications** | Not designed. |
| **Bundle splitting** | `KNOWN-ISSUES.md` #8. No user-visible problem yet. |
| **`docs/grade-persistence-audit.md`** | Long-standing task #33. An audit doc, not code. |

---

## Blocked

| Item | Blocked on |
|---|---|
| Everything downstream of the deploy check | Joshua's live confirmation (§ In progress) |
| Portal account for a demo learner | Explicit go-ahead to act against production |
| Real learner data, of any kind | `KNOWN-ISSUES.md` #1 (passwords, leaked-password protection) |
| Commercial claims about SF coverage | The document engine being built |
| Confirming which V0 copy is authoritative | Human confirmation — the standalone repo and this repo's root V0 have diverged. `PROJECT-STATE.md` |

---

## The two dates everything is sized against

From `docs/README.md`, and they drive the commercial plan more than any
technical consideration:

- **4 January 2027 — Term 3 opens.** The realistic pilot window. A
  school cannot switch grading systems mid-term, so a missed term is a
  missed term.
- **~June 2027 — SY 2027–2028 opens** and DepEd replaces transmutation
  with **zero-based grading**. Every Excel template in every school
  breaks at once. This is the full-deployment window and the strongest
  commercial opening available.

The second date is also a *technical* deadline: the transmutation model
in the database must be able to express zero-based grading as
configuration. D-009 says it should — periods, weights and bands are all
rows — but **this has not been tested against the new rules, because the
new rules are not published in detail yet. UNVERIFIED.** It is worth
checking early rather than in May 2027.
