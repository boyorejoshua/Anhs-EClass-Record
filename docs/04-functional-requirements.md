# 04 — Functional Requirements

*Covers Parts 15, 16, 23 and 24 of the audit brief, plus module-level requirements for Parts 9–11.*

Requirements are numbered `FR-<module>-<n>` for traceability. Priority: **M** = MVP, **P2** = Phase 2, **P3** = Phase 3.

---

## M1 — School Configuration

*Part 8 and Part 26. This module is what makes one codebase serve many schools.*

| ID | Requirement | Pri |
|---|---|---|
| FR-CFG-1 | Maintain school profile: name, government school ID, address, region, division, district, contact details, school type, academic levels offered | M |
| FR-CFG-2 | Upload and manage school logo and letterhead assets for document rendering | M |
| FR-CFG-3 | Define signatories by role and name (adviser, registrar, principal), with specimen signature image optional | M |
| FR-CFG-4 | Create academic years with a label, start date, end date, and status (`planning` / `active` / `closed` / `archived`) | M |
| FR-CFG-5 | Declare a **period structure** per academic year: quarter (4), semester (2), trimester (3), or custom (N) | M |
| FR-CFG-6 | Define each academic period: ordinal, display name, start date, end date, expected class days | M |
| FR-CFG-7 | Define grade levels as configurable rows with label, ordinal, and level grouping — **never a hard-coded list** | M |
| FR-CFG-8 | Define sections per grade level per academic year, with capacity and assigned adviser | M |
| FR-CFG-9 | Maintain a subject catalogue: code, title, subject category, applicable grade levels, units/hours | M |
| FR-CFG-10 | Define subject categories (e.g. Core, MAPEH, TLE, SHS Core/Applied/Specialized) — each category maps to a grading scheme | M |
| FR-CFG-11 | Define a school calendar: class days, holidays, suspensions, non-teaching days, per academic year | M |
| FR-CFG-12 | Define attendance status codes with label, symbol, and whether each counts as present, absent, or neutral | M |
| FR-CFG-13 | Configure student portal visibility rules: may students see attendance, prior years, general average, documents | M |
| FR-CFG-14 | Clone a full configuration from the previous academic year as the starting point for a new one | M |
| FR-CFG-15 | Manage document templates and their bindings — see [11 Document Engine](11-document-engine.md) | P2 |

### Configuration tiers

Every configurable thing must be classified into exactly one tier. This classification *is* the multi-school strategy.

| Tier | Who changes it | Examples |
|---|---|---|
| **Admin-configurable** — the goal for almost everything | School administrator, self-service in the UI | School profile, logo, signatories, academic years, periods, grade levels, sections, subjects, grading scheme weights, pass mark, attendance statuses, portal visibility, role permissions |
| **Implementation-configurable** | Mendtrix during onboarding | Document templates and field bindings, transmutation tables, grading scheme *structures*, imported historical data, subdomain and branding |
| **Developer-configurable** | Code change, ships to all tenants | New form *types*, new computation *primitives*, new integrations, new field types on a template |
| **Custom development** | Billable per school; last resort | A genuinely novel workflow or a computation the engine cannot express |

> **Product health metric:** the proportion of new-school requests answered from the first tier. If schools routinely need the third or fourth tier, the configuration model is too narrow and should be widened before taking more customers.

---

## M2 — User & Role Management

| ID | Requirement | Pri |
|---|---|---|
| FR-USR-1 | Create user accounts with email, name, employee ID, and one or more role assignments | M |
| FR-USR-2 | Assign roles scoped to the school tenant; a user may hold multiple roles (e.g. Teacher + Adviser) | M |
| FR-USR-3 | Deactivate users without deleting them — historical authorship must survive | M |
| FR-USR-4 | Bulk-create teacher accounts from an import file | M |
| FR-USR-5 | Bulk-create student portal accounts from enrollment data | M |
| FR-USR-6 | Password reset by administrator and self-service reset by email | M |
| FR-USR-7 | Edit the role/permission matrix per school without a code change | M |
| FR-USR-8 | Optional MFA, enforceable per role — recommended mandatory for Registrar and School Administrator | P2 |
| FR-USR-9 | View a user's active sessions and revoke them | P2 |

