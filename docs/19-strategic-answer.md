# 19 — Final Recommendation & The Ten-Schools Question

*Covers Parts 35, 39 and 43 of the audit brief.*

---

## PART 39 — The question

> **If Mendtrix wants to deploy this system to 10 different schools, what decisions must we make now so we do NOT have to rebuild the application 10 different times?**

### The short answer

Ten rebuilds happen for one reason: **school-specific facts get encoded in places only a developer can reach** — in code, in schema, in templates that are edited rather than cloned. Preventing it is not one big decision. It is ten specific ones, and eight of them are cheap now and expensive later.

The single sentence that captures all of it:

> **Every fact that differs between schools must live in a row, not in a line of code — and the architecture must make the shortcut structurally awkward, because discipline alone will not hold.**

That second clause matters as much as the first. V0's `CHEATSHEET.html` §10 documents "change the weighting" and "add a grade level" as *code-edit tasks*. That was a reasonable answer for a prototype. Repeated ten times, it is ten codebases.

---

## The ten decisions

### 1 · Database architecture — one multi-tenant Postgres

**Decide now.** `school_id NOT NULL` on every tenant table, forced RLS, composite foreign keys carrying `school_id`, an isolation test suite that blocks deploys.

*Why now:* retrofitting tenancy is not feasible. Every table, every query, every policy would change.

*The non-obvious argument:* separate databases make per-school customisation *easy*, and easy customisation is what produces ten codebases. A shared schema makes "just add a column for them" structurally awkward. **The constraint is the feature.**

*Escape hatch preserved:* because the schema is shared, one school can move to a dedicated database later with no code fork — priced as a premium tier, built only when someone pays. ([07 System Architecture](07-system-architecture.md))

### 2 · School configuration — the four-tier matrix

**Decide now.** Every school-specific value classified as admin-configurable, implementation-configurable, developer-configurable, or custom. Target ~80% in tier 1.

*Why now:* the classification determines where each value is *stored*, which is a schema decision.

*The governing metric:* track what proportion of new-school requests land in tier 1. Rising tier 3/4 requests mean the configuration model is too narrow — widen it **before** signing more customers. ([14 School Configuration Matrix](14-school-configuration-matrix.md))

### 3 · Academic periods — rows, never a number in code

**Decide now.** `academic_periods` as rows; the school year declares quarter / semester / trimester / custom.

*Why now:* this is V0's most pervasive defect. `term IN (1,2,3)` appears in the schema; `for (t=1; t<=3; t++)` appears in six places in `main.js`. A school on quarters is not a configuration change to V0 — it is a rewrite.

*Test:* two demo tenants, one on trimesters and one on quarters, both producing correct report cards from identical code.

### 4 · Grading engine — configuration, with the formula as data

**Decide now.** Grading schemes as rows. Components as a **tree** so a parent can hold weighted children. Transmutation tables as versioned data. Pass mark, rounding, and aggregation configurable.

*Why now — and this is the decisive evidence in the whole audit:* V0 hard-codes `{ww:0.30, pt:0.50, te:0.20}` at `main.js:289`. DepEd Order 015, s. 2026 sets **20/50/30** for core subjects and **20/60/20** for MAPEH and EPP-TLE, and subdivides Examinations into ST1 30 / ST2 30 / TE 40. **V0 has been non-compliant since June 2026** — not through bad design intent, but because the rules moved and the rules were in the code.

And it will happen again on a known date: **zero-based grading replaces transmutation in SY 2027–2028.** In this architecture that is clearing a table reference. In V0 it is a release.

### 5 · Student identity — a UUID, and a master record

**Decide now.** One permanent `students` row per learner, stable UUID, LRN as a nullable attribute.

*Why now:* V0 keys grades and attendance by uppercased **name**. Renaming a learner orphans their records; two learners sharing a name share one record. Every downstream capability — history, SF10, the student portal — is impossible until this is fixed, and fixing it later means migrating every academic row.

### 6 · Enrollment — the three-layer model

**Decide now.**
`students` (permanent) → `enrollments` (per year) → `class_enrollments` (per subject) → `period_grades` (per period).

*Why now:* V0 owns students by class (`students.class_id`), so one learner in six subjects is six unrelated rows. There is no master record, no history, and no cross-subject consolidation without emailing JSON files — which is literally what V0 does (`main.js:1327`).

*What it unlocks:* academic history, the student portal's history screen, SF10, promotion reporting, and transfer handling. All of it is downstream of this one decision.

### 7 · Roles and permissions — data, composable, with derived scope

**Decide now.** Roles and permissions as rows. Scope derived from **assignments**, not granted by role. A user holds multiple roles.

*Why now:* V0 has `role text CHECK (role IN ('subject','advisory','registrar','admin'))` — mutually exclusive, when a real adviser almost always also teaches subjects. And `switchRole()` lets any user reassign their own role.

*Why it prevents rebuilds:* the next school's org chart differs. If roles are an enum, that is a migration. If they are rows with an editable permission matrix, it is an afternoon of configuration.

### 8 · Document templates — three layers, cloned never edited

**Decide now.** Core data → named data-source contract → school-owned template binding. Templates versioned; a school-specific variant is a **clone**, never an edit of the shared one.

*Why now:* the boundary determines whether SF forms shape the database. If a `sf9_data` table ever exists, the forms have become the model and every school's variant is a schema change.

*Why it prevents rebuilds:* a different SF9 is a new template — 1–3 days of implementation work, and much less from the second DepEd school onward. ([05 School Forms Strategy](05-school-forms-strategy.md), [11 Document Engine](11-document-engine.md))

