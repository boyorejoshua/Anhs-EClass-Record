# 20 — Assumptions Register

**Every item in this planning set marked *Requires validation*, collected into one checklist.**

This is the document to take to the first discovery meeting. Each row names an assumption we made in order to keep planning moving, what we assumed, why it matters, and what breaks if we are wrong.

⚖️ marks items with legal, privacy, or regulatory weight. **These are not legal advice** — they identify where professional counsel is needed.

**Status key:** ⬜ open · 🟨 partially answered · ✅ confirmed

---

## A · Grading & assessment

| # | Assumption made | Impact if wrong | Source | Status |
|---|---|---|---|---|
| A1 | Component weights are DO 015 s.2026: core 20/50/30, MAPEH & EPP-TLE 20/60/20 | Grading engine seeded wrong; every grade recomputes | [04](04-functional-requirements.md) M6 | ⬜ |
| A2 | Examinations subdivides ST1 30 / ST2 30 / TE 40 | Component tree wrong for every subject | [04](04-functional-requirements.md) M6 | ⬜ |
| A3 | We have the correct SY 2026–2027 transmutation table | Every transmuted grade wrong | [06](06-data-architecture.md) | ⬜ |
| A4 | Passing grade is 75 | Promotion and remarks wrong | [04](04-functional-requirements.md) | ⬜ |
| A5 | Final grade is the simple mean of period grades | Final grades and promotion wrong | [04](04-functional-requirements.md) | ⬜ |
| A6 | Descriptor bands match V0's (90+/85+/80+/75+) | Report card remarks wrong | [03](03-existing-system-assessment.md) | ⬜ |
| A7 | SHS subject groups have distinct weights we have not obtained | SHS grading incorrect | [04](04-functional-requirements.md) | ⬜ |
| A8 | Zero-based grading begins SY 2027–2028 as announced | Roadmap and the commercial wedge shift | [12](12-mvp-and-roadmap.md) | ⬜ |
| A9 | Rounding is half-up at each stage | Off-by-one grades at boundaries | [04](04-functional-requirements.md) | ⬜ |
| A10 | Promotion requires both a general-average threshold and all subjects passing | Promotion report wrong | [04](04-functional-requirements.md) | ⬜ |

> **A1–A3 are the highest-priority items in this register.** Read the primary DepEd issuance — not a summary, and not a blog. Ask the school for the transmutation table they actually use.

## B · Academic structure

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| B1 | The school uses the DO 009 three-term calendar | Period configuration differs (handled by design, but seeding differs) | ⬜ |
| B2 | All grade levels use the same period structure | SHS may differ; the model supports it, seeding would change | ⬜ |
| B3 | Term dates match DO 009 (Jun 8 / Sep 16 / Jan 4) | Calendar and attendance denominators wrong | ⬜ |
| B4 | 201 class days for SY 2026–2027 | Attendance denominators wrong | ⬜ |
| B5 | Sections are stable for a full year | Mid-year section transfer becomes MVP rather than Phase 2 | ⬜ |
| B6 | Learners take their section's default subject set | Electives become MVP rather than Phase 2 | ⬜ |
| B7 | One teacher per class | Co-teaching becomes MVP rather than Phase 2 | ⬜ |

## C · Workflow & approvals

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| C1 | Grades route teacher → registrar, with no mandatory department-head stage | Extra workflow stage needed | ⬜ |
| C2 | The School Head is an observer, not a required approver | Optional countersign becomes mandatory | ⬜ |
| C3 | Approve / finalize / publish as three distinct actions matches practice | Workflow simplification or extension | ⬜ |
| C4 | The registrar publishes when ready, not on a fixed release date | Scheduled publication needed | ⬜ |
| C5 | Post-finalization corrections need only registrar approval | Division-office approval may be required ⚖️ | ⬜ |
| C6 | An amended report card need not be marked as amended | Document engine change ⚖️ | ⬜ |
| C7 | Submission is per class per period | Grain change would be structural | ⬜ |

## D · Attendance

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| D1 | Attendance is recorded per subject class | Model supports both, but the default and UI emphasis change | ⬜ |
| D2 | Statuses are Present / Absent / Late / Excused | Configurable, but seeding differs | ⬜ |
| D3 | The expected-days denominator comes from the school calendar | Reports wrong (V0 gets this wrong today) | ⬜ |
| D4 | SF2 is filed monthly | Phase 2 scheduling changes | ⬜ |
| D5 | Advisers own daily attendance; subject teachers own per-subject | Ownership and permissions change | ⬜ |