---

## M3 — Student Master Records

*Part 9. Three layers, never collapsed.*

### Layer 1 — Permanent identity (survives all years)

| ID | Requirement | Pri |
|---|---|---|
| FR-STU-1 | Stable internal student UUID, never reused, never derived from a name | M |
| FR-STU-2 | LRN as a searchable attribute with uniqueness validation — an attribute, **not** the primary key (learners arrive without one) | M |
| FR-STU-3 | Name stored as separate first / middle / last / suffix fields, with a derived display name | M |
| FR-STU-4 | Date of birth, sex as recorded on official documents, place of birth, mother tongue, ethnicity, religion | M |
| FR-STU-5 | Address fields including barangay, municipality, province | M |
| FR-STU-6 | Contact information: learner's own contact where applicable | M |
| FR-STU-7 | Indigenous Peoples affiliation and learner-with-disability indicators, where the school records them | P2 |
| FR-STU-8 | Merge duplicate student records, preserving all academic history from both | P2 |

> **Note on FR-STU-4.** Sex is recorded because official DepEd forms require it and are separated by it. This is a records-fidelity requirement. The system should store what the official document requires without making it the primary organising key of every screen — V0 partitions nearly every view by `{male:[], female:[]}`, which is a form-layout concern leaking into the whole application.

### Layer 2 — Family and guardian

| ID | Requirement | Pri |
|---|---|---|
| FR-STU-9 | Guardian records: name, relationship, contact number, email, address, occupation | M |
| FR-STU-10 | Multiple guardians per learner, one flagged primary | M |
| FR-STU-11 | Emergency contact, which may differ from the guardian | M |
| FR-STU-12 | Guardian record structured to support a future parent portal login without migration | M (model only) |

### Layer 3 — Enrollment (per academic year)

| ID | Requirement | Pri |
|---|---|---|
| FR-STU-13 | Enrollment record per learner per academic year: grade level, section, date enrolled, status | M |
| FR-STU-14 | Enrollment status: `enrolled`, `transferred_in`, `transferred_out`, `dropped`, `completed`, `promoted`, `retained` | M |
| FR-STU-15 | Full enrollment history queryable across all years without touching prior records | M |
| FR-STU-16 | Transfer-in capture: previous school, date, and documents received | P2 |
| FR-STU-17 | Transfer-out capture: receiving school, date, documents issued | P2 |
| FR-STU-18 | Section transfer mid-year, preserving grades earned in the prior section | P2 |
| FR-STU-19 | Learner document repository: generated report cards, permanent records, certificates | P2 |

---

## M4 — Class & Assignment Management

| ID | Requirement | Pri |
|---|---|---|
| FR-CLS-1 | A **class** = subject × section × academic year, with an assigned teacher | M |
| FR-CLS-2 | Auto-generate classes by applying a grade level's subject set to each of its sections | M |
| FR-CLS-3 | Assign a teacher to each class; reassign with history preserved | M |
| FR-CLS-4 | Assign an adviser to each section | M |
| FR-CLS-5 | **Class rosters populate automatically from section enrollment** — teachers never type a student list | M |
| FR-CLS-6 | Support learners taking a subject outside their section's default set (electives, SHS strands) | P2 |
| FR-CLS-7 | Co-teaching: more than one teacher assigned to a class | P2 |
| FR-CLS-8 | Class schedule / timetable | P3 |

> FR-CLS-5 is the highest-leverage requirement in this document. It removes the single largest source of duplicate data entry in the current workflow and is the most visible "this is better than Excel" moment in a demo.

---

## M5 — Record Book & Grade Encoding

