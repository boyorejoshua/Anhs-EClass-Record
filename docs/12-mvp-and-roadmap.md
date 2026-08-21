# 12 — MVP Definition & Development Roadmap

*Covers Parts 27, 28 and 33 of the audit brief.*

---

## The MVP test

> **Can a school stop using Excel for grading?**

Not "reduce," not "supplement" — stop. Any feature necessary to pass that test is in the MVP. Any feature not necessary is not, however attractive.

The test is strict on purpose. If a teacher must keep a spreadsheet alongside the system for any part of the term, the school has *added* a system rather than replaced one, and the pilot fails for reasons no feature list will fix later.

---

## PART 15 — MVP Scope

### Assessment of the proposed MVP list

The candidate list in the brief is close to right. Two changes:

#### ➕ ADD: a configurable report card

The brief lists "basic report cards" ambiguously. It must be **in**, and it must be *the school's actual report card*, not a generic table.

Reasoning: the report card is the terminal output of the entire grading workflow. Without it, the school encodes grades in the system and then rebuilds the report card in Excel — meaning the Excel workflow survives, the registrar still consolidates by hand, and the MVP fails its own test. The report card is what converts a data-entry tool into a replacement.

#### ➖ REMOVE: formal SF2 / SF4 attendance forms

Attendance **capture**, monthly summary, and Excel export are in. The formal DepEd attendance forms are not.

Reasoning: correct SF2/SF4 requires school-calendar modelling, holiday and suspension handling, learner-movement tracking, and an expected-days denominator — a larger surface than it appears, and one V0 currently gets wrong (its SF4 divides by days *recorded* rather than days in session). Attendance capture delivers most of the daily value; the formal forms are a well-defined Phase 2 fast-follow.

⚠️ **Timing constraint:** if the pilot school files SF2 monthly, the fast-follow must land **before their first filing deadline after go-live**. This is a schedule commitment, not an aspiration — plan it into Phase 2's first weeks.

### MVP — in scope

| Area | What ships |
|---|---|
| **Tenancy** | Multi-tenant with forced RLS; subdomain per school; isolation test suite |
| **School config** | Profile, logo, signatories, academic year, **configurable period structure**, grade levels, sections, subjects, subject categories, school calendar |
| **Users & roles** | Accounts, the default role template, editable permission matrix, deactivation |
| **Students** | Master records, guardian records, enrollment per year, enrollment history |
| **Classes** | Subject × section × year, teacher assignment, adviser assignment, **auto-populated rosters** |
| **Grading engine** | Configurable schemes, component trees, transmutation-as-data, configurable pass mark and rounding, non-numeric statuses |
| **Record book** | The grade grid — keyboard navigation, paste, bulk entry, autosave, inline validation, live computation |
| **Attendance** | Daily capture, configurable statuses, calendar-aware, monthly summary, Excel export |
| **Workflow** | draft → submitted → returned → approved → finalized → published, with the validation gate |
| **Registrar portal** | Submission queue, missing-submissions report, approve/return/publish, student records, academic history |
| **Student portal** | Published grades, profile, enrollment, subjects, academic history — **mobile-first** |
| **Dashboards** | Role-specific, for teacher, registrar, administrator, principal |
| **Documents** | Configurable report card, promotion report, class record XLSX, class list, grade summaries |
| **Import** | Student roster, teachers, sections, subjects, class assignments |
| **Audit** | The seven minimum events, with a searchable viewer |
| **Notifications** | In-app centre; submission-received and submission-returned events |

### MVP — explicitly out

| Deferred | Why |
|---|---|
| SF1, SF2, SF4, SF6, SF7, SF10 | Phase 2. The report card and promotion report carry the pilot. |
| SF3, SF8 | Out of product scope entirely. |
| Parent portal | Phase 2. Identity verification and consent are genuinely hard. |
| Email notifications | Phase 2. In-app covers the pilot. |
| SMS | Excluded from the product. See [04 Functional Requirements](04-functional-requirements.md) M13. |
| Certificates, transcripts | Phase 2. |
| Historical grade import | Phase 2. Start the pilot from a clean period. |
| Offline mode | Not planned. Resilience instead — see [09 UX Architecture](09-ux-architecture.md). |
| Advanced analytics | Phase 2. |
| Co-teaching, electives | Phase 2. |
| Timetabling, payments, library, LMS | Phase 3 or never. |
| MFA | Phase 2, but **before the second paying customer.** |

