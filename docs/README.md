# Mendtrix School Academic Records & Grading Platform

**Product audit, gap analysis, architecture & optimization plan — Version 1.0**
Prepared for Mendtrix IT Services · August 2026

---

## What this is

A complete audit of the existing **ANHS E-Class Record System** ("Version 0") and a full plan for evolving it into a **reusable, multi-school academic records and student portal platform** ("Version 1") that Mendtrix can deploy repeatedly with per-school configuration instead of per-school development.

This is a planning artifact. **No implementation code is proposed here**, and none should be written until this set is reviewed and the open validation items are answered by a real school.

## The one-sentence version

> The school needs a centralized academic records and grading system that can generate the school's required official documents — not an "SF1–SF10 website."

Everything follows from that distinction. The database holds the academic truth; forms, report cards, and exports are *outputs* of it.

---

## 👉 Start here

**[00 — Executive Summary](00-executive-summary.md)** — the findings, the recommendation, and the three things that decide success. Ten minutes.

---

## Document index

| # | Document | Audience |
|---|---|---|
| **00** | **[Executive Summary](00-executive-summary.md)** | **Everyone — read first** |
| 01 | [Product Vision & Target Customers](01-product-vision.md) | Everyone |
| 02 | [Roles (RBAC) & End-to-End Workflow](02-roles-and-workflow.md) | Product, engineering |
| 03 | [Existing System Assessment](03-existing-system-assessment.md) | Engineering |
| 04 | [Functional Requirements](04-functional-requirements.md) | Product, engineering |
| 05 | [School Forms Strategy & SF Gap Analysis](05-school-forms-strategy.md) | Registrar-facing, engineering |
| 06 | [Data Architecture & Database Gap Analysis](06-data-architecture.md) | Engineering |
| 07 | [System Architecture & Multi-School Tenancy](07-system-architecture.md) | Engineering |
| 08 | [Security & Privacy](08-security-and-privacy.md) | Engineering, management |
| 09 | [UX / Information Architecture](09-ux-architecture.md) | Product, design |
| 10 | [Excel Migration](10-excel-migration.md) | Implementation team |
| 11 | [Document Engine](11-document-engine.md) | Engineering, registrar-facing |
| 12 | [MVP & Development Roadmap](12-mvp-and-roadmap.md) | Everyone |
| 13 | **[Student Portal Architecture](13-student-portal.md)** | Product, engineering |
| 14 | [School Configuration Matrix](14-school-configuration-matrix.md) | Product, implementation |
| 15 | [Onboarding & Discovery Questionnaire](15-onboarding-and-discovery.md) | Sales, implementation |
| 16 | [Commercial Product Strategy](16-commercialization.md) | Management |
| 17 | [Demo Scenario](17-demo-scenario.md) | Sales |
| 18 | [Risk Register](18-risks.md) | Management |
| 19 | [Final Recommendation & Ten-Schools Answer](19-strategic-answer.md) | Management |
| 20 | **[Assumptions Register](20-assumptions-register.md)** | **Implementation, sales** |

### Build phases — written after the platform existed

The set above was the plan. These record what was actually built, what
broke, and what was verified.

| # | Document | Read it for |
|---|---|---|
| 21–22 | [Functional Optimization Audit](21-functional-optimization-audit.md), [Navigation Map](22-navigation-map.md) | Screen-by-screen state |
| 23 | [Phase 0 — Current-State Audit](23-phase-0-current-state-audit.md) | What the platform looked like before the enhancement phases |
| 24 | [Phase 1 — Students, Enrolment, Portal](24-phase-1-student-enrollment-portal.md) | The three-table student model as built |
| 25–26 | [Phase 1.5 — Plan](25-phase-1.5-validation-plan.md), [Results](26-phase-1.5-rehearsal-results.md) | The lifecycle rehearsed end to end against a rebuilt database |
| 27 | [Phase 2 — Demo Readiness](27-phase-2-demo-readiness.md) | The demonstration dataset and the 15-step script |
| 28 | **[Principal Demo Checklist](28-principal-demo-checklist.md)** | **The sheet to run the demonstration from** |
| 29 | **[Where the Project Stands](29-project-progress.md)** | **One page: what is done, what is not, what blocks a school going live** |
| 30 | **[Project State](30-project-state.md)** | **Read this FIRST in any new session — compact, current, kept up to date** |

Session-by-session detail lives in `session-log/`, one dated file per
session (e.g. `session-log/2026-09-03-phase-2.2.md`) — the working notes
`30-project-state.md` is the summary of.

---

## Where each requested part lives