*Parts 10 and 13. The Record Book concept survives; the data silo does not.*

| ID | Requirement | Pri |
|---|---|---|
| FR-REC-1 | Teacher sees only their assigned classes, filterable by academic year and period | M |
| FR-REC-2 | Define assessments per class per period: component, sequence, title, highest possible score, optional date | M |
| FR-REC-3 | **No fixed cap** on assessments per component — V0's limit of 10 is removed | M |
| FR-REC-4 | Spreadsheet-style grid: students as rows, assessments as columns, frozen name column and header | M |
| FR-REC-5 | Full keyboard navigation: arrow keys, Tab, Enter-to-advance, Escape-to-cancel | M |
| FR-REC-6 | Paste a column or block of scores from a spreadsheet | M |
| FR-REC-7 | Bulk entry: one assessment across all students in a single vertical pass | M |
| FR-REC-8 | Autosave on cell blur, with an explicit save state indicator | M |
| FR-REC-9 | Inline validation: score exceeds HPS, negative, non-numeric — flagged at entry, not at submission | M |
| FR-REC-10 | Live computed columns per student: component totals, PS, WS, Initial Grade, Transmuted Grade | M |
| FR-REC-11 | Missing-score highlighting and a "students with gaps" filter | M |
| FR-REC-12 | Per-student remarks field | M |
| FR-REC-13 | Fast switching between grading periods without losing scroll position or context | M |
| FR-REC-14 | Print or export the teacher's own working record | M |
| FR-REC-15 | Class analytics: distribution bands, proficiency levels, highest/lowest, mean | P2 |
| FR-REC-16 | Excused / exempted marking, distinct from a missing score | P2 |

---

## M6 — Grading Engine

*Part 11. Configuration-driven, no hard-coded formula anywhere.*

### The computation chain

```
Raw Score
   ↓  ÷ Highest Possible Score × 100
Percentage Score (PS)
   ↓  × component weight
Weighted Score (WS)
   ↓  Σ across components
Initial Grade (IG)
   ↓  transmutation table  OR  direct rounding (zero-based, SY 2027-28+)
Period Grade
   ↓  aggregation across periods (mean, or weighted per school policy)
Final Subject Grade
   ↓  aggregation across subjects
General Average  →  Promotion status
```

| ID | Requirement | Pri |
|---|---|---|
| FR-GRD-1 | Define grading schemes as data; assign a scheme to a subject category, with per-subject override | M |
| FR-GRD-2 | Components as a **tree**, so a parent component may hold weighted children | M |
| FR-GRD-3 | Weights validated to sum to 100% at each tree level, at save time | M |
| FR-GRD-4 | Transmutation tables as versioned data keyed by school and effective academic year | M |
| FR-GRD-5 | Support **no transmutation** (zero-based / direct rounding) as a scheme option | M |
| FR-GRD-6 | Configurable pass mark per school — not the inlined `>= 75` of V0 | M |
| FR-GRD-7 | Configurable rounding rules (half-up, half-even, truncate) and decimal precision per stage | M |
| FR-GRD-8 | **A component with no scores entered is excluded from the computation, not counted as zero** — corrects a real V0 defect | M |
| FR-GRD-9 | Configurable period-to-final aggregation: simple mean, or weighted per period | M |
| FR-GRD-10 | Descriptor/remark bands as configuration (Outstanding / Very Satisfactory / … / Did Not Meet Expectations) | M |
| FR-GRD-11 | Non-numeric statuses: Incomplete, Dropped, Exempted, Transferred, with defined precedence over numeric values | M |
| FR-GRD-12 | Promotion rules as configuration: general average threshold, all-subjects-passing requirement, remediation handling | P2 |
| FR-GRD-13 | Letter-grade and descriptive-only scales, for schools or key stages that use them | P2 |
| FR-GRD-14 | Recompute-all for a class or a school year after a scheme correction, with an audit entry | P2 |

