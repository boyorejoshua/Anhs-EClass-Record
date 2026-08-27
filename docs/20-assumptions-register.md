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
| F20 | **The three-term TRANSMUTATION TABLE.** Seeded from the named range `NewTransmu` in the school's `EClassRecordEditableEPPandTLE.xlsx` | **Every grade in every three-term class.** Passing needs an initial grade of 70, where the four-quarter table needed 60 | 🟨 **Not official.** The workbook says "(Waiting for the Official DepEd Order)" and DO 009 s.2026 states a separate issuance on the grading system will follow. Supersede — do not edit — when it lands |
| F21 | **The three-term DESCRIPTORS** — Emerging / Developing / Connecting / Benchmarking / Advancing | Every report card and LOA descriptor column | 🟨 Same source, same caveat as F20 |
| F22 | **Final grade = `ROUND(AVERAGE(T1,T2,T3), 0)`**, remark PASSED at ≥ 75 | Promotion and the SF10 | 🟨 From the workbook's SUMMARY sheet. Equal weighting across the three terms is an assumption the order may change |
| F23 | **DO 015 s.2026 component weights CONFIRMED** — 20/50/30 core, 20/60/20 EPP-TLE | — | ✅ The workbook's `Helper` sheet matches what was implemented. Independent corroboration from a real artifact |
| F24 | **The three-term class record carries NO learner identifier** — no LRN, no student number, only a name and a row position | Import matching cannot use a stable key | 🟨 Confirmed by inspection. Import must fall back on name matching with a human confirm step; see `three-term-import-mapping.md` §4 |

> **F20–F24 are the highest-stakes rows in this register.** F20 in
> particular changes what a passing grade is. It was seeded because the
> alternative — continuing to transmute three-term work with the
> four-quarter table — is knowably wrong, and because the schema makes
> superseding it a data operation rather than a migration. But it is the
> school's anticipation of an order DepEd had not issued. **Confirm it
> before any grade is released to a learner.**
>
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

---

## Closed by the official DepEd Electronic Class Record (26 Aug 2026)

The department published the three-term Electronic Class Record on the
Learning Standards guide site. It settles the items that were open
pending its issuance.

| Ref | Was | Now |
|---|---|---|
| F20 | Three-term transmutation table unconfirmed; using the school's anticipation | **CLOSED.** `HELPER!B8:D48` of both official workbooks, transcribed in migration 0027 and `app/src/lib/grading/official-three-term.ts`. It differs from the school's version everywhere below the pass line. |
| F21 | Descriptor bands unconfirmed | **CLOSED.** Five bands, exactly as already implemented, plus the department's own wording for each. |
| F22 | Whether passing needs an initial grade of 60 or 70 | **CLOSED — 70.** Confirmed by the official table. |
| F23 | Per-subject weights unconfirmed | **CLOSED.** 20/50/30 core, 20/60/20 for EPP-TLE and MAPEH; exams split 30/30/40. GMRC/VE is grouped with the core subjects, and MAPEH appears as four separate subjects. |
| F24 | Whether the school's layout would match the official one | **CLOSED — it does not.** Different sheet names, a vertical detail block, a side-by-side roster and a six-column exams tail. Both are read; see `three-term-import-mapping.md` §13. |

⚠️ Still open, and still a question for the division office: whether a
school already part-way through Term 1 on the anticipated template
should re-enter its marks on the official one, or carry on. The importer
reads both, so the system does not force the answer.

---

## Closed: class and section creation had no UI at all (26 Aug 2026)

Flagged directly by the user against the live site, comparing it to the
legacy Setup screen: a teacher had no way to add their own class or
students without either seed data or an import happening to name one.

Investigation showed the gap was bigger than "teacher self-serve":
**nobody** — not a teacher, not the registrar — had a working screen to
create a class or a section. `classes.assign` existed on the registrar
and admin roles since the permission catalogue was first seeded, but no
screen ever called it.