| Part | Topic | Document |
|---|---|---|
| 1 | Executive Summary | [00](00-executive-summary.md) |
| 2 | Current System Inventory | [03](03-existing-system-assessment.md) |
| 3 | Current System Strengths | [03](03-existing-system-assessment.md) — *KEEP* verdict |
| 4 | Current System Weaknesses | [03](03-existing-system-assessment.md) |
| 5 | Critical Technical Problems | [03](03-existing-system-assessment.md) — five findings |
| 6 | Database Gap Analysis | [06](06-data-architecture.md) — Part 6 section |
| 7 | School Architecture | [07](07-system-architecture.md) |
| 8 | Student Data & Enrollment Architecture | [06](06-data-architecture.md) |
| 9 | Teacher Workflow | [02](02-roles-and-workflow.md), [09](09-ux-architecture.md) |
| 10 | Registrar Workflow | [02](02-roles-and-workflow.md), [04](04-functional-requirements.md) M10 |
| 11 | Administrator Workflow | [04](04-functional-requirements.md) M1, M12 |
| 12 | Student Portal Architecture | [13](13-student-portal.md) |
| 13 | Student Portal MVP | [13](13-student-portal.md) |
| 14 | Student Portal Future Roadmap | [13](13-student-portal.md) |
| 15 | Grade Engine | [04](04-functional-requirements.md) M6 |
| 16 | Attendance | [04](04-functional-requirements.md) M7 |
| 17 | Submission / Approval / Publication | [02](02-roles-and-workflow.md) |
| 18 | Academic History | [06](06-data-architecture.md) Part 22, [13](13-student-portal.md) |
| 19 | SF1–SF10 Gap Analysis | [05](05-school-forms-strategy.md) — Part 19 section |
| 20 | Document Generation | [11](11-document-engine.md) |
| 21 | Excel Migration | [10](10-excel-migration.md) |
| 22 | Security | [08](08-security-and-privacy.md) |
| 23 | Audit Logging | [04](04-functional-requirements.md) M14 |
| 24 | Notifications | [04](04-functional-requirements.md) M13 |
| 25 | Multi-School Architecture | [07](07-system-architecture.md), [14](14-school-configuration-matrix.md) |
| 26 | UX / Information Architecture | [09](09-ux-architecture.md) |
| 27 | MVP | [12](12-mvp-and-roadmap.md) |
| 28 | Future Roadmap | [12](12-mvp-and-roadmap.md) |
| 29 | School Onboarding | [15](15-onboarding-and-discovery.md) |
| 30 | Discovery Questionnaire | [15](15-onboarding-and-discovery.md) — 102 questions |
| 31 | Commercial Product Strategy | [16](16-commercialization.md) |
| 32 | Demo Workflow | [17](17-demo-scenario.md) |
| 33 | Technical Implementation Roadmap | [12](12-mvp-and-roadmap.md) — M0–M7 |
| 34 | Risks | [18](18-risks.md) |
| 35 | Final Recommendation | [19](19-strategic-answer.md) |
| 39 | The Ten-Schools Question | [19](19-strategic-answer.md) |
| 43 | Final Product Definition | [19](19-strategic-answer.md) |

---

## How to read this set

**20 minutes** → [00 Executive Summary](00-executive-summary.md), then [12 MVP & Roadmap](12-mvp-and-roadmap.md).

**Talking to a school this week** → [15 Onboarding & Discovery](15-onboarding-and-discovery.md) and [20 Assumptions Register](20-assumptions-register.md). Print both.

**Demoing to a prospect** → [28 Principal Demo Checklist](28-principal-demo-checklist.md) to run from, [27](27-phase-2-demo-readiness.md) for the full script. [17 Demo Scenario](17-demo-scenario.md) is the original planning-phase scenario.

**Catching up on where things are** → [29 Where the Project Stands](29-project-progress.md). One page.

**About to write code** → [03](03-existing-system-assessment.md) → [06](06-data-architecture.md) → [07](07-system-architecture.md) → [08](08-security-and-privacy.md) → [12](12-mvp-and-roadmap.md).

**Deciding whether to fund it** → [00](00-executive-summary.md), [16](16-commercialization.md), [18](18-risks.md), [19](19-strategic-answer.md).

---

## Confidence markers

We do not yet hold any school's official form templates or written policies. Claims are marked:

| Marker | Meaning |
|---|---|
| **Confirmed** | Verifiable from public DepEd issuances or directly from the V0 codebase |
| **Likely** | Standard practice across Philippine schools; unverified for a specific school |
| **School-specific** | Genuinely varies; must be configuration, never hard-coded |
| **Requires validation** | An assumption made to keep moving; confirm before commercial deployment |

Every *Requires validation* item also appears in **[20 Assumptions Register](20-assumptions-register.md)** — the checklist for the first discovery meeting.

⚖️ marks legal, privacy, and procurement observations. These are **not legal advice**; they identify where professional counsel is needed.

---

## Decisions already locked

1. **V1 rebuilds the application** and ports the valuable logic from V0 (transmutation table, LOA bands, SF layouts, Excel structures). V0's persistence, identity model, and tenancy are not salvageable.
2. **Initial market is DepEd public schools** (JHS/SHS) — shared standards mean maximum reuse per deployment.
3. **One multi-tenant platform**, not a deployment per school.
4. **Team assumption: 1–2 developers.** Milestones are sized on that basis and note how they rescale.

## The two dates that anchor everything

| Date | Why it matters |
|---|---|
| **4 January 2027** | Term 3 opens — the realistic **pilot window**. A school cannot switch grading systems mid-term. |
| **~June 2027** | SY 2027–2028 opens and DepEd replaces transmutation with **zero-based grading**. Every Excel template in every school breaks at once. The **full-deployment window** and the strongest commercial opening available. |

---

## Source references

- **DepEd Order No. 009, s. 2026** — Three-Term School Calendar. SY 2026–2027 runs 8 June 2026 – 8 April 2027, 201 class days.
- **DepEd Order No. 015, s. 2026** — Revised Guidelines on Classroom Assessment, Grading System, and Awards and Recognition (K to 12).
- **DepEd Order No. 011, s. 2018** — School forms (SF1–SF10) guidelines.
- **Republic Act No. 10173** — Data Privacy Act of 2012.

Specific figures are cited inline where used. ⚖️ Primary issuances should be read directly before implementation — not summaries.
