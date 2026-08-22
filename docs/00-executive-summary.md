# 00 — Executive Summary

*Covers Part 1 of the audit brief. Read this first; everything else is the evidence.*

---

## What was done

A complete audit of the existing **ANHS E-Class Record System** against the goal of turning it into a reusable commercial product, plus a full architecture, workflow, security, and commercialization plan for Version 1.

The audit read every file in the repository. Findings below cite specific lines.

---

## What the product is today

**A single-teacher, single-school, browser-only gradebook with no backend.**

| | |
|---|---|
| **Code** | 4 files, ~2,700 lines. No framework, no build step, no package manager. |
| **Persistence** | `localStorage` + a forced file download every 15 minutes |
| **Backend** | **None.** `main.js` never calls a single function in `supabase.js`. |
| **Auth** | `btoa()` in localStorage — base64 encoding, not hashing |
| **Users** | Teacher and registrar. **No student-facing surface of any kind.** |
| **Multi-school** | Not modeled. School identity is a text column default. |

It is a **real, working prototype** — grade entry, computation, attendance, six SF forms, and Excel export all genuinely function. It is not a mockup. That deserves acknowledgement, and it is why the domain knowledge inside it is worth preserving.

Classified against the options in the brief: it is a **Teacher Gradebook with report-generation features** — not an academic records system, and not a school information system.

## What it needs to become

> A centralized school academic records platform where administrators configure the school, registrars manage academic records, teachers encode once, the system consolidates, registrars approve and publish, documents generate themselves, and **students securely access their own records through an online portal**.

---

## The five findings that determine everything

### 1 · The grading formula is already obsolete

```js
main.js:289    const W = { ww:0.30, pt:0.50, te:0.20 };
```

**DepEd Order 015, s. 2026** — the assessment order accompanying the very DO 009 three-term calendar this app is built around — sets **20/50/30** for core subjects, **20/60/20** for MAPEH and EPP-TLE, and subdivides Examinations into ST1 30 / ST2 30 / TE 40, a two-level structure V0 cannot express at all.

**V0 has been non-compliant since June 2026** — not through poor design, but because the rules moved and the rules were in the code. And it will happen again on a known date: **zero-based grading replaces transmutation in SY 2027–2028.**

*This is the single strongest argument for a configuration-driven engine, and it is also the commercial wedge.*

### 2 · Three structural defects block multi-school reuse

| Defect | Location | Consequence |
|---|---|---|
| Students keyed by **name** | `grades[term][STUDENT_NAME]` | Rename orphans records; duplicate names collide; no cross-year tracking |
| Students **owned by a class** | `supabase_schema.sql:98` | One learner in 6 subjects = 6 unrelated rows. No master record, no history, **SF10 impossible** |
| School identity as a **column default** | `supabase_schema.sql:22-25` | Tenancy not modeled. A second school = a second deployment |

None is fixable in place. Together they are why V1 is a rebuild.

### 3 · There is no backend, and the UI says otherwise

`supabase.js` is entirely dead code — yet it renders a green **"☁ Supabase Connected"** pill (`supabase.js:391-417`). A teacher trusting that indicator and clearing their browser loses a term of grades.

⚠️ **A live Supabase URL and anon key are committed in public git history** (`supabase.js:20-21`). Rotate or retire that project regardless of project timing.

### 4 · The student portal does not exist

V0 has no student login, no student account, no student view. This is the largest functional addition in V1 — and the most privacy-critical, because it is the only surface where a data subject logs in to see their own records.

### 5 · What is genuinely worth keeping

The transmutation table (`main.js:1`), LOA/descriptor bands, six SF form layouts, the DepEd Excel workbook structure (`main.js:1176-1322`), and the grade-grid interaction model. Real domain knowledge, ported rather than rewritten.

---

## Recommended architecture

