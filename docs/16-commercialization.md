# 16 — Commercial Product Strategy

*Covers Part 31 of the audit brief.*

---

## PART 31 — The value proposition

### What not to sell

> ❌ *"We converted your Excel E-Class Record into a website."*

This framing loses. It invites comparison against a free tool the school already owns and already knows, it makes the product sound like a convenience, and it puts the buyer in the frame of mind of asking why they should pay for a worse spreadsheet.

### What to sell

> ✅ **"Your teachers encode grades once, online. The system consolidates every record automatically. Your registrar reviews, approves, and publishes — then generates official documents in seconds instead of days. And your students log into their own portal to see their grades."**

That sentence contains four separately valuable things, and each lands with a different person in the room.

### The five benefits, ranked by what a school will actually pay for

| # | Benefit | Who feels it | Why it converts |
|---|---|---|---|
| 1 | **The registrar's time back** | Registrar, School Head | Consolidation and chasing disappear. Quantifiable in hours per term — and the registrar can quote the number. |
| 2 | **Defensible records** | School Head, Registrar | Every grade has an author, an approver, and a full history. This is what a disputed grade turns on, and heads know it. |
| 3 | **Continuity through policy change** | School Head | DepEd changes the rules; the system absorbs it. **SY 2027–2028 zero-based grading is the concrete instance.** |
| 4 | **Instant historical retrieval** | Registrar | SF10 for a transferring learner in seconds rather than days of archaeology. |
| 5 | **A student portal** | School Head, parents | The visible, demonstrable, reputational part. What gets shown at a PTA meeting. |

Note that teacher convenience is **not** on the list. It is what must be true for the purchase to succeed, but it is not why anyone buys. Build for the teacher; sell to the registrar and the head.

### The wedge: SY 2027–2028

The strongest opening available, and it has a deadline:

> *"In June 2027 DepEd replaces transmutation with zero-based grading. Every class record template in your school stops being correct, and every teacher has to be retrained on a new file — for the second time in two years. In our system that is a settings change we make for you, and nobody retrains."*

This is specific, dated, externally verifiable, and it reframes the subscription from a cost into insurance. Every school in the segment faces it simultaneously — a market-wide forcing event rather than a school-by-school persuasion problem.

---

## PART 33 — Service models

### The four options

| | **1 Custom build** | **2 Pure SaaS** | **3 Setup + maintenance** | **4 Hybrid** |
|---|---|---|---|---|
| School pays | One-off, large | Monthly/annual only | Setup + annual fee | Setup + annual subscription |
| Mendtrix revenue | Lumpy | Recurring, slow to build | Recurring | **Recurring + implementation covered** |
| Covers migration cost | ✅ | ❌ **loses money per deployment** | ✅ | ✅ |
| Funds ongoing DepEd updates | ❌ | ✅ | ✅ | ✅ |
| Encourages a shared codebase | ❌ **actively fights it** | ✅ | ✅ | ✅ |
| Public-school procurement fit | Easier — a one-off purchase | Harder — recurring commitment ⚖️ | Moderate | Moderate ⚖️ |
| Cash flow at 1–2 people | Feast and famine | Thin for 2+ years | Workable | **Workable** |
| Scales to 10 schools | ❌ 10 codebases | ✅ | ✅ | ✅ |

### Recommendation: **Option 4 — Hybrid**

**Implementation fee + annual subscription.**

The reasoning is specific rather than generic:

- **The implementation fee covers real cost.** Data cleaning alone is 2–4 days per school ([15 Onboarding & Discovery](15-onboarding-and-discovery.md)). Pure SaaS with free onboarding loses money on every deployment until the subscription catches up — which for a small vendor is a cash-flow problem long before it is a profitability problem.
- **The subscription funds what schools genuinely cannot do themselves:** absorbing annual DepEd policy changes. That is a real, recurring, demonstrable service, not a maintenance rent.
- **Option 1 is disqualified structurally.** Custom builds create per-school codebases, which is the exact failure this whole architecture exists to prevent. Every custom deployment makes the eleventh school harder rather than easier.
- **Option 2 is disqualified on cash flow** at 1–2 people, and because free onboarding attracts schools that are not committed enough to do the data work.

### Structure