**Decision, asked directly of the user:** should a teacher be able to
self-create a class, matching the legacy system's ease of use? Answer:
**registrar/admin only**, to keep one authority over official section
lists and match the model every other part of the system already
assumes (student admission, grade approval, document issuance are all
registrar acts).

Closed by migration 0029 and the **Classes & Sections** screen. Scope
is deliberately narrow: it creates a section (grade level + name +
adviser) and a class (section + subject + teacher) against grade
levels, subjects and teacher accounts that **already exist**. Creating
those — the school's curriculum and its user accounts — is a one-time
onboarding step, not a per-term operational task, and remains a
separate, larger, tracked gap (`13-onboarding-and-discovery.md`; see
also the `years`/`users` items still marked `planned` in `nav.ts`).

⚠️ Found in passing: a duplicate, entirely unreferenced `Grade 9`
grade-level row existed in the live ANHS data (code `G9P`). Flagged to
the user rather than deleted unilaterally, since it was production
data; deleted on the user's explicit instruction once flagged. Confirmed
by re-querying `grade_levels` afterward: exactly one `Grade 9` row
remains (`G9`).

---

## Closed: adviser had no way to see grades across subjects (27 Aug 2026)

Legacy-screenshot gap report against the live site: the adviser's
Incoming Grades screen only ever shows chain-of-custody status, never
marks, by design — receiving a submission is acknowledging a hand-off,
not reviewing it. But that left the adviser with no answer at all to
"has everyone in my section actually filed a grade, and what did they
file" — the legacy Record Book's whole-class summary view had no
successor. Closed by migration 0030 (`app.class_enrollment_advised_by_me`,
a `period_grades` read policy scoped to an adviser's own advised
sections, `rds.my_advisory_sections`, `rds.consolidated_grades`) and the
**Consolidated Grades** screen (`nav.ts` `consolidated`, previously
`planned`).

⚠️ Disclosed for the record: building and verifying this migration
against the live database produced two real incidents, both caught and
corrected before merge, neither shipped to production:

1. **A live-data leak from a verification script.** A test script nested
   `begin;...commit;` blocks inside an outer `begin;...rollback;`
   wrapper. Postgres treats a nested `BEGIN` as a no-op but a `COMMIT`
   always commits the real outer transaction — so the first inner
   `commit;` permanently wrote a test `period_grades` row (grade 89, a
   real class_enrollment) to production before the trailing `rollback;`
   ran, which by then had nothing left to undo. Caught when a later
   verification attempt hit a duplicate-key error on the same insert.
   Fixed by deleting the leaked row and confirming zero remain. A full
   audit of other tables touched earlier in the session (`students`,
   `assessments`, `assessment_scores`, `class_enrollments`,
   `grade_submissions`, `import_batches`, `classes`) found no other
   leaks — those tests had used a single top-level transaction with no
   nested commits. Going forward, live-DB verification uses exactly one
   top-level `begin; ... rollback;` with no nested `begin`/`commit`
   pairs inside it.

2. **`rds.consolidated_grades` was silently wrong, not broken.** The
   first version had no `security definer` clause, so it ran as
   SECURITY INVOKER by default — its internal joins to
   `class_enrollments`/`classes` were subject to the CALLING adviser's
   own RLS grants. An adviser who does not personally teach a given
   subject in their own advised section has no RLS grant to read that
   class's `class_enrollments`, so the function returned an empty grade
   for that column for every learner — no error, a plausible-looking
   blank that reads as "not filed yet" rather than "broken". Only caught
   because the live verification specifically tested the cross-teacher
   case (an adviser reading a subject someone else teaches), not just an
   adviser who happens to teach everything in their own section. Fixed
   by rewriting the function as `language plpgsql`, `security definer`,
   with an explicit authorization check before running the full-visibility
   query — the same pattern `create_class`/`create_section` already use
   for controlled writes, now used for a controlled read.

---

## Closed: nobody could create an account (27 Aug 2026)