---

## The schedule constraint — read this before committing to a date

Two fixed dates govern everything ([README](README.md)):

- **4 January 2027** — Term 3 opens. The only mid-year window to start a pilot, because a school cannot change grading systems mid-term.
- **~June 2027** — SY 2027–2028 opens, bringing DepEd's zero-based grading. Every school's Excel templates break simultaneously. The strongest commercial opening available.

Development starting September 2026 leaves **roughly 17 weeks** to 4 January.

**Honest assessment:** the full MVP above is approximately **23 weeks of work for one developer**, or **15–17 weeks for two working in parallel tracks**.

That produces a clear decision:

| Team | Realistic Term 3 outcome |
|---|---|
| **1 developer** | Full MVP does not make 4 January. Options: (a) limited pilot with a reduced scope, (b) target SY 2027–2028 only. |
| **2 developers** | Full MVP is tight but achievable — with no slack for surprises. |

**Recommendation either way: run a *limited* pilot in Term 3.**

One grade level, 4–6 volunteer teachers, one registrar. Not the whole school. This is better practice regardless of team size:

- Real usage data before the stakes are high
- Problems surface at a scale one person can fix
- The volunteer teachers become internal advocates for the full rollout
- A Term 3 stumble does not jeopardise a whole school's records
- SY 2027–2028 full deployment is then a proven system, not a first outing

The Term 3 pilot is a **rehearsal for June 2027**, which is the real target.

---

## PART 22 — Development Roadmap

Sized for **1–2 developers**. Durations assume two working in parallel where marked; single-developer estimates are roughly 1.5× the range shown.

---

### M0 — Foundation & Tenancy
**Weeks 1–3**

**Objective** — Prove multi-tenant isolation before a single feature is built on top of it.

**Features**
- Project scaffold: Vite + React + TypeScript; Supabase project; CI
- `schools`, `users`, `roles`, `permissions`, `user_roles`, `audit_logs`
- Forced RLS with `current_school_id()`
- Authentication, login, session handling
- Subdomain tenant resolution, cross-checked against the token claim
- Audit-log write trigger
- **The tenant isolation test suite**

**Dependencies** — None. This is the starting point.

**Deliverables** — Deployed skeleton; two seeded synthetic schools; CI running migrations plus isolation tests.

**Acceptance criteria**
- [ ] A user of School A cannot read any School B row via any table, view, or RPC — proven by an automated test per table
- [ ] The isolation suite runs on every migration and blocks the deploy on failure
- [ ] Authentication works; sessions expire and revoke correctly
- [ ] No secret appears anywhere in source control; secret scanning is enforced in CI
- [ ] Every audited action writes an append-only row that no role can modify

> Nothing else starts until this milestone passes. Retrofitting tenant isolation is not feasible.

---

### M1 — Academic Structure & Configuration
**Weeks 4–6**

**Objective** — A school can be configured entirely through the UI, with **no hard-coded periods, levels, or subjects anywhere**.

**Features**
- School profile, logo, letterhead, signatories
- Academic years with `period_structure`
- `academic_periods` as rows — quarter, semester, trimester, custom
- Grade levels, sections, subject categories, subjects, curriculum map
- School calendar with day types
- Attendance status configuration
- Admin console shell and navigation

**Dependencies** — M0.

**Deliverables** — A working admin console; two fully configured synthetic schools with *different* period structures.

**Acceptance criteria**
- [ ] School A configured with 3 trimesters; School B with 4 quarters; **both work with zero code differences**
- [ ] Grade levels are rows — a school offering Grades 7–10 only is a configuration
- [ ] Configuration clones from a prior academic year
- [ ] No hard-coded period count, grade level, or subject exists in the codebase (verified by grep, in review)

---

### M2 — Students, Enrollment & Classes
**Weeks 7–9**

**Objective** — The three time layers work, and rosters populate themselves.