### 9 · Student portal — built on the same data, isolated in the database

**Decide now.** The portal reads the same rows everyone else does, filtered by two RLS predicates: *is it mine* and *is it published*.

*Why now:* the tempting alternative — a `student_visible_grades` table populated by a sync job — creates a second source of truth and a window where a corrected grade still shows the old value. And putting the isolation in application code means one forgotten `WHERE` clause is a breach.

*Why it prevents rebuilds:* portal visibility rules differ per school (attendance, general average, prior years, downloads). As `school_settings` flags, that is four rows. ([13 Student Portal](13-student-portal.md))

### 10 · Branding and deployment — one build, configuration at runtime

**Decide now.** Subdomain per school resolving to one deployed application. Logo, letterhead, signatories, and a constrained theme as configuration. No per-school build, branch, or deployment pipeline.

*Why now:* a per-school build is ten CI pipelines and ten regression surfaces.

*Where to hold the line:* offer a theme, decline bespoke visual design. A fully custom UI per school is the fastest available route to ten codebases, and it is usually wanted less than it is asked for.

---

## PART 35 — Final recommendation

### Build now

The MVP in [12 MVP & Roadmap](12-mvp-and-roadmap.md), in this order, because each milestone depends on the one before:

1. **Tenancy and isolation** — before any feature. Retrofitting is not possible.
2. **Configurable academic structure** — periods, levels, sections, subjects as rows.
3. **Student master records and enrollment** — the three-layer model, with auto-populated rosters.
4. **The grading engine and the grade grid** — the critical path, and the adoption test.
5. **Submission workflow and registrar portal** — where the Excel problem actually dies.
6. **Student portal and report card** — where the loop closes and the value becomes visible.
7. **Import, audit, hardening** — what makes a real school possible.

### Postpone

SF forms beyond the report card and promotion report · parent portal · email and SMS notifications · certificates and transcripts · historical grade migration · offline mode · advanced analytics · timetabling, payments, library, LMS.

None of these change the MVP's data model, which is the test for whether deferring them is safe. Guardian relationships, the document model, and portal visibility flags all ship in V1 precisely so their features can be added later **without migration**.

### Needs real-school validation

The full list is in [20 Assumptions Register](20-assumptions-register.md). The ones that would change design:

- Exact grading weights and the transmutation table actually in use
- Whether attendance is per-subject, daily, or both
- Whether the School Head is a required approver
- Whether learners may see attendance and prior years
- Whether the school will issue credentials to minors
- Actual connectivity, by location within the school
- **How a public school can lawfully procure this** ⚖️

### Needs official document validation

Field lists, column orders, page dimensions, and print layouts for every SF form the school files; the observed-values rubric on the report card; signatory titles and order; any document numbering mandate; and whether digitally generated forms are accepted by the division office. ⚖️

**None of this blocks development.** It delays *template authoring* by days, not the platform by a day — which is the entire point of the three-layer document architecture.

### What we can safely design without the official templates

Everything except the templates: the complete core data model, every report data-source contract, the template engine itself, numbering, versioning, the PDF pipeline, issuance logging, and archival. Plus generic report card and promotion report templates built from public DepEd layouts, which are good enough to run a pilot.

### Must be validated before commercial deployment ⚖️

The checklist in [08 Security & Privacy](08-security-and-privacy.md): controller/processor roles and a data-processing agreement, NPC registration obligations, consent basis for minors' data, breach-notification runbook, retention policy, DepEd requirements for third-party systems, digital-signature acceptability, data residency, a penetration test, and a tested restore.

Plus the commercial gate: **the procurement answer.** ([16 Commercialization](16-commercialization.md))

---

## PART 43 — The product, defined

> ## Mendtrix School Academic Records & Grading Platform
>
> A centralized online school system where **administrators configure the school**, **registrars manage student academic records**, **teachers encode grades and attendance once**, **the system calculates and consolidates**, **registrars review, approve, finalize and publish**, **the system generates official documents**, and **students securely access their own published records through an online portal.**
>
> ### Encode once → validate → consolidate → approve → publish → access online

Conceptually similar to a university student portal, deliberately scaled and simplified for basic, junior high, and senior high education.

---

## Closing judgment

V0 is a genuine achievement that has been mistaken for a foundation. Its domain knowledge is real — the transmutation table, the LOA bands, the SF layouts, the Excel workbook structure, and an accurate feel for how this school actually works. **Keep all of it.**

Its architecture cannot carry a product, for three reasons that are each individually disqualifying: students keyed by name, students owned by classes, and school identity as a column default. Add to that no working backend at all — `main.js` never calls a single function in `supabase.js`, while the UI displays a green "Supabase Connected" pill that is not true.

The rebuild is therefore not a judgment on the work. It is a recognition that **a proof of concept proved the concept**, and the concept is worth building properly.

Three things decide whether this becomes a product or a series of projects:

1. **Teachers must find it faster than Excel.** The 8-minute keyboard benchmark is a release gate, not an aspiration. Everything else is downstream of adoption.
2. **The tenth deployment must cost less than the first.** That is the configuration matrix, enforced socially as much as technically. When a school asks for something, the default answer is a setting for everyone — not a change for them.
3. **The procurement question must be answered now.** It is one conversation, it is answerable this month, and it determines whether the revenue model works. Do not build for six months and then discover it.

The timing is unusually favourable and will not repeat: **DepEd is forcing a grading change on every school in the segment in June 2027.** Every Excel template in every school breaks on the same day. A configuration-driven platform that absorbs it — while the school does nothing — is the clearest value proposition Mendtrix will get, and it has a date on it.