| Decision | Recommendation |
|---|---|
| **Tenancy** | One multi-tenant Postgres, `school_id` everywhere, **forced RLS**, isolation test suite blocking deploys. Dedicated-database tier available later with no code fork. |
| **Stack** | React + TypeScript SPA (static, CDN) · Supabase (Postgres, Auth, Storage, Edge Functions) · headless Chromium for PDF · SheetJS for Excel |
| **Reads vs writes** | RLS for reads; **every policy-carrying write** (submit, approve, publish, reopen) through server functions a modified client cannot bypass |
| **Grading engine** | One shared TypeScript module run in *both* browser and server — instant preview, authoritative save, no drift |
| **Periods** | Rows, not `term IN (1,2,3)`. Quarter / semester / trimester / custom are data |
| **Forms** | Core data → data-source contract → school-owned template. **SF forms are outputs, never the schema** |
| **Portal isolation** | Two RLS predicates — *is it mine*, *is it published* — enforced in the database, not application code |

Explicitly rejected: microservices, Kubernetes, message brokers, GraphQL, any AI feature, native mobile for V1, offline mode.

---

## MVP and timing

**The MVP test:** *can a school stop using Excel for grading?* Not reduce — stop.

Two changes to the proposed MVP list:

- ➕ **Report card moves IN.** Without it the school rebuilds report cards in Excel, the registrar still consolidates by hand, and the MVP fails its own test.
- ➖ **Formal SF2/SF4 move OUT** to a Phase 2 fast-follow. Attendance capture and summary ship; the forms need school-calendar infrastructure V0 gets wrong today.

### The two dates that govern the plan

| Date | Significance |
|---|---|
| **4 Jan 2027** | Term 3 opens — the only mid-year window to start a pilot |
| **~June 2027** | SY 2027–2028 and **zero-based grading**. Every school's Excel templates break simultaneously. |

**Honest schedule assessment:** starting September 2026 leaves ~17 weeks to January. The full MVP is ~23 weeks for one developer, ~15–17 for two.

→ **Recommendation regardless of team size: run a *limited* pilot in Term 3** — one grade level, 4–6 volunteer teachers. It is a rehearsal for June 2027, which is the real target.

---

## Commercial model

**Hybrid: implementation fee + annual subscription**, banded by learner count.

The implementation fee covers real cost — data cleaning alone is 2–4 days per school. The subscription funds what schools cannot do themselves: absorbing annual DepEd policy changes.

**Don't sell:** *"we put your Excel gradebook online."*
**Do sell:** *"in June 2027 DepEd replaces transmutation and every template in your school stops being correct. For us that's a setting we change for you."*

⚖️ **One unresolved commercial blocker:** how a Philippine public school can lawfully procure recurring SaaS, and from which fund. This is answerable in one conversation and should not wait — it determines whether the revenue model works.

---

## The three things that decide success

1. **Teachers must find it faster than Excel.** The 8-minute keyboard benchmark (45 students × 10 assessments) is a **release gate**, not an aspiration. If teachers keep a parallel spreadsheet, nothing else matters.
2. **The tenth deployment must cost less than the first.** That is the four-tier configuration matrix, enforced socially as much as technically. When a school asks for something, the default answer is *a setting for everyone*, not *a change for them*.
3. **Answer the procurement question now.** One conversation, this month.

---

## Where to go next

| You want | Read |
|---|---|
| The full V0 audit with line references | [03 Existing System Assessment](03-existing-system-assessment.md) |
| What to build and when | [12 MVP & Roadmap](12-mvp-and-roadmap.md) |
| The ten-schools answer | [19 Strategic Answer](19-strategic-answer.md) |
| To talk to a school this week | [15 Onboarding & Discovery](15-onboarding-and-discovery.md) + [20 Assumptions Register](20-assumptions-register.md) |
| To start writing code | [06 Data](06-data-architecture.md) → [07 Architecture](07-system-architecture.md) → [08 Security](08-security-and-privacy.md) |

---

## Closing judgment

**V0 is a proof of concept that proved the concept.** Its domain knowledge is real and should be preserved. Its architecture cannot carry a product — students keyed by name, students owned by classes, school as a column default, and no backend at all.

The rebuild is not a criticism of the work. It is the correct next step after a successful prototype.

The timing is unusually favourable and will not repeat: DepEd is forcing a grading change on every school in the target segment on the same day in June 2027. A configuration-driven platform that absorbs it while the school does nothing is the clearest value proposition Mendtrix will get — and it has a deadline.