**Features**
- Student master records; guardian records
- Enrollment per academic year; enrollment history; `enrollment_events`
- Class generation from the curriculum map
- Teacher and adviser assignment
- **Automatic roster population**
- Student search and list views
- Roster / teacher / section / subject import (MVP import types)

**Dependencies** — M1.

**Deliverables** — Registrar student-management UI; working importer; a synthetic school with 500 learners across 15 sections.

**Acceptance criteria**
- [ ] A learner has one master record and per-year enrollments
- [ ] Creating a class auto-populates its roster from section enrollment — **a teacher never types a student name**
- [ ] Enrolling the same learner in a second year leaves the first year untouched
- [ ] A 500-row roster import completes with a preview, an error report, and a transactional commit
- [ ] Re-importing the same file creates no duplicates

---

### M3 — Grading Engine & Record Book
**Weeks 10–15** · *the critical path*

**Objective** — Teachers can encode grades faster than in Excel, under a fully configurable formula.

**Features**
- Grading schemes; component trees; weight validation
- Transmutation tables as data; direct-rounding mode
- Descriptor bands; non-numeric statuses
- The shared TypeScript grading module, running in browser and Edge Function
- Assessment definition per class per period
- **The grade grid**: frozen panes, full keyboard model, paste, autosave, inline validation, live computation
- Bulk-entry mode
- Class grade summary
- Teacher dashboard

**Dependencies** — M2.

**Deliverables** — The teacher workspace; the grading engine with a test suite built from V0's known-good outputs.

**Acceptance criteria**
- [ ] DO 015 s.2026 core weights (20/50/30) and MAPEH/TLE (20/60/20) are **configuration rows, not code**
- [ ] The Examinations component tree (ST1 30 / ST2 30 / TE 40) computes correctly
- [ ] Switching a school to zero-based grading requires only clearing the transmutation table reference
- [ ] A component with no scores is **excluded**, not counted as zero
- [ ] Browser and server computations agree, verified by a property test over random inputs
- [ ] **A teacher enters 45 students × 10 assessments using only the keyboard, in under 8 minutes**
- [ ] Pasting a column from Excel works
- [ ] Autosave survives a simulated network drop with no data loss
- [ ] Recomputation after a keystroke completes in under 100 ms

> The 8-minute benchmark is the adoption test. Time a real teacher, not a developer. If it is not met, this milestone is not done — no matter what else works.

---

### M4 — Submission Workflow & Registrar Portal
**Weeks 16–18**

**Objective** — Grades move from teacher to registrar with no file leaving the system.

**Features**
- `grade_submissions` at class × period grain
- The full state machine as server-side RPCs
- Validation gate: hard errors vs. soft warnings
- Registrar dashboard and submission queue
- Approve / return / finalize / publish, individually and in bulk
- Missing-submissions report
- Academic history views
- In-app notifications for submission-received and submission-returned
- Audit viewer

**Dependencies** — M3.

**Deliverables** — The registrar portal; a complete workflow demonstrable end to end.

**Acceptance criteria**
- [ ] Every transition is server-enforced; **a modified client cannot skip a state**
- [ ] Submitted records lock against teacher edits
- [ ] Returning requires a reason, and the teacher sees it
- [ ] The missing-submissions report is accurate against seeded data
- [ ] Every transition writes an audit row with actor, timestamp, and reason
- [ ] Reopening a finalized record is audited and reverts student visibility

---

### M5 — Student Portal & Report Card
**Weeks 19–21**

**Objective** — The loop closes: a learner sees a grade, and the school can print the card.

**Features**
- Student authentication and bulk account provisioning
- Student portal: profile, enrollment, subjects, published grades, academic history — mobile-first
- The publication gate enforced **inside the RLS predicate**
- Document engine: data sources, template binding, HTML → PDF, numbering, storage
- Report card template, configurable
- Promotion report
- Batch generation by section

**Dependencies** — M4.

**Deliverables** — Student portal; working document engine; two report card template variants proving configurability.

