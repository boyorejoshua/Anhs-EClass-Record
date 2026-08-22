# 18 — Risk Register

*Covers Part 34 of the audit brief.*

Scored **Likelihood** (L) × **Impact** (I), each 1–5. Priority = L × I.
🔴 15–25 critical · 🟠 8–14 significant · 🟡 4–7 moderate · 🟢 1–3 low

---

## Top risks

| # | Risk | L | I | P | |
|---|---|---|---|---|---|
| R1 | Teachers keep parallel spreadsheets | 4 | 5 | **20** | 🔴 |
| R2 | Term 3 pilot date missed | 4 | 4 | **16** | 🔴 |
| R3 | Cross-tenant data leak | 2 | 5 | **10** | 🟠 |
| R4 | Unpublished grades exposed to students | 3 | 5 | **15** | 🔴 |
| R5 | Public-school procurement cannot fund a subscription | 3 | 5 | **15** | 🔴 |
| R6 | Data migration stalls on dirty source data | 4 | 3 | **12** | 🟠 |
| R7 | Per-school customisation creep | 3 | 5 | **15** | 🔴 |
| R8 | Key-person dependency | 4 | 4 | **16** | 🔴 |
| R9 | Exposed V0 Supabase credentials | 5 | 2 | **10** | 🟠 |
| R10 | DepEd policy shifts again mid-build | 3 | 3 | **9** | 🟠 |

---

## Adoption

### R1 — Teachers keep parallel spreadsheets 🔴 *(20)*

**The defining risk of the product.** If teachers encode in Excel and transcribe into the system at deadline, the school has *added* work. The registrar's dashboard shows compliance while the real workflow happens elsewhere, and renewal fails.

*Signals:* teachers asking to "just upload at the end," grades appearing in bursts near deadlines, complaints about entry speed, requests for a bulk template.

*Mitigation:* the 8-minute keyboard benchmark in [12 MVP & Roadmap](12-mvp-and-roadmap.md) M3 is a **release gate**, not an aspiration · paste from Excel is mandatory · auto-populated rosters make the first session persuasive · training uses teachers' own real classes · **ask directly and repeatedly during the pilot, because teachers are polite about this** · instrument entry patterns to detect burst-encoding.

*If it happens:* stop and fix the grid before rolling out further. Do not expand a pilot that has this signal.

### R8 — Key-person dependency 🔴 *(16)*

One or two people hold all product, domain, and operational knowledge. Illness, departure, or burnout during a submission deadline is an existential event for a school mid-term.

*Mitigation:* document as you build — this document set is the start · no undocumented deployment steps · runbooks for restore, incident, and rollover · a second person with production access from day one, even part-time · realistic pilot scope so hypercare is survivable · **be honest with schools about vendor size** and answer it with the data-export guarantee.

### R11 — Registrar champion leaves 🟡 *(6)*
The registrar is usually the internal advocate. Their departure can strand the deployment.
*Mitigation:* train at least two registrar-side users · keep the School Head engaged so sponsorship is not single-threaded · make documentation good enough for a successor.

---

## Schedule

### R2 — Term 3 pilot date missed 🔴 *(16)*

Term boundaries are immovable. Miss 4 January 2027 and the next window is ~June 2027 — losing the rehearsal before the full-deployment push.

*Mitigation:* **run a limited pilot** (one grade level, 4–6 teachers), not a full-school one — this is the primary mitigation and is recommended regardless · treat M0–M3 as the critical path and protect them · scope-cut Phase 2 items aggressively · decide by **end of November 2026** whether January is real, while a controlled fallback to SY 2027–2028 is still possible.

*Accepted:* with one developer, the full MVP does not make January. That is stated in [12 MVP & Roadmap](12-mvp-and-roadmap.md) rather than discovered in December.

### R12 — Scope creep during the pilot 🟠 *(9)*
Pilot feedback becomes a queue of mid-pilot changes, destabilising the system during teachers' first term with it.
*Mitigation:* pilot feedback is **input to Phase 2 prioritisation**, not a live backlog · only defects get fixed mid-pilot · a visible parking lot, since being recorded is usually what the requester wants.

---

## Security & privacy

### R4 — Unpublished grades exposed to students 🔴 *(15)*

A learner seeing a draft or unapproved grade is a serious trust failure, likely to reach parents immediately, and it directly undermines the workflow the product is selling.

*Mitigation:* the publication check lives **inside the RLS predicate**, not in application code ([13 Student Portal](13-student-portal.md)) · automated adversarial tests attempt access to unpublished grades on every build · reopening reverts visibility · publication is a deliberate, separately permissioned, audited action.

### R3 — Cross-tenant data leak 🟠 *(10)*

Lower likelihood than R4 but catastrophic — it would likely end the business.

*Mitigation:* forced RLS on every table · `school_id` in composite foreign keys so cross-tenant references are constraint violations · **the isolation test suite blocks deploys** · tenant identity from a verified token claim only, never client input · Option A (database per school) remains the fallback if these controls cannot be maintained.

### R9 — Exposed V0 Supabase credentials 🟠 *(10)*

**Already materialised.** A live project URL and anon key are committed at `supabase.js:20-21` and present in public git history.

*Action — do this regardless of project timing:* assess what the project can reach · rotate keys or retire the project · note that rotation does not remove the key from history · enable secret scanning in CI before V1 development starts.