### Why the component tree matters — worked example

DepEd Order 015, s. 2026, core subject, Grades 4–10:

```
Grading Scheme: "DO 015 s.2026 — Core (G4–10)"
├── Written Works ................ 20%   (N assessments, equal raw-total weighting)
├── Performance Tasks ............ 50%   (N assessments)
└── Examinations ................. 30%
    ├── Summative Test 1 ......... 30%  of Examinations  (=  9% overall)
    ├── Summative Test 2 ......... 30%  of Examinations  (=  9% overall)
    └── Term Examination ......... 40%  of Examinations  (= 12% overall)
```

The MAPEH / EPP-TLE variant is the **same structure** with weights 20 / 60 / 20 — a different config row, not different code. V0 cannot represent this at all: it has a flat `{ww:.30, pt:.50, te:.20}` constant and a single `te` score column.

> **Confirmed** from DO 015, s. 2026: core-subject weights 20/50/30; MAPEH and EPP-TLE 20/60/20; Examinations subdividing 30/30/40. **Requires validation:** the complete weight table for every SHS subject group, and the exact SY 2026–2027 transmutation table, must be read from the official issuance before implementation rather than inferred.

---

## M7 — Attendance

*Part 12.*

| ID | Requirement | Pri |
|---|---|---|
| FR-ATT-1 | Record attendance per student per class per school day | M |
| FR-ATT-2 | Configurable status codes (default: Present, Absent, Late, Excused) | M |
| FR-ATT-3 | Mark-all-present with individual exceptions, as the primary interaction | M |
| FR-ATT-4 | Attendance restricted to valid school days from the school calendar — no marking on holidays | M |
| FR-ATT-5 | Monthly summary per student: days present, absent, late, and **expected days from the calendar** | M |
| FR-ATT-6 | Correct V0's defect: the denominator is *days in session*, never *days recorded* | M |
| FR-ATT-7 | No truncation — full history retrievable for any date range (V0 caps at 20 dates) | M |
| FR-ATT-8 | Section-level attendance for advisers, distinct from per-subject attendance | M |
| FR-ATT-9 | Configurable per school: is attendance taken per subject class, or once daily by the adviser | M |
| FR-ATT-10 | Excel export of any attendance range | M |
| FR-ATT-11 | Formal SF2 (daily attendance) and SF4 (monthly movement) outputs | P2 |
| FR-ATT-12 | Learner movement tracking: transfers in/out and drop-outs feeding SF4 | P2 |
| FR-ATT-13 | Consecutive-absence alerting | P2 |

> **School-specific, requires validation.** FR-ATT-9 is a genuine fork. DepEd's SF2 is a *daily* attendance form owned by the adviser, but many subject teachers also keep per-subject attendance. Which is authoritative, and whether both are needed, must be confirmed per school. Building both and letting configuration choose is the safe answer, but the *default* should match the pilot school.

---

## M8 — Grade Submission & Approval Workflow

*Part 10 and Part 15. State machine detailed in [02 Roles & Workflow](02-roles-and-workflow.md).*

| ID | Requirement | Pri |
|---|---|---|
| FR-SUB-1 | Submission tracked at **class × period** grain | M |
| FR-SUB-2 | States: draft, submitted, returned, approved, finalized, published, reopened | M |
| FR-SUB-3 | Pre-submission validation gate; hard errors block, soft warnings require acknowledgement | M |
| FR-SUB-4 | Submitted records lock against teacher edits | M |
| FR-SUB-5 | Registrar queue: pending, returned, approved, and **missing** submissions | M |
| FR-SUB-6 | Return with a mandatory reason, visible to the teacher | M |
| FR-SUB-7 | Approve, then finalize, then publish as **distinct, separately permissioned** actions | M |
| FR-SUB-8 | Reopen a finalized record with a mandatory reason; fully audited | M |
| FR-SUB-9 | Every transition writes an audit row: actor, timestamp, from-state, to-state, reason | M |
| FR-SUB-10 | Bulk approve a filtered set of submissions | M |
| FR-SUB-11 | Optional Principal countersign stage, configurable per school, off by default | P2 |
| FR-SUB-12 | Configurable submission deadlines per period, driving reminders and overdue flags | P2 |
| FR-SUB-13 | Post-finalization correction request flow, writing a new grade version | P2 |

