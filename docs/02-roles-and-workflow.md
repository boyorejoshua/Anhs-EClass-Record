# 02 — User Roles (RBAC) & End-to-End School Workflow

*Covers Parts 9, 10, 11 and 17 of the audit brief.*

---

## PART 4 — User Roles & Access Control

### The design principle

Roles are **data, not code**. A school enables the roles it uses, renames them to match its own vocabulary, and adjusts what each can do — without a developer.

Three concepts are kept deliberately separate, because conflating them is the mistake that makes RBAC systems rigid:

| Concept | Question it answers | Example |
|---|---|---|
| **Permission** | *What action is this?* | `grades.approve` |
| **Role** | *Which bundle of actions?* | Registrar = { `grades.approve`, `students.read.all`, … } |
| **Scope** | *Over which records?* | This teacher's 6 assigned classes; this adviser's 1 section |

V0 fails on all three: roles are a `text` column with four fixed values (`supabase_schema.sql:21`), permissions are navigation-only (`buildNav()`, `main.js:224`), and any user can call `switchRole()` to change their own role at will (`main.js:216`). Scope does not exist as a concept.

### Scope is derived, not assigned

This is the most important design decision in the RBAC model.

A teacher's data access does **not** come from their role. It comes from their **assignments**: the classes they teach and the section they advise. The role says *"may encode grades"*; the assignment says *"for these classes."* Change a teaching load, and access follows automatically with no permission editing.

```
Permission:  grades.encode          ← from role
Scope:       class_assignments      ← from actual teaching load
Effective:   may encode grades for exactly the classes assigned to them
```

The same pattern serves department heads (scope = subject department), advisers (scope = one section), and grade-level coordinators (scope = one grade level). One mechanism, many roles.

### The role catalogue

Each school enables a subset. **No school is expected to use all of these.**

#### Super Admin — Mendtrix internal

Platform operator, not a school user.

- Provision and configure new school tenants
- Access platform-wide health, usage, and error monitoring
- Execute schema migrations and releases
- Impersonate a school user **only** via an explicit, time-limited, audited support session

> **Critical control.** Super Admin must be a *platform* role that does not implicitly carry read access to any school's learner data. Support access is granted per incident, is time-boxed, and writes a prominent audit entry visible to the school's own administrator. A Mendtrix employee browsing learner records because they technically can is a privacy incident. See [08 Security & Privacy](08-security-and-privacy.md).

#### School Administrator

Highest authority *within* one school tenant.

- School profile, logo, letterhead, signatories
- Academic years and period structure
- Grade levels, sections, subjects, subject categories
- User accounts, role assignments, deactivation
- Grading schemes and transmutation tables
- Document templates and report layouts
- Class and subject assignments to teachers
- School-wide dashboards; all reports
- Audit log access

Cannot: cross into another school (structurally impossible), or delete academic history (only void with reason).

#### Registrar

Owner of the official academic record. The heaviest user of the system and, commercially, its champion.

- Student master records — create, update, merge duplicates
- Enrollment records and enrollment history
- Review, approve, return, and finalize grade submissions
- Publish grades to the student portal
- Generate, number, issue, and reprint all official documents
- Full academic history across all school years
- Manage learner transfers in and out
- Audit log access for academic records

#### Registrar Staff

Same surface, reduced authority — the distinction is **approval**.

- Everything the Registrar can *view*
- Data entry and correction on student and enrollment records
- **Cannot** approve submissions, publish grades, or issue numbered official documents
- May prepare a document as a draft for Registrar issuance

#### Principal / School Head

Oversight and, where school policy requires, final approval.

- School-wide dashboards: submission status, completion rates, at-risk indicators
- All reports, read-only
- Approval step on documents requiring the head's signature
- Cannot encode grades or edit records

> **School-specific.** Whether the School Head is a required approver in the grade workflow or purely an observer varies by school. Model it as an **optional, configurable approval stage**, off by default.

#### Department Head / Academic Coordinator

- Monitor submission status for teachers in their department
- View grades and analytics for their department's subjects
- Comment on or return submissions within their scope
- Cannot approve for release to the registrar (unless the school enables it)

Scope = subject department. **School-specific:** many schools have no such role; some route submissions through it mandatorily.

#### Teacher (Subject Teacher)

The volume user. Every design decision about this role is an adoption decision.

- View assigned classes and rosters
- Configure assessments and highest-possible-scores per class per period
- Encode scores; save drafts; autosave
- Record attendance for their classes
- View computed grades and class analytics
- Submit grades for a class + period
- See submission status and registrar feedback
- Correct and resubmit returned submissions
- Print their own working records
- **Cannot** see other teachers' classes, other sections, or any learner not enrolled in their classes

#### Adviser (Class Adviser / Homeroom)

An **additional** capability layered onto a Teacher, not a separate account.