### R13 — Weak or shared teacher credentials 🟠 *(8)*
The most likely security issue in practice, and the least technical.
*Mitigation:* narrow teacher scope so a shared credential exposes little · make the system pleasant enough that shortcuts are unattractive · audit logging · MFA for registrar and admin in Phase 2.

### R14 — Legal/privacy obligations unmet at launch 🟠 *(12)*
Data Privacy Act obligations, NPC registration, and the processing agreement are unresolved. ⚖️
*Mitigation:* the pre-deployment checklist in [08 Security & Privacy](08-security-and-privacy.md) is a **gate on commercial deployment, not on development** · engage counsel during the build, not after · the pilot can proceed under the school's existing arrangements while this is settled, but a paid rollout cannot.

---

## Commercial

### R5 — Procurement cannot fund a subscription 🔴 *(15)*

If public schools cannot lawfully commit to recurring SaaS from available funds, the revenue model breaks — though the product does not. ⚖️

*Mitigation:* **resolve this at the first discovery meeting**, questions 96–98 in [15 Onboarding & Discovery](15-onboarding-and-discovery.md) · get an answer from someone who has actually procured software for a public school · fallback is Option 3 (setup fee + annually renewed maintenance), which requires no architectural change · private schools as a secondary market if public procurement proves impractical.

*This is the highest-value unknown in the entire plan.* It is answerable with one conversation and should not wait.

### R7 — Per-school customisation creep 🔴 *(15)*

The slow failure. Each school gets "one small change," and ten schools later there are ten codebases and no product. Margin erodes invisibly because each individual decision looked reasonable.

*Mitigation:* [14 School Configuration Matrix](14-school-configuration-matrix.md) is the governing document · the shared schema makes per-school columns structurally awkward, which is deliberate · **track the proportion of requests landing in Tier 1** as a product health metric · normalise declining internally · when a request recurs across three schools, build it for everyone.

### R15 — Underpriced implementation 🟠 *(12)*
Data cleaning is 2–4 days and easy to underestimate; every deployment then loses money.
*Mitigation:* measure actual effort at the pilot before setting prices · price historical migration separately · make the collection checklist a gate so the school does its share.

### R16 — Slow sales cycle 🟠 *(8)*
School purchasing is seasonal and slow; runway may not survive it.
*Mitigation:* align the pipeline to the SY 2027–2028 forcing event · referrals through the registrar network · do not build for schools that have not committed.

---

## Technical & operational

### R6 — Migration stalls on dirty data 🟠 *(12)*

Inconsistent sections, duplicate learners, missing birth dates, names spelled three ways. The importer surfaces these; a human must still resolve them **with the school**.

*Mitigation:* budget 2–4 days explicitly · the collection checklist gates the start · dry-run into staging first · downloadable error report shaped like the input file · **the school decides correct values, not Mendtrix** · written verification sign-off.

### R10 — DepEd policy shifts again 🟠 *(9)*
Two significant orders landed in 2026 alone; more may follow mid-build.
*Mitigation:* this is precisely what the configuration-driven engine is for — transmutation as data, weights as rows, periods as rows · **read primary issuances, not summaries, before implementing** · treat policy tracking as an ongoing product responsibility and as a selling point.

### R17 — Data loss 🟡 *(5)*
Low likelihood, catastrophic impact.
*Mitigation:* managed PITR · **quarterly tested restores** — an untested backup is a hope · a per-tenant restore runbook written before the first customer, not after the first incident.

### R18 — Deadline-day load 🟡 *(6)*
Most of a school's teachers encoding simultaneously.
*Mitigation:* load-test that specific scenario in M6 · batch autosave rather than per-keystroke writes · tenant-first indexes.

### R19 — Attendance table growth 🟢 *(3)*
~27M rows/year at ten schools.
*Mitigation:* partition by academic year from the start. Known, planned, cheap if done early.

### R20 — Grading engine drift between runtimes 🟡 *(4)*
Browser preview and server authority disagreeing.
*Mitigation:* literally one shared TypeScript module ([07 System Architecture](07-system-architecture.md)) · property tests over random inputs asserting agreement · server value is always authoritative.

### R21 — Templates fail on paper 🟡 *(6)*
Margin, scale, and page-break errors are invisible on screen and obvious to a registrar.
*Mitigation:* **print and compare side by side against the school's original** — a required step, not a check · registrar sign-off on printed output.

---

## Watch list — quarterly review

| Signal | Meaning |
|---|---|
| Tier 3/4 requests rising | R7 materialising — widen configuration before taking more customers |
| Burst grade entry near deadlines | R1 materialising — investigate before expanding |
| Implementation effort exceeding estimate | R15 — reprice |
| Isolation test suite skipped or disabled | R3 — treat as a stop-work condition |
| Restore not tested in 3 months | R17 |
| A new DepEd order issued | R10 — read the primary document |

---

## The three that decide everything

If attention is limited, these are the ones:

1. **R1 — teachers keeping spreadsheets.** Decides whether the product works at all. Answer: the 8-minute benchmark as a release gate.
2. **R5 — procurement.** Decides whether the business model works. Answer: one conversation, at the first school, now.
3. **R7 — customisation creep.** Decides whether ten schools is profitable or fatal. Answer: the configuration matrix, enforced socially as much as technically.

Every other risk is manageable with ordinary diligence.