### Validation gate — the rules

**Hard errors (block submission):**
- A score exceeds its assessment's highest possible score
- A negative or non-numeric score
- An assessment defined with no HPS set
- Component weights that do not sum to 100%

**Soft warnings (acknowledge to proceed):**
- Students with no scores at all in the period
- A component with no assessments defined
- Scores missing for some students on some assessments
- A class average that is a statistical outlier against the teacher's other classes

The distinction matters for adoption: a system that refuses to accept a legitimately incomplete record — a learner who was absent for the term exam — is a system teachers will route around.

---

## M9 — Grade Summary & Analytics

*Part 14. Every view computed centrally from the same data.*

| ID | View | Audience | Pri |
|---|---|---|---|
| FR-SUM-1 | Class summary — all students × periods × final, for one class | Teacher | M |
| FR-SUM-2 | Student summary — all subjects × periods, general average, for one learner | Adviser, Registrar, Student | M |
| FR-SUM-3 | Section summary — all learners × all subjects, with promotion status | Adviser, Registrar | M |
| FR-SUM-4 | Subject summary — one subject across all sections | Dept Head, Registrar | P2 |
| FR-SUM-5 | Grade-level summary | Registrar, Principal | P2 |
| FR-SUM-6 | School-year summary — promotion and proficiency across the school | Principal, Registrar | P2 |
| FR-SUM-7 | Multi-year academic history for one learner | Registrar, Student | M |
| FR-SUM-8 | Distribution and proficiency-band analytics | Teacher, Dept Head | P2 |
| FR-SUM-9 | At-risk learner identification against configurable thresholds | Adviser, Dept Head | P2 |

**All calculations happen server-side and centrally.** V0 re-implements the final-grade average in eight separate places (`main.js:304, 698, 711, 874, 880, 1269, 1340, 1385`); V1 has exactly one implementation, and every view queries it.

---

## M10 — Registrar Portal

*Part 15. The module the buyer cares most about.*

| ID | Requirement | Pri |
|---|---|---|
| FR-REG-1 | Dashboard: submission progress by period, pending count, overdue count, recent activity | M |
| FR-REG-2 | Student master record search by name, LRN, section, grade level, status | M |
| FR-REG-3 | Create, edit, and manage enrollment records | M |
| FR-REG-4 | Submission review queue with filters and inline grade detail | M |
| FR-REG-5 | Approve / return / finalize / publish actions, individually and in bulk | M |
| FR-REG-6 | **Missing submissions report** — which teacher, which class, which period, how overdue | M |
| FR-REG-7 | Generate and print report cards for a learner, a section, or a grade level | M |
| FR-REG-8 | Academic history view for any learner across all years | M |
| FR-REG-9 | Promotion report per section and grade level | M |
| FR-REG-10 | Document issuance log: what was issued, to whom, by whom, when, with what number | P2 |
| FR-REG-11 | Permanent academic record (SF10-equivalent) generation | P2 |
| FR-REG-12 | Certificates: enrollment, good moral, completion | P2 |
| FR-REG-13 | Transfer in/out processing with a document checklist | P2 |
| FR-REG-14 | Bulk Excel export of any registrar view | M |
| FR-REG-15 | Audit log access, filtered to academic records | M |

> **The registrar must never retype a grade.** Every number in every registrar view and every generated document originates from the teacher's single entry. If any registrar workflow requires re-keying, that is a design defect, not a feature gap.

---

## M11 — Student Portal

*Part 16.*