- Everything a Teacher can do for their own subject classes
- Plus, for their advisory section only: view consolidated grades across all subjects, general average, promotion status, section attendance, and learner profiles
- Prepare and print report cards for their section
- Enter adviser remarks and observed values ratings

> This composability matters. In V0, `subject` and `advisory` are mutually exclusive values in one column (`supabase_schema.sql:21`), which is wrong — a real adviser almost always also teaches subjects.

#### Student

- View own profile and current enrollment
- View own **published** grades, by subject and period
- View own general average and academic history across years
- View own attendance, **if the school enables it**
- Download authorized documents where the school permits
- View announcements

Hard boundaries, enforced at the database layer and non-negotiable:

- Never another learner's record, in any view, export, or error message
- Never a draft, submitted, or approved-but-unpublished grade
- Never a teacher's or registrar's working data
- Never rankings that expose other learners' standing

#### Parent / Guardian — Phase 2, not V1

Deferred. Analysed in [12 MVP & Roadmap](12-mvp-and-roadmap.md). The data model reserves the guardian relationship so the portal can be added without migration, but no parent-facing surface ships in V1.

Reasons for deferring: identity verification for guardians is genuinely hard (who is the legal guardian? separated parents? multiple guardians?), it multiplies the support burden at exactly the moment the product is least stable, and consent handling for minors' data introduces legal exposure that should not be taken on in a first release.

### Permission catalogue (initial)

Namespaced `resource.action[.scope]`:

```
school.config.read / school.config.write
users.read / users.write / users.deactivate
roles.assign
students.read.own_classes / students.read.section / students.read.all
students.write / students.merge
enrollments.read / enrollments.write
classes.read.own / classes.read.all / classes.assign
assessments.write
grades.encode / grades.read.own_classes / grades.read.section / grades.read.all
grades.submit / grades.return / grades.approve / grades.publish
grades.reopen / grades.correct
attendance.encode / attendance.read.own / attendance.read.all
documents.generate / documents.issue / documents.reprint / documents.read.own
reports.read.department / reports.read.school
audit.read
imports.execute
```

Two permissions deserve special handling because they are the highest-risk actions in the system: **`grades.publish`** (the privacy gate) and **`grades.reopen`** (mutates a finalized academic record). Both should be limited to a small number of accounts, always audited, and — recommended — require MFA.

### Role/permission matrix (default template)

`●` full · `◐` scoped · `○` none

| Permission group | SchAdmin | Registrar | Reg.Staff | Principal | Dept.Head | Teacher | Adviser | Student |
|---|---|---|---|---|---|---|---|---|
| School config | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Users & roles | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Student records | ● | ● | ● | ◐ read | ○ | ◐ own classes | ◐ +section | ◐ self |
| Enrollments | ● | ● | ● | ◐ read | ○ | ○ | ◐ read | ◐ self |
| Class assignment | ● | ◐ | ○ | ◐ read | ◐ read | ○ | ○ | ○ |
| Assessments | ◐ | ○ | ○ | ○ | ◐ read | ● own | ● own | ○ |
| Encode grades | ○ | ○ | ○ | ○ | ○ | ● own | ● own | ○ |
| Submit grades | ○ | ○ | ○ | ○ | ○ | ● own | ● own | ○ |
| Return submission | ● | ● | ○ | ◐ | ◐ dept | ○ | ○ | ○ |
| Approve grades | ● | ● | ○ | ◐ opt. | ○ | ○ | ○ | ○ |
| **Publish grades** | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| **Reopen finalized** | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| Attendance | ◐ read | ◐ read | ◐ read | ◐ read | ○ | ● own | ● +section | ◐ self, opt. |
| Generate documents | ● | ● | ◐ draft | ◐ | ○ | ◐ own class | ◐ section | ◐ own, opt. |
| Issue numbered docs | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| Audit log | ● | ◐ academic | ○ | ◐ read | ○ | ○ | ○ | ○ |

> This is a **default template**, shipped as seed data per tenant. A school administrator can adjust it. That adjustability is a product requirement, not a nice-to-have — it is what stops the next school needing a code change.

---

## PART 5 — End-to-End School Workflow

### The full chain