## E · Student portal

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| E1 | The school wants a student portal at all | Major scope change | ⬜ |
| E2 | Learners may see prior-year records | Config default flips | ⬜ |
| E3 | Attendance is hidden from learners by default | Config default flips | ⬜ |
| E4 | General average is shown to learners | Config default flips | ⬜ |
| E5 | The school will issue credentials to minors ⚖️ | Portal cannot launch without an alternative | ⬜ |
| E6 | Guardian consent is not separately required for a learner account ⚖️ | Consent workflow needed before launch | ⬜ |
| E7 | Learners have smartphone access | Design emphasis changes | ⬜ |
| E8 | Learners may not edit their own contact details | Config default flips | ⬜ |
| E9 | Document download stays out of MVP | Scope change | ⬜ |
| E10 | Incomplete migrated history may be shown if labelled | May need suppression instead | ⬜ |

## F · Forms & documents

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| F1 | Form purposes match public DepEd issuances | Data-source contracts wrong | 🟨 *purposes confirmed; fields confirmed for SF10 only* |
| F2 | SF field lists and layouts match public templates | Template rework per form | 🟨 **SF10-JHS confirmed** from the school's own blank form (SFRT Revised 2017) — see [05 addendum](05-school-forms-strategy.md). Others still open. |
| F3 | The school uses standard SF forms without customisation | Additional template variants | ⬜ |
| F4 | The school files SF1, 2, 4, 5, 9, 10 (per V0's implementation) | Phase 2 scope changes | ⬜ |
| F5 | SF3 (books) and SF8 (health) are out of scope | Scope expansion, or decline | ⬜ |
| F6 | No mandated document numbering format ⚖️ | Reconciliation if discovered late | ⬜ |
| F7 | Wet signatures remain acceptable; no digital signature required ⚖️ | Significant Phase 2 work | ⬜ |
| F8 | Digitally generated forms are accepted by the division office ⚖️ | **Could invalidate the document engine's value** | ⬜ |
| F9 | The observed-values rubric on the report card is school-specific | Template rework | ⬜ |
| F10 | A4 portrait is the standard page setup | Template rework | ⬜ |
| F11 | **SF10-JHS has FOUR quarterly rating columns; DO 009 s.2026 gives three terms.** How should a three-term year be recorded on a four-column form? ⚖️ | **Every SF10 issued from SY 2026-2027 onward** | ⬜ |
| F12 | Is there an SF10-SHS variant the school also files? | Additional template | ⬜ |
| F13 | Are `Technical drawing` and `ICF` (seen on the sample) standing learning areas or one learner's electives? | Subject catalogue seeding | ⬜ |
| F14 | SF10 page-2 continuation rules — how many scholastic blocks per page before overflow? | Template pagination | ⬜ |
| F15 | Is a document number required on SF10, and in what format? ⚖️ | Numbering configuration | ⬜ |
| F16 | **LOA proficiency bands** (0-24 / 25-49 / 50-74 / 75-89 / 90-100) | Rebanding every LOA report | ✅ **Confirmed** from the school's `CLASSRECORD_Template.xlsx`, and identical to the legacy JS |
| F17 | **LOA seven-band descriptor scale** (≤74 / 75-79 / 80-84 / 85-89 / 90-94 / 95-97 / 98-100) used for Performance Tasks and Quarterly Grades | Rebanding two of the five LOA tables | 🟨 Taken from the same workbook, **but the school flagged that it may not be the current issuance**. Most likely of the two scales to have been revised. Ask the department coordinator. |
| F18 | Is the supplied `CLASSRECORD_Template.xlsx` the version currently in use? | LOA layout, band scales, and the pre-test table | 🟨 The school supplied it "not totally sure if this is updated". Everything in `lib/loa.ts` derives from it. |
| F19 | **The LOA pre-test / diagnostic table is not implemented** — a diagnostic sits outside the grading scheme and the data model has nowhere to put one | One of five LOA tables missing at filing time | ⬜ Ask whether the diagnostic is required on the filed sheet, and where its scores come from |

> **F16–F19 came from a real artifact, not an inference.** The school
> supplied its own `CLASSRECORD_Template.xlsx` (encrypted; password held
> by the school). That settled the band thresholds and the transmutation
> table outright — and confirmed the name is *Learning Outcomes
> Assessment*, correcting two earlier readings. What it cannot settle is
> whether the file itself is current.
>
> **F8 is quietly one of the most important rows in this register.** If a division office insists on the official Excel templates rather than system-generated equivalents, the document engine's value drops sharply and the product's pitch changes. Ask early.

## G · Data & migration

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| G1 | The school holds learner data in Excel | Migration approach changes | ⬜ |
| G2 | Most learners have an LRN | Import validation and matching change | ⬜ |
| G3 | Historical records exist in a migratable form | SF10 completeness affected | ⬜ |
| G4 | Migrating final grades only (not component scores) is acceptable | Migration effort multiplies | ⬜ |
| G5 | Guardian contact details exist and are current | Parent portal timeline affected | ⬜ |
| G6 | No existing system needs integration | Integration scope | ⬜ |
| G7 | The school will do the data-cleaning work with us | Implementation cost rises materially | ⬜ |

## H · Infrastructure & operations

| # | Assumption | Impact if wrong | Status |
|---|---|---|---|
| H1 | Internet is adequate in faculty and admin areas | **Offline mode may become necessary** | ⬜ |
| H2 | Connectivity is intermittent, not absent | Same as above | ⬜ |
| H3 | Teachers have laptops or smartphones | Device strategy changes | ⬜ |
| H4 | Teachers can work on grades from home | Deadline design changes | ⬜ |
| H5 | The school has no dedicated IT staff | Support model and training change | ⬜ |
| H6 | Peak load is a submission deadline, ~100 concurrent users | Capacity planning | ⬜ |

> **H1 and H2 should be measured, not asked about.** Test connectivity in the faculty room, the registrar's office, and two classrooms — they will differ, and the answer determines whether the offline decision in [09](09-ux-architecture.md) holds.

## I · Privacy, legal & regulatory ⚖️

**All require professional validation. None is resolved here.**

| # | Question | Impact | Status |
|---|---|---|---|
| I1 | Is the school the Personal Information Controller and Mendtrix the Processor? | Contract structure and liability | ⬜ |
| I2 | What must the data-processing/outsourcing agreement contain? | Cannot deploy commercially without it | ⬜ |
| I3 | Does the school's processing system need NPC registration? | Compliance gate | ⬜ |
| I4 | Does Mendtrix have its own NPC obligation? | Compliance gate | ⬜ |
| I5 | Is a Data Protection Officer required, for either party? | Operational requirement | ⬜ |
| I6 | What consent covers processing minors' academic data online? | **Could gate the student portal** | ⬜ |
| I7 | Breach notification thresholds and timelines? | Runbook design | ⬜ |
| I8 | How do data-subject rights apply to records the school must retain? | Feature and policy design | ⬜ |
| I9 | Is there a data-residency requirement or expectation? | **Hosting region — decide before launch** | ⬜ |
| I10 | How long must academic records be retained? | Retention and deletion policy | ⬜ |
| I11 | Rules on cross-border transfer if hosted abroad? | Hosting decision | ⬜ |
| I12 | DepEd requirements for third-party academic systems? | **Could gate the entire business model** | ⬜ |
| I13 | Is DepEd clearance or accreditation needed? | Same | ⬜ |
| I14 | Audit-log retention period? | Storage and policy | ⬜ |

> **I12 and I13 should be checked in the first month.** If DepEd requires clearance for third-party academic records systems, that is a gate on everything and it is far cheaper to discover now than after a build.

## J · Commercial ⚖️

| # | Question | Impact | Status |
|---|---|---|---|
| J1 | **How can a public school lawfully procure recurring SaaS, and from which fund?** | **Determines the revenue model** | ⬜ |
| J2 | What procurement thresholds and processes apply? | Sales cycle and pricing | ⬜ |
| J3 | Can MOOE fund a multi-year commitment? | Contract structure | ⬜ |
| J4 | Who signs, and who else must approve? | Sales process | ⬜ |
| J5 | Is there allocated budget, and in which cycle? | Timeline | ⬜ |
| J6 | Would the school pay for historical migration separately? | Pricing structure | ⬜ |

> **J1 is the highest-value unresolved question in the entire plan.** It is answerable in one conversation with someone who has actually procured software for a public school. Ask it at the first discovery meeting.

---

## Priority order for the first discovery meeting

If time is short, these ten answers unblock the most:

1. **J1** — procurement (decides the business model)
2. **A1–A3** — actual weights and transmutation table (decides the grading engine's seed data)
3. **I12** — DepEd requirements for third-party systems (potential hard gate)
4. **F8** — are generated forms accepted by the division office (decides the document engine's value)
4b. **F11** — three terms vs four SF10 columns (blocks correct SF10 issuance this school year)
5. **H1** — real connectivity, measured by location (decides the offline question)
6. **E5** — willingness to issue learner credentials (gates the portal)
7. **D1** — attendance mode (decides the default and the UI)
8. **G3/G4** — what history exists and how far back to migrate (decides implementation cost)
9. **C2** — is the School Head a required approver (decides the workflow)
10. **F4** — which SF forms are actually filed (decides Phase 2 scope)

---

## How to use this register

- **Before discovery:** print it. Tick what the meeting answers.
- **During implementation:** an open ⬜ blocking a build decision is an escalation, not a guess.
- **Before commercial deployment:** every ⚖️ row must be ✅ or explicitly accepted in writing by Mendtrix leadership.
- **Per new school:** most rows reset. School-specific answers do not transfer — though DepEd-wide answers (A1–A3, I12, F8) do, and answering them once benefits every subsequent deployment.