| ID | Requirement | Pri |
|---|---|---|
| FR-STP-1 | Secure login with a student-specific account | M |
| FR-STP-2 | View own profile and current enrollment (grade level, section, adviser) | M |
| FR-STP-3 | View own enrolled subjects and assigned teachers | M |
| FR-STP-4 | View own **published** grades by subject and period | M |
| FR-STP-5 | View own general average, if the school enables it | M |
| FR-STP-6 | View own academic history from prior years, if the school enables it | M |
| FR-STP-7 | View own attendance summary, if the school enables it | P2 |
| FR-STP-8 | Download authorized documents (own report card), if the school enables it | P2 |
| FR-STP-9 | View school announcements | P2 |
| FR-STP-10 | Notification when grades are published | P2 |
| FR-STP-11 | Mobile-first layout — this is the one surface built phone-first | M |

**Enforced negatives — tested explicitly, not assumed:**

| The student must never see | Enforced by |
|---|---|
| Another learner's record, anywhere, including in error messages | RLS predicate on student identity |
| Draft, submitted, approved, or finalized-but-unpublished grades | `published_at IS NOT NULL` in the RLS predicate itself |
| Teacher or registrar working data | Role-based table access |
| Class rankings or comparative standing | No such view exists for the student role |

The publication check belongs **in the row-level security predicate**, not in application code. A missing `WHERE` clause in a new query should be incapable of leaking an unpublished grade.

---

## M12 — Admin Dashboards

*Part 18. Role-appropriate, deliberately sparse.*

**School Administrator**
Total learners (enrolled / transferred / dropped) · total teachers and active accounts · sections and classes by grade level · submission completion % for the current period · classes with no assigned teacher · configuration warnings (missing scheme, missing signatory, calendar gaps) · recent user activity

**Principal / School Head**
Submission completion by department and by teacher · overdue submissions · school-wide grade distribution for the current period · promotion outlook at year end · attendance rate trend · pending items awaiting their approval

**Registrar**
Pending submissions · returned awaiting resubmission · missing submissions with days overdue · documents issued this period · enrollment changes this month · learners with incomplete grades

**Department Head**
Their department's submission status by teacher · subject-level distribution · at-risk learner count

**Teacher**
My classes with per-class completion % · what is due and when · returned submissions needing attention · students with missing scores in the current period · quick-resume link to the last class edited

> **Design rule:** every dashboard element must answer a question the user actually asks. A count of total learners on a teacher's dashboard fails that test. V0's home page renders role-aware content already (`renderHome`, `main.js:998`) — the instinct is right; the discipline about relevance needs to be tighter.

---

## M13 — Notifications

*Part 30.*

### Channel recommendation

| Channel | V1 | Rationale |
|---|---|---|
| **In-app** | ✅ Ship | Zero marginal cost, no deliverability problems, works for every role. The default for everything. |
| **Email** | ✅ Ship (digest) | Cheap, reliable, reaches teachers who are not logged in. Essential for deadline reminders. |
| **SMS** | ❌ Excluded | Per-message cost in the Philippines is real recurring spend that a public school's MOOE will not absorb, and it needs verified mobile numbers the school may not hold accurately. Offer as a **paid add-on** only if a school explicitly asks and funds it. |
| **Push / mobile app** | ❌ P3 | Requires a native app. Not before there is one. |
| **Messenger / Viber** | ❌ P3 | Widely used in PH schools and worth revisiting for a parent portal, but adds platform dependency and policy risk. Not in V1. |

### Notification matrix