**Acceptance criteria**
- [ ] A student sees **only** their own record — proven by an automated test attempting cross-student access
- [ ] Unpublished grades are invisible even to a deliberately malformed direct query
- [ ] Publishing makes grades visible; unpublishing hides them again
- [ ] A report card renders with the school's logo, signatories, and configured periods
- [ ] **Two schools with different period structures both produce correct report cards from the same engine**
- [ ] Batch generation produces 45 report cards as one combined PDF plus individual files
- [ ] A reprint returns the stored original, not a re-render

---

### M6 — Hardening & Pilot Readiness
**Weeks 22–24**

**Objective** — Ready for real learner data and real teachers.

**Features**
- Attendance capture, monthly summary, Excel export
- Excel exports across all MVP views
- Backup and **tested restore**, including per-tenant restore runbook
- Load test of the submission-deadline scenario
- Error handling and empty-state polish
- In-app help, ported from V0's guide
- Teacher training materials
- Demo tenant, seeded and nightly-reset

**Dependencies** — M5.

**Deliverables** — Production environment; pilot school configured; training material; support runbook.

**Acceptance criteria**
- [ ] Restore-from-backup tested and documented
- [ ] Per-tenant restore runbook written and rehearsed
- [ ] Load test passes: 100 concurrent teachers encoding
- [ ] All MVP acceptance criteria from M0–M5 still pass
- [ ] Pilot school's real data imported and verified against their own counts
- [ ] Written data-verification sign-off obtained from the school
- [ ] Support and escalation process documented

---

### M7 — Term 3 Limited Pilot
**January – April 2027**

**Objective** — Prove the system with real teachers, real grades, and real stakes — at a survivable scale.

**Scope** — One grade level, 4–6 volunteer teachers, one registrar, one full grading period end to end.

**Activities** — Teacher training · daily support in week 1 · weekly check-ins · instrumented usage metrics · a structured feedback loop · a full period-close rehearsal including report cards.

**Acceptance criteria**
- [ ] All pilot teachers complete Term 3 encoding **in the system, with no parallel spreadsheet**
- [ ] The registrar completes review, approval, and publication without re-keying a single grade
- [ ] Report cards generate and are accepted by the school as usable
- [ ] No data loss incident
- [ ] No privacy incident
- [ ] Teachers report the system as **faster than or equal to** their previous Excel workflow

> The "no parallel spreadsheet" criterion is the real one. Ask directly, and ask more than once — teachers are polite about this.

---

## PART 16 — Future Roadmap

### Phase 2 — February to May 2027
*Runs alongside the pilot; targets readiness for SY 2027–2028.*

**Priority 1 — required for full deployment**
- Zero-based grading configuration, verified against the SY 2027–2028 issuance
- SF2 and SF4 attendance forms *(schedule against the school's first filing deadline)*
- SF1 school register
- SF5/SF6 promotion reporting at school scale
- SF10 permanent academic record
- Historical grade import for prior years
- Email notifications and deadline reminders
- MFA for Registrar and School Administrator
- Year-rollover tooling

**Priority 2 — deployment efficiency**
- SF7 personnel assignment
- Certificates
- Document issuance log
- Advanced analytics and at-risk identification
- Duplicate-student merge
- Section transfer mid-year
- Co-teaching and electives
- Full tenant data export

**Priority 3 — market expansion**
- Parent portal
- Announcements
- Private-school template pack
- Self-service school onboarding

### Phase 3 — SY 2027–2028 and beyond
*Only with evidence of demand. Each item is a candidate, not a commitment.*

Enrollment and admissions · scheduling and timetabling · native mobile app · LMS integration · learning analytics · school-network / division tier · payments · library · inventory · API for third parties

**Explicitly not planned:** AI grade prediction, blockchain credentials, full ERP. Reasoning in [07 System Architecture](07-system-architecture.md).

---

## Keeping the MVP clean

Three defences against scope creep, which is the most likely cause of missing January:

1. **The MVP test.** Every proposed addition answers: *does a school still use Excel for grading without this?* If no, it is Phase 2.
2. **A parking lot.** Good ideas get written down and scheduled, not built. Being recorded is usually what the requester actually wants.
3. **The pilot is not the product.** Pilot feedback is input to Phase 2 prioritisation, not a queue of mid-pilot changes. Changing the system under teachers during their first term with it is how a pilot fails.