```
   ┌─────────────────────────────────────────────────────────────┐
   │  SETUP  (once per school, then once per school year)        │
   └─────────────────────────────────────────────────────────────┘
        School Admin: school profile, logo, signatories
              ↓
        School Admin: create school year + period structure
                      (quarter / semester / trimester / custom)
              ↓
        School Admin: grade levels, sections, subjects
              ↓
        School Admin: grading scheme per subject category
              ↓
        School Admin: user accounts + role assignments

   ┌─────────────────────────────────────────────────────────────┐
   │  ENROLLMENT  (per school year)                              │
   └─────────────────────────────────────────────────────────────┘
        Registrar: create/carry forward student master records
              ↓
        Registrar: enroll student → school year + grade level + section
              ↓  (creates the enrollment record — the year-specific layer)
        Registrar/Admin: assign subjects to sections → creates classes
              ↓
        Admin: assign teacher to each class; assign adviser to section
              ↓
        System: auto-populates each class roster from section enrollment
                ★ teachers never type a student list

   ┌─────────────────────────────────────────────────────────────┐
   │  TEACHING PERIOD  (per grading period, repeating)           │
   └─────────────────────────────────────────────────────────────┘
        Teacher: define assessments + highest possible scores
              ↓
        Teacher: encode raw scores          ⇄  autosave, always resumable
        Teacher: record attendance          ⇄
              ↓
        System: computes PS → WS → Initial Grade → Transmuted Grade
                continuously, from the school's configured scheme
              ↓
        Teacher: reviews class summary, resolves flagged gaps
              ↓
        Teacher: SUBMIT (class + period)
              ↓
        System: validation gate — blocks submission on hard errors

   ┌─────────────────────────────────────────────────────────────┐
   │  REVIEW & APPROVAL                                          │
   └─────────────────────────────────────────────────────────────┘
        System: class+period record locks to further teacher edits
              ↓
        Registrar: sees it in the pending queue with full detail
              ↓
        ┌──── RETURN (with reason) ────→ Teacher corrects → resubmit
        │                                        ↑______________|
        ↓
        Registrar: APPROVE
              ↓
        [optional, school-configurable] Principal: countersign
              ↓
        Registrar: FINALIZE  →  grade becomes part of the official record

   ┌─────────────────────────────────────────────────────────────┐
   │  PUBLICATION & OUTPUT                                       │
   └─────────────────────────────────────────────────────────────┘
        Registrar: PUBLISH  ★ the privacy gate — nothing is visible
                              to students before this action
              ↓
        Student portal: learner sees their own grades
              ↓
        Registrar/Adviser: generate report cards, promotion reports,
                           permanent records — from the same data
              ↓
        System: numbers, stamps, archives every issued document
```

### The state machine

Grade submissions are tracked at **class + grading period** grain — not per class, which is V0's error (`classes.is_submitted`, `supabase_schema.sql:68`) and cannot express "Term 2 submitted, Term 3 in progress."

| State | Teacher can edit | Visible to registrar | Visible to student | Enters via |
|---|---|---|---|---|
| `draft` | ✅ | ○ status only | ○ | Default on class creation |
| `submitted` | ○ | ● full | ○ | Teacher submits |
| `returned` | ✅ | ● with reason | ○ | Registrar returns |
| `approved` | ○ | ● | ○ | Registrar approves |
| `finalized` | ○ | ● | ○ | Registrar finalizes |
| `published` | ○ | ● | ● | Registrar publishes |
| `reopened` | ✅ | ● flagged | ○ hidden again | Registrar reopens (audited) |

**Allowed transitions only:**

```
draft ──submit──→ submitted ──approve──→ approved ──finalize──→ finalized
  ↑                   │                                            │
  │                   └──return──→ returned ──resubmit──→ submitted│
  │                                    │                           │
  └────────────────────────────────────┘                    publish│
                                                                   ↓
reopened ←──reopen (audited, reason required)──────────────  published
   │
   └──resubmit──→ submitted
```

Every transition goes through a server-side function that writes an audit row containing actor, timestamp, from-state, to-state, and reason. A client cannot skip a state.

### Corrections after finalization

The hardest workflow question, and the one most likely to be got wrong.

A finalized grade is an official record. It must be correctable — teachers make mistakes and learners complete deficiencies — but never silently.

**The rule: never overwrite. Always version.**

```
Teacher/Registrar raises a correction request
        ↓  reason required, evidence optional
Registrar reviews
        ↓
Registrar reopens the specific class+period+student  (audited)
        ↓
Correction is entered
        ↓
System writes a NEW grade version; the prior version is retained intact
        ↓
Re-approval and re-finalization
        ↓
If the grade was already published: student sees the corrected value,
   and any previously issued document referencing the old value is
   flagged as superseded
        ↓
Audit log records: who, when, old value, new value, reason, approver
```

> **School-specific / Requires validation.** Whether a correction after the school year closes needs division-office approval, and whether a reissued report card must be marked as amended, is a policy question for each school and possibly for DepEd. Captured in [20 Assumptions Register](20-assumptions-register.md).

### When exactly a grade becomes visible

Stated explicitly because it is the system's central privacy rule:

| Stage | Student sees |
|---|---|
| Teacher drafting | **Nothing** |
| Teacher submitted | **Nothing** |
| Registrar approved | **Nothing** |
| Registrar finalized | **Nothing** |
| **Registrar published** | **The grade** |
| Reopened for correction | Reverts to hidden until republished |

Publication is a deliberate, permissioned, audited act — never a side effect of any other action. The default answer to "should the student see this yet?" is always no.