| Recipient | Event | In-app | Email | Priority |
|---|---|---|---|---|
| Teacher | Submission deadline approaching (configurable lead time) | ✅ | ✅ | P2 |
| Teacher | Submission overdue | ✅ | ✅ | P2 |
| Teacher | Submission returned by registrar | ✅ | ✅ | **M** |
| Teacher | Submission approved | ✅ | ○ | P2 |
| Teacher | Class assignment added or changed | ✅ | ✅ | P2 |
| Registrar | Teacher submitted a class | ✅ | digest | **M** |
| Registrar | Submission window closed with N missing | ✅ | ✅ | P2 |
| Registrar | Correction request raised | ✅ | ✅ | P2 |
| Principal | Item awaiting countersign | ✅ | ✅ | P2 |
| Dept Head | Department submission status at deadline | ✅ | digest | P2 |
| Student | Grades published | ✅ | optional | P2 |
| Student | New document available | ✅ | optional | P2 |
| Student | School announcement | ✅ | ○ | P2 |

**MVP scope:** an in-app notification centre with unread counts, carrying the two events marked **M** — the ones without which the workflow visibly stalls. Everything else follows in Phase 2.

**Requirements**

| ID | Requirement | Pri |
|---|---|---|
| FR-NOT-1 | Persistent in-app notification store with read/unread state | M |
| FR-NOT-2 | Notification centre with unread badge | M |
| FR-NOT-3 | Per-user channel preferences | P2 |
| FR-NOT-4 | Email delivery via a transactional provider, with bounce handling | P2 |
| FR-NOT-5 | Daily digest option to prevent notification fatigue | P2 |
| FR-NOT-6 | Admin-composed school announcements targeted by role, grade level, or section | P2 |
| FR-NOT-7 | Notifications never contain grade values in the message body — they link into the authenticated app | M |

> FR-NOT-7 is a privacy requirement, not a style choice. Email is not a confidential channel, and a learner's grade must not sit in an inbox or a notification preview.

---

## M14 — Audit Logging

*Part 23.*

| ID | Requirement | Pri |
|---|---|---|
| FR-AUD-1 | Log every create, update, and delete on academic and student data | M |
| FR-AUD-2 | Capture actor, timestamp, entity type, entity ID, action, and school | M |
| FR-AUD-3 | Capture old value and new value for changed fields | M |
| FR-AUD-4 | Log every workflow state transition with its reason | M |
| FR-AUD-5 | Log every document generation and issuance | M |
| FR-AUD-6 | Log authentication events: login, failed login, logout, password change, MFA change | M |
| FR-AUD-7 | Log grade publication and unpublication | M |
| FR-AUD-8 | Audit records are **append-only** — no user, including Super Admin, may edit or delete them | M |
| FR-AUD-9 | Capture IP address and user agent for sensitive actions | P2 |
| FR-AUD-10 | Searchable audit viewer filtered by entity, actor, and date range | M |
| FR-AUD-11 | Per-record history view: "show me everything that happened to this grade" | M |
| FR-AUD-12 | Configurable retention with archival rather than deletion | P2 |

### Minimum viable audit

If effort must be cut, these are the events that cannot be dropped — they are the ones a grade dispute turns on:

1. Grade value changed (old → new, by whom, when)
2. Submission state transition (any, with reason)
3. Grade published or unpublished
4. Finalized record reopened
5. Document issued
6. Permission or role changed
7. Login and failed login

---

## M15 — Document Generation

Full treatment in [11 Document Engine](11-document-engine.md) and [05 School Forms Strategy](05-school-forms-strategy.md).

MVP scope: a configurable **report card** and a **promotion report**, plus Excel export of any tabular view. Remaining school forms in Phase 2.

## M16 — Data Import & Migration

Full treatment in [10 Excel Migration](10-excel-migration.md).

MVP scope: student roster import and teacher account import — the two without which onboarding a school is impossible. Historical grade import in Phase 2.

## M17 — Parent Portal

**Deferred to Phase 2.** The guardian data model ships in V1 (FR-STU-9 to FR-STU-12) so the portal can be added without a migration, but no parent-facing surface is built.

Rationale is in [12 MVP & Roadmap](12-mvp-and-roadmap.md): guardian identity verification is genuinely difficult, support burden multiplies at the least stable moment, and consent handling for minors' data adds legal exposure best not taken on in a first release.