| Component | Basis | Rationale |
|---|---|---|
| **Implementation fee** | Fixed, banded by learner count | Covers discovery, configuration, migration, templates, training. Should roughly cover the effort in [15](15-onboarding-and-discovery.md). |
| **Annual subscription** | Banded by learner count | Hosting, support, DepEd policy updates, product improvements. |
| **Optional: historical migration** | Per year migrated | Genuinely variable; should not be bundled. |
| **Optional: dedicated database** | Premium tier | Same code, different connection ([07 System Architecture](07-system-architecture.md)). Only build when someone pays. |
| **Optional: custom form development** | Quoted | Tier 4 in [14 School Configuration Matrix](14-school-configuration-matrix.md). Rare by design. |

> **Deliberately not proposing specific figures.** Pricing needs the pilot school's actual implementation effort and a real answer on procurement (below) before numbers mean anything. What matters architecturally is the *shape*: implementation covers cost, subscription funds continuity.

**Banding principle:** price by learner count, not per learner. A per-learner price makes the invoice grow every enrollment season and gives the school a reason to renegotiate annually. Bands are predictable and easier to budget.

### ⚖️ The procurement question — resolve this before pricing anything

**How can a Philippine public school lawfully procure a recurring SaaS subscription, and from which fund?**

This is a genuine commercial blocker and it is unresolved:

- MOOE has constraints on what it may fund and on multi-year commitments
- Government procurement rules impose thresholds and processes above certain amounts
- Some schools may be able to purchase a one-off "system" more readily than a recurring service
- Local school board funds, PTA funds, and division-level purchasing may each work differently

**Action:** ask questions 96–98 in the discovery questionnaire at the *first* school, and get a definitive answer from someone who has actually procured software for a public school. If recurring subscriptions turn out to be impractical, Option 3 — a setup fee plus an annually renewed maintenance agreement — is the fallback, and it is close enough to Option 4 that no architecture changes.

⚖️ **This is not legal advice and needs professional and practical validation.** Recorded in [20 Assumptions Register](20-assumptions-register.md).

---

## Go-to-market

### Sequence

```
Pilot school (ANHS)
      ↓  prove it, capture real numbers, get a reference
2–3 referred schools in the same division
      ↓  the registrar network is the channel
Divisional visibility
      ↓
10 schools
      ↓
Private schools (Phase 2 template pack)
```

**The registrar network is the channel.** Registrars across a division know each other, attend the same trainings, and share the same problems. One registrar publicly saying "I got four days of my term back" is worth more than any marketing.

### What the pilot must produce beyond working software

- **Hours saved, measured.** Time consolidation before and after. This number is the entire proposal.
- **A named reference** willing to take a call from another school.
- **Before-and-after screenshots** of the registrar's actual workflow.
- **A quotable line** from the registrar and from a teacher.
- **A real implementation cost figure** to price against.

Capture these deliberately during the pilot. They will not materialise afterwards from memory.

### Objections and honest answers

| Objection | Answer |
|---|---|
| *"Excel is free."* | Excel is free; consolidation is not. Here is your registrar's hours per term. |
| *"Our teachers aren't technical."* | The grid works like a spreadsheet, including paste. Two-hour training with their own classes. And the roster is already filled in. |
| *"What if the internet goes down?"* | Work continues, saves queue and flush on reconnect. And a teacher can always work in Excel and import. |
| *"What if you disappear?"* | Full data export in an open format, written into the contract. Your data is yours. |
| *"We tried something like this before."* | What happened? *(Then address that specifically — this is the most useful objection you will get.)* |
| *"Can you match our exact form?"* | Yes — templates are configuration. Show them the school's own report card rendered. |
| *"Is our students' data safe?"* | Isolation at the database layer, audit logging, and here is the data-processing agreement. ⚖️ |
| *"We don't have budget this year."* | What is your procurement cycle, and what would need to be true for next year? |

---

## What makes this commercially valuable — the honest summary

The product is valuable to a school because it converts **recurring manual labour** into **a fixed annual cost**, and because it makes the school's academic records **defensible** in a way spreadsheets cannot be.

It is valuable to **Mendtrix** only if one condition holds: **the tenth deployment must cost less than the first.** Everything in [14 School Configuration Matrix](14-school-configuration-matrix.md) and [07 System Architecture](07-system-architecture.md) exists to protect that condition. If Tier 4 custom development becomes routine, the product becomes a consultancy with extra steps — profitable per project, but with no compounding value and no asset at the end.

The single discipline that preserves the business: **when a school asks for something the platform does not do, the default answer is a configuration option for everyone, not a code change for them.**