Flagged directly against the live site while planning a school demo:
*"lets say its a new user, how they can register and make some edit? …
the app that we have is a demo users only."* True, and it was the gap
between a demo and a deployment — every login in the system was seeded
by `supabase/seed.sql`. No way to add a teacher, change a role, reset a
forgotten password, or correct the spelling of your own name on records
you sign.

**Decision: there is no public sign-up, and there should not be.** Every
account belongs to exactly one school, and the tenant lives in the auth
identity's `app_metadata` where no client can write it (migration 0015).
A self-serve form would have to let the registrant name their own school
— making anyone who has the URL a teacher at that school, with read
access to every learner's grades. For a system holding minors' records
under RA 10173 that is a disclosure, not a rough edge. So:

1. **Mendtrix provisions the school and its first administrator.** Once
   per school, at implementation time — the act the implementation fee
   in `14-commercialization.md` already pays for.
2. **The administrator creates everyone else** from the new Users screen.
3. **Everyone maintains their own details** from My Account.

Closed by migration 0031, the `manage-users` Edge Function, and the
`Users` / `MyAccount` screens (`nav.ts` `users` moves from `planned` to
`ready`; a new `account` route is on every role's menu).

**Temporary passwords rather than emailed invites.** Supabase's invite
flow needs SMTP configured and needs every teacher to have working email
they actually read; a DepEd public school reliably has neither. An
administrator sets a temporary password and hands it over directly. The
cost is that two people briefly know it, so `users.must_change_password`
makes the handover one-time — the app blocks on a password change rather
than showing a banner, because a grade submitted under a shared password
is attributable to two people, which is a chain-of-custody problem.

⚠️ **Not verified end to end.** The SQL half of 0031 was verified against
the live database (12 authorization checks: cross-tenant refusal,
self-lockout refusal, self-promotion refusal, unknown-status refusal),
and a rolled-back transaction confirmed that the exact rows the Edge
Function writes do resolve into a working session with the right
inherited permissions. But this session's network policy blocks outbound
HTTPS to `*.supabase.co`, so **the `manage-users` Edge Function itself
was never exercised over HTTP** — the GoTrue admin calls
(`createUser`, `updateUserById`, `deleteUser`) are unproven against the
live project. The fixture path is fully covered by `e2e/accounts.mjs`
(28 checks), which is a test of the screens, not of GoTrue. Somebody
should create one account against production and delete it before the
school demo.

⚠️ **Also still open: the demo accounts are live and their password is in
the repository.** `VERCEL.md` publishes `MendtrixDemo2026!` for seven
`.test` accounts on a publicly reachable URL. That is correct while the
project holds only seeded data and is exactly wrong the moment it holds
a real learner record. Rotating or deleting them is a prerequisite for
the school demo, not a follow-up.

---

## Reversed: class creation is no longer registrar-only (27 Aug 2026)

Asked for three separate times against the live site. The third time
settled it, and the earlier answer was wrong — but only half wrong, and
the half matters.

**The 26 Aug decision** (migration 0029, recorded above) was
registrar/admin only. Two questions got answered as one:

- *Data integrity* — will teachers typing section names produce
  "PEARL", "Pearl" and "pearl" as three Grade 7 sections?
- *Authority* — whose act is it to say a class exists?

The integrity answer was already handled and never depended on the
permission: `create_section` lower-cases and compares before inserting,
and `sections` carries a unique key on
`(academic_year_id, grade_level_id, name)`. Gating the act behind the
registrar was not what prevented the duplicate.

On authority, the reversal: on a DepEd class record the subject teacher
IS the authority for their own class — they sign it. Making them wait
for a registrar before entering a single mark is precisely the friction
that keeps a school on Excel.

Closed by migration 0032 (`classes.create.own`, granted to teacher and
adviser; `rds.my_class_setup_options`; `public.create_my_class`) and a
**+ Add class** button on My Classes.

**Where the boundary moved to.** `create_my_class` forces
`primary_teacher_id` to the caller — it is not a parameter — so a
teacher cannot create a class for anybody else. They still cannot:
appoint a section's **adviser** (that carries the right to read every
subject's grades for the section, migration 0030, and stays the
registrar's appointment); create a **subject** or **grade level** (the
school's curriculum, where a near-miss like "Math 10" next to
"Mathematics 10" cannot be deduped by lower-casing); or **admit a
learner** (enrolment stays registrar work — the roster fills from the
section's existing enrolment).

Verified against the live database in one rolled-back transaction (11
checks): a typed "sampaguita" resolved onto the existing "Sampaguita"
with no new section; a new section came out with a null adviser; an
invented subject, a cross-tenant year and a colleague's existing class
were all refused with sentences. `e2e/teacher-add-class.mjs` (19 checks)
re-proves the capitalisation case through the UI, since that is the
defect the old gate was justified by.

---

## Fixed in passing: Student Detail showed one period's marks under another's heading (27 Aug 2026)

Found while building the legacy Student Detail picker (Phase 2), not
reported by anyone — which is the point worth recording.

`ClassWorkspace` held the drilled-into learner as a `SummaryRow`
**snapshot**, taken from whichever period's gradebook was loaded at the
moment their name was clicked. A comment on the state declared it was
"cleared whenever the tab or the period changes". Only the tab buttons
cleared it; the period buttons called `onPeriodChange` directly. So
opening a learner in Term 1 and then clicking Term 2 rendered Term 1's
initial grade, period grade, descriptor, missing-score count and full
component breakdown under a heading that read "Term 2" — with no error,
no blank, and nothing to notice.

Fixed by holding the **class-enrolment id** instead and re-deriving the
row from the currently loaded gradebook on every render. That works
precisely because a `class_enrollment` identifies an enrolment rather
than a name or a period — the same property that lets a learner be
renamed without orphaning their marks. A learner absent from the new
period's roster now resolves to null and falls back to Summary, rather
than rendering a detail screen for somebody not in the class.

`e2e/student-detail.mjs` check 4c is the regression test: it reads the
stat row before and after a period switch and fails if the numbers do
not move.

⚠️ **A5 surfaced again.** The new year strip shows a FINAL tile, and
the only rule available for it is assumption A5 — *the final grade is
the simple mean of the period grades* — which is still unconfirmed with
the school. The strip therefore labels a partial mean rather than
presenting it as final: with two of three terms graded it reads
"Final (2 of 3)" and prints "Provisional — the mean of the 2 periods
graded so far, not the final grade." **Confirm A5 before any final
grade is issued on a document.**

---

## ⚠️ Shipped a dead end, then closed it: a teacher-made class had no way to get learners (27 Aug 2026)

Reported by the user for the fourth time — *"there's no way how to add
an student"* — and this time they were describing a defect I had
introduced the same day, not the standing design decision I kept
answering with.

**What went wrong.** Migration 0032 let a teacher create their own
class, including in a section they name themselves. The roster is
filled by `sync_class_roster`, which copies from `enrollments` matching
the section. A section invented thirty seconds ago has no enrolments.
So the feature's happy path was: create a class, land in an empty
gradebook, and find nothing anywhere that could put a learner in it.

**Why the tests missed it.** Every check in `e2e/teacher-add-class.mjs`
and every check in the live-database verification created a class in a
SEEDED section that already had learners. The one state the feature
actually produces for a new user — an empty section — was the one state
never exercised. The fixtures made this worse rather than catching it:
`createMyClass` handed every new class the shared 20-learner roster, so
the fixture could not represent an empty class at all.

**Closed by migration 0033** — `students.write.own_classes` on teacher
and adviser, `rds.my_class_roster`, `add_learner_to_my_class`,
`remove_learner_from_my_class` — and a roster editor on the class
Students tab.

**What it does not reopen.** V0's defining defect was a student OWNED by
a class (`students.class_id`), keyed by name. The three tables stay
three tables. Adding a learner writes a `class_enrollments` row; it
reaches `students` only when nobody by that name is on file, and reuses
the existing year `enrollment` when there is one — verified live: the
same learner in two subjects is one person, one year enrolment, two
class enrolments. Removing writes to `class_enrollments` alone, and is
refused outright once any score exists, because the delete would
cascade the marks with it.

**The duplicate guard.** A typed name that matches an active learner is
refused and the match is named, unless the teacher confirms it really
is a different child — two learners genuinely can share a name. Matching
is case- and whitespace-insensitive, so "dela cruz" and "Dela  Cruz" are
one child.

⚠️ **Provisional learners now exist in the data.** A learner a teacher
types has NO LRN. `students.lrn` has been nullable since 0005
("learners arrive without one"), so this is an anticipated state rather
than a hack — but an LRN is what the division office reconciles on. The
roster marks them "Needs LRN" and the registrar has to complete the
record. **A school going live should agree who watches that queue.**

⚠️ **Two of the fixtures were lying, and both are now fixed.** Beyond
the empty-class problem, `getMyClassRoster` reported `hasScores: true`
for everyone, which hid the Remove button on precisely the class the
feature exists for. Both were caught only by writing the e2e test
against the real workflow rather than against the seeded happy path.

---

## Closed: Analytics reached parity with the legacy screen (27 Aug 2026)

The bar chart and its bands already matched. What did not was everything
that names PEOPLE rather than counting them — and that is the half a
teacher actually acts on. A bar saying seven learners sit in 86–90 is
not actionable until you know which seven.

Added: **Students per performance band** (each band's learners with
their grades), **Students with missing grades** (by name), a
**Pass / Fail** panel with rates and Top(90+)/Missing tiles, a
**Graded x/y** tile, and a separate **Missing** row on the bands chart.

**Missing is deliberately its own row, not folded into "Below 75".** A
learner with no computable grade is not a low score, and merging the two
would report a teacher's unfinished marking as a cohort of failing
children. For the same reason the pass rate is a share of GRADED
learners, not of the class — otherwise a half-marked term reads as a
collapsing pass rate.

⚠️ **A fixture was hiding this feature rather than testing it.**
`buildScores` gave every learner a score in every period, so `ungraded`
was permanently 0 and the entire missing-grades half of Analytics never
rendered — not because it was broken, but because the demo data could
not produce the state it exists for. One learner now has nothing scored
in Term 2, which is what a late transfer-in looks like in any real
class. This is the fourth fixture found lying this way; the pattern is
always the same, a fixture generous enough to make an empty or partial
state unreachable.

---

## Closed: a teacher can correct a learner's spelling (27 Aug 2026)

Asked for alongside the legacy Student List screenshot. Migration 0034
adds `app.learner_in_my_classes` and `correct_learner_name`, and the
roster row gets an inline **Edit name**.

**Why this is safe here and was not in V0.** There the NAME WAS THE KEY
(`grades[term][studentName]`), so correcting a spelling did not rename a
learner — it created a new one and orphaned every mark filed under the
old spelling. Here identity is a uuid and scores hang off the
class-enrolment id, so a rename changes a display string and nothing
else.

**Scope: name parts only** — first, middle, last, suffix. Never the LRN,
sex, birth date, status or enrolment; the function takes no parameter
for any of them, so it is not a rule it enforces but a request it cannot
express. Only for a learner in a class the caller teaches, never the
school directory. Renaming onto another learner's name is refused and
the match named, unless confirmed. Every rename is audited with the
PREVIOUS name, because the question a registrar asks later is not what a
learner is called but what they were called before.

The roster editor now also appears on the **Setup** tab, under the score
configuration, because that is where the legacy put the Student List and
where the user went looking: *"even on setup page, there's no way a
teacher can add its students"*. Same component as the Students tab, so
the two cannot drift.

⚠️ **The sign-in password reveal toggle is not covered by an automated
test.** Demo mode signs in from fixtures and never renders the sign-in
screen, so there is no way to drive it from the e2e suite; the check
skips itself honestly rather than passing vacuously. It is covered by
typecheck and build only. **Worth one manual look on the deployed site.**
