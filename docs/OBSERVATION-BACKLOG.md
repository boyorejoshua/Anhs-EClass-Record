# Production Observation Backlog

## Purpose and scope

This is the durable triage record for the six manual production-observation
documents supplied after the Phase 2.2 live-verification gate completed on
2026-09-11. It records observations and repository evidence; it does not
authorize implementation, production access, data writes, or changes to
Supabase Auth, RLS, migrations, or deployment.

The observation documents are evidence, not requirements. A requested
different experience is not automatically a defect. Repository source,
migrations, tests, and current durable documentation are the implementation
truth used for the classifications below.

## Priority model

| Priority | Meaning |
| --- | --- |
| P0 | Security or data-integrity risk that must precede real data or production use. |
| P1 | Functional or data-integrity issue requiring prompt, bounded investigation. |
| P2 | Workflow or usability improvement that needs a defined user outcome. |
| P3 | Visual, layout, readability, or polish issue. |
| P4 | Future capability, deferred decision, or observation with no immediate change. |

## Classification summary

The 20 canonical observation items below deduplicate repeated role reports.

| Classification | Count | IDs |
| --- | ---: | --- |
| Confirmed defect | 4 | OBS-004, OBS-005, OBS-006, OBS-007 |
| Suspected defect - investigation required | 0 | — |
| UX/UI improvement | 6 | OBS-008, OBS-009, OBS-010, OBS-011, OBS-012, OBS-014 |
| Workflow / business-rule decision | 3 | OBS-013, OBS-016, OBS-017 |
| Feature request | 0 | — |
| Expected current behavior | 3 | OBS-001, OBS-002, OBS-019 |
| Duplicate / cross-role issue | 0 canonical items | Repeated reports are mapped to their canonical items in the coverage ledger. |
| Inconclusive | 4 | OBS-003, OBS-015, OBS-018, OBS-020 |

| Priority | New observation items | Existing roadmap items | Total execution queue |
| --- | ---: | ---: | ---: |
| P0 | 0 | 1 | 1 |
| P1 | 1 | 0 | 1 |
| P2 | 7 | 0 | 7 |
| P3 | 5 | 0 | 5 |
| P4 | 7 | 0 | 7 |

`ROADMAP-001` below is the documented P0 Auth-hardening prerequisite. It is
not started or authorized by this observation review.

## Canonical backlog

### OBS-001 - Owner account's intentional Student association

- **Affected roles / screen:** Student; My Profile, My Grades, Academic History,
  Schedule. The owner account is intentionally multi-role.
- **Observation:** The Student Profile showed `Ramirez, Kent` while the signed-in
  account identified Joshua Boyore. The same Student role showed academic-history
  data that did not obviously belong to the signed-in person.
- **Current repository and production behavior:** Selecting Student changes only
  client-side active-role/navigation state; it does not change the Supabase session,
  JWT subject, or `students.portal_user_id` association. The server-side
  `app.current_student_id()` resolves the learner from the verified JWT subject.
  `my_profile()` and `my_academic_history()` both use that resolver and take no
  learner ID from the client. A read-only production check confirmed that the owner
  account is linked to `Kent Ramirez`; the Student observation and its Taytay
  historical record are therefore internally consistent with that association.
  Durable demo-readiness documentation explicitly defines this as the intentional
  multi-role system-owner/developer configuration, not a student-isolation test.
  The committed seed uses the same linked IDs but labels that learner `Joshua Reyes
  Boyore`, creating a seed-fixture/documentation-data drift rather than a runtime
  production mapping difference.
- **Expected / requested behavior:** The owner account remains a deliberate
  multi-role owner/developer account associated with Kent Ramirez. It must not be
  used as evidence of a normal student-only portal experience; use the documented
  student-only/demo learner account for that verification.
- **Classification:** **EXPECTED CURRENT BEHAVIOR — RESOLVED**.
- **Severity / priority:** Low operational risk / **P4**.
- **Evidence:** Student Role observation document; `AGENTS.md`; Phase 1.5 and
  Phase 2 demo-readiness documentation; `app.current_student_id()` in
  `supabase/migrations/0005_students_enrollment.sql`; `my_profile` and
  `my_academic_history` in
  `supabase/migrations/0018_app_contracts_and_publication_gate.sql`; student RLS
  tests; committed `supabase/seed.sql`; and the authorized read-only production
  mapping check. No credentials, secrets, or production data are recorded here.
- **Dependencies:** None for production runtime behavior. Future fixture
  reconciliation requires a separately authorized decision; it must not alter the
  production owner association merely to match the seed label.
- **Investigation required:** No.
- **Smallest next step:** No runtime fix. Preserve the owner-account warning in
  student-test guidance and separately decide whether the seed fixture and durable
  rehearsal material should be reconciled.

### OBS-002 - Explain historical external-school records correctly

- **Affected roles / screen:** Student; Academic History.
- **Observation:** The history showed Taytay National High School; the observation
  requested that another school appear only for a transfer student.
- **Current repository behavior:** `my_academic_history()` deliberately returns an
  enrollment's `recording_school_name` when present, otherwise the tenant school.
  The seed intentionally creates a prior-year record for the Joshua learner at
  Taytay National High School to verify historical/SF10 provenance. Historical
  records are retained; they are not limited to the active school year.
- **Expected / requested behavior:** External-school provenance should display for
  a learner whose recorded prior enrollment belongs to that school. It should not
  be suppressed merely because the current tenant is ANHS.
- **Classification:** **EXPECTED CURRENT BEHAVIOR**.
- **Severity / priority:** Low / **P4**.
- **Evidence:** Student Role observation document; `my_academic_history()` in
  migration 0018; seeded prior enrollment and comments in `supabase/seed.sql`;
  D-010 in `docs/DECISIONS.md`.
- **Dependencies:** OBS-001 is resolved: the production history belongs to the
  intentionally linked Kent Ramirez record. The committed seed's label for that
  same identifier is stale fixture data and does not change the history rule.
- **Investigation required:** No separate implementation investigation.
- **Smallest next step:** Retain the current history-provenance rule and explain it
  in any future Student-portal guidance. Reopen only if OBS-001 shows a wrong
  learner mapping.

### OBS-003 - Establish whether My Account writes work in a safe environment

- **Affected roles / screen:** All roles; My Account, Save details, Change password.
- **Observation:** Several role documents reported that saving details and changing
  a password did not work. The live verification deliberately did not submit either
  form to avoid modifying production data.
- **Current repository behavior:** `MyAccount.tsx` invokes `update_my_profile` for
  own profile fields and calls Supabase Auth `updateUser({ password })` before
  clearing `must_change_password`. Errors are surfaced in the screen. This source
  trace proves the intended calls exist, not that a production write succeeds.
- **Expected / requested behavior:** A permitted user can save permitted own details
  and change a password, with success or an actionable error. No test should alter
  production data merely to establish this.
- **Classification:** **INCONCLUSIVE**.
- **Severity / priority:** Medium / **P1**.
- **Evidence:** Administrator, Registrar, Advisory Teacher, Subject Teacher, and
  Student observation documents; `app/src/screens/MyAccount.tsx`;
  `app/src/data/supabase.ts`.
- **Dependencies:** An authorized non-production/rehearsal account and an agreed
  reversible test procedure. The upcoming P0 Auth work must remain separately
  authorized.
- **Investigation required:** Yes.
- **Smallest next step:** After a separate authorization, run one controlled
  non-production save/reload and password-change/re-authentication scenario. Do
  not use the production owner account or log credentials.

### OBS-004 - Align Academic Years status with its year card

- **Affected roles / screen:** Administrator; Academic Years.
- **Observation:** The `Active` status pill was visibly misaligned with the year
  information in the supplied UI screenshot.
- **Current repository behavior:** `AcademicYears.tsx` places the status pill in a
  shared `panel-head` beside the year label. The live screenshot confirms a layout
  defect in that rendered arrangement.
- **Expected / requested behavior:** The status should be visually aligned and
  clearly associated with its academic-year card across supported layouts.
- **Classification:** **CONFIRMED DEFECT**.
- **Severity / priority:** Low / **P3**.
- **Evidence:** Ui Issues document and screenshot; `app/src/screens/AcademicYears.tsx`.
- **Dependencies:** None beyond a scoped visual-regression target.
- **Investigation required:** No; the visual defect is confirmed.
- **Smallest next step:** Inspect the `panel-head` layout at the production viewport
  and add a narrow visual/layout adjustment with a focused regression check, only
  after approval.

### OBS-005 - Prevent Students filter helper text from truncating

- **Affected roles / screen:** Administrator; Students.
- **Observation:** The helper text such as `Choose a grade level first` was
  truncated in the Students filter control.
- **Current repository behavior:** The Students screen intentionally requires a
  grade-level selection before its section selector and uses that exact helper
  message. The screenshot confirms that the message/control cannot be fully read
  at the observed layout.
- **Expected / requested behavior:** The control and its instruction should remain
  readable without widening the page or hiding the state requirement.
- **Classification:** **CONFIRMED DEFECT**.
- **Severity / priority:** Low / **P3**.
- **Evidence:** Ui Issues document and screenshot; `app/src/screens/Students.tsx`;
  shared control styles in `app/src/styles/screens.css`.
- **Dependencies:** None beyond a scoped responsive-layout check.
- **Investigation required:** No; the visual defect is confirmed.
- **Smallest next step:** Measure the filter toolbar/control width at the affected
  viewport and correct only the overflow/wrapping rule after approval.

### OBS-006 - Restore readable spacing in School Setup

- **Affected roles / screen:** Administrator; School Setup, especially School
  Details and subject/category controls.
- **Observation:** The form cards, text, and buttons appeared cramped, with
  insufficient padding, width, and spacing.
- **Current repository behavior:** School Setup is a functioning multi-section
  administrator screen using shared `form-grid`, `picker`, and panel styles. The
  supplied screenshots confirm the current presentation is too dense.
- **Expected / requested behavior:** Form controls and actions need readable
  spacing and usable widths without changing the configuration workflow.
- **Classification:** **CONFIRMED DEFECT**.
- **Severity / priority:** Low / **P3**.
- **Evidence:** Administrator Role and Ui Issues documents/screenshots;
  `app/src/screens/SchoolSetup.tsx`; `app/src/styles/screens.css`.
- **Dependencies:** A viewport matrix and a decision to keep the existing content
  hierarchy while adjusting presentation.
- **Investigation required:** No; the visual defect is confirmed.
- **Smallest next step:** Capture the affected breakpoints and make a small,
  School-Setup-scoped spacing/layout change only after approval.

### OBS-007 - Restore readable spacing in My Account

- **Affected roles / screen:** All roles; My Account.
- **Observation:** The shared account form was visually cramped; the same issue was
  reported by every role and shown in the UI screenshot.
- **Current repository behavior:** All roles render the same `MyAccount` component
  and shared form-grid styles.
- **Expected / requested behavior:** The account form should have legible field,
  action, and read-only-detail spacing at supported widths.
- **Classification:** **CONFIRMED DEFECT**.
- **Severity / priority:** Low / **P3**.
- **Evidence:** All five role observation documents and Ui Issues screenshot;
  `app/src/screens/MyAccount.tsx`; `app/src/styles/screens.css`.
- **Dependencies:** None beyond a scoped responsive-layout check. Functional
  testing remains OBS-003, not part of this visual fix.
- **Investigation required:** No; the visual defect is confirmed.
- **Smallest next step:** Treat this as one shared component styling task, separate
  from the write-function investigation, after approval.

### OBS-008 - Improve teacher and adviser worklist organization

- **Affected roles / screen:** Advisory Teacher and Subject Teacher; Dashboard,
  My Classes, Students, Attendance, and the class-linked worklist screens.
- **Observation:** Both roles requested a clearer hierarchy by academic year, grade,
  and section rather than an apparently subject-first sequence.
- **Current repository behavior:** The application has class and section data and
  renders role-specific class worklists. It does not document a requirement that
  every worklist be grouped in the requested hierarchy.
- **Expected / requested behavior:** Staff should be able to orient themselves by
  active academic year, then grade/section, while retaining the subject context
  needed for a subject teacher.
- **Classification:** **UX/UI IMPROVEMENT**.
- **Severity / priority:** Medium / **P2**.
- **Evidence:** Advisory Teacher and Subject Teacher observation documents;
  role navigation in `app/src/nav.ts`; relevant class/worklist screens.
- **Dependencies:** A product decision on the primary sort/grouping for a
  multi-grade, multi-section, multi-subject teacher.
- **Investigation required:** Yes, for the representative teacher data shape and
  the desired grouping on each screen.
- **Smallest next step:** Define one information-architecture rule with two
  representative multi-assignment fixtures before changing any list ordering.

### OBS-009 - Clarify Registrar record and class information architecture

- **Affected roles / screen:** Registrar and Administrator; Academic Records,
  Classes & Sections, and related learner search/list views.
- **Observation:** The reports requested year/grade/section organization, questioned
  a Grade-10-only subject list, and noted that Academic Records opened at Term 2.
- **Current repository behavior:** The registrar learner directory deliberately
  uses server-side named-learner search for permanent-record/SF10 work. The active
  year/period is selected by status, so Term 2 is expected when it is active. The
  committed active seed data is Grade 10-focused; that is not proof that the data
  model only supports Grade 10.
- **Expected / requested behavior:** The records workflow should make its intended
  search-first and active-period behavior clear and, if validated, offer a
  year/grade/section path that supports real registrar work without large client
  directories.
- **Classification:** **UX/UI IMPROVEMENT**.
- **Severity / priority:** Medium / **P2**.
- **Evidence:** Administrator and Registrar observation documents;
  `app/src/screens/RegistrarStudents.tsx`; `app/src/nav.ts`; active
  year/period model in `docs/PROJECT-STATE.md`.
- **Dependencies:** A registrar workflow decision: permanent-record lookup versus
  cohort browsing, including data-volume and LRN-privacy constraints.
- **Investigation required:** Yes.
- **Smallest next step:** Write two task scenarios - find one named learner for
  SF10 and review a cohort by grade/section - and decide whether one screen or two
  entry points serve them.

### OBS-010 - Improve Student dashboard access to term and history context

- **Affected roles / screen:** Student; Dashboard and Academic History.
- **Observation:** The Student dashboard was requested to organize information by
  term and include history.
- **Current repository behavior:** The portal has a distinct Academic History
  screen and row-based academic periods; it does not document a requirement to
  duplicate full history in the dashboard.
- **Expected / requested behavior:** The Student landing experience should make
  current term context and the existing history destination easy to understand.
- **Classification:** **UX/UI IMPROVEMENT**.
- **Severity / priority:** Low / **P2**.
- **Evidence:** Student Role observation document; Student portal screens;
  three-term data model in `docs/PROJECT-STATE.md`.
- **Dependencies:** A decision on summary versus full-history content, especially
  for a learner with multiple academic years.
- **Investigation required:** Yes.
- **Smallest next step:** Produce a non-code content/IA sketch using current-term
  summary plus a clear link to existing history; do not duplicate records by
  default.

### OBS-011 - Make role dashboard and submission responsibilities clearer

- **Affected roles / screen:** Administrator and Registrar; Dashboard and Grade
  Submissions. Advisory Teacher; Submissions.
- **Observation:** The reports questioned the purpose of the Administrator and
  Registrar dashboards and why they can see Grade Submissions.
- **Current repository behavior:** The Administrator navigation intentionally
  includes the Registrar's operational menu as a superset. Registrar Grade
  Submissions is the receipt/review queue for adviser submissions; the Help text
  describes receiving, approving, or returning a submission. This is not evidence
  that an Administrator may bypass the lifecycle.
- **Expected / requested behavior:** The interface should make the custody chain
  and each role's scope understandable without relying on internal documentation.
- **Classification:** **UX/UI IMPROVEMENT**.
- **Severity / priority:** Low / **P2**.
- **Evidence:** Administrator and Registrar observation documents;
  `app/src/nav.ts`; `app/src/screens/Help.tsx`; documented lifecycle in
  `docs/PROJECT-STATE.md`.
- **Dependencies:** Product-approved role wording and a confirmation of which
  admin actions are intended versus registrar-only in practice.
- **Investigation required:** Yes, for role copy and action-level scope.
- **Smallest next step:** Inventory the visible actions on the two Grade
  Submissions routes and draft concise role-specific explanatory copy; do not
  alter permissions as part of a copy task.

### OBS-012 - Clarify Incoming Grades and Consolidated Grades

- **Affected roles / screen:** Advisory Teacher; Incoming Grades and Consolidated
  Grades.
- **Observation:** Incoming Grades was empty and its difference from Consolidated
  Grades was unclear.
- **Current repository behavior:** Incoming Grades is the adviser receipt view for
  subject-teacher term submissions. Consolidated Grades is the adviser's
  all-subject, whole-section view. An empty Incoming Grades state is expected when
  no teacher submission is waiting.
- **Expected / requested behavior:** The empty state and page copy should clearly
  distinguish the two workflows.
- **Classification:** **UX/UI IMPROVEMENT**.
- **Severity / priority:** Low / **P2**.
- **Evidence:** Advisory Teacher observation document; `app/src/screens/AdviserQueue.tsx`;
  `app/src/screens/ConsolidatedGrades.tsx`; `app/src/screens/Help.tsx`.
- **Dependencies:** None beyond confirmation that the intended terminology matches
  school practice.
- **Investigation required:** No code investigation; a content review is enough.
- **Smallest next step:** Validate the empty-state and Help wording with one
  adviser; preserve the current workflow unless a business-rule decision changes it.

### OBS-013 - Decide the submission cancellation and acknowledgement policy

- **Affected roles / screen:** Subject Teacher, Advisory Teacher, Registrar;
  Submissions, Incoming Grades, Grade Submissions.
- **Observation:** The requested model allows an adviser to undo/cancel a
  submission until the registrar acknowledges it, then requires an explicit
  rejection/review path.
- **Current repository behavior:** The documented lifecycle already has audited
  states and return/approval paths: draft through submitted, received, forwarded,
  registrar-received, returned, approved, finalized, and published. The source
  exposes receive/return/approve/finalize/publish operations. It does not establish
  the requested withdrawal boundary as a requirement.
- **Expected / requested behavior:** A school-approved custody policy must define
  who may withdraw, receive, reject/return, acknowledge, or reopen at each state,
  including audit and notification consequences.
- **Classification:** **WORKFLOW / BUSINESS-RULE DECISION**.
- **Severity / priority:** Medium / **P2**.
- **Evidence:** Advisory Teacher and Subject Teacher observation documents;
  `docs/PROJECT-STATE.md`; submission operations in `app/src/data/supabase.ts`.
- **Dependencies:** Written registrar/adviser policy; audit-record and publication
  rules; confirmation that no current transition already satisfies the desired
  process.
- **Investigation required:** Yes.
- **Smallest next step:** Create a state-transition decision table before any
  screen, RPC, migration, or notification work is proposed.

### OBS-014 - Improve Analytics, LOA, and Reports presentation

- **Affected roles / screen:** Advisory Teacher and Subject Teacher; Analytics,
  LOA Reports, Reports.
- **Observation:** The reports requested clearer grade/year/section orientation,
  more readable sorting, and more considered light-theme color and visual design.
- **Current repository behavior:** Analytics and LOA are implemented; LOA logic is
  authoritative and should not be changed for a presentation request. The durable
  docs report that prior analytics/LOA functional claims were not reproducible as
  defects.
- **Expected / requested behavior:** Improve presentation and orientation without
  altering LOA calculation, report data, or publication rules.
- **Classification:** **UX/UI IMPROVEMENT**.
- **Severity / priority:** Low / **P3**.
- **Evidence:** Advisory Teacher and Subject Teacher observation documents;
  `docs/KNOWN-ISSUES.md`; `AGENTS.md` LOA constraint.
- **Dependencies:** A visual/design direction and a viewport/accessibility review.
- **Investigation required:** Yes, limited to presentation and grouping.
- **Smallest next step:** Capture a representative light-theme screen set and
  define visual acceptance criteria; exclude `app/src/lib/loa.ts` and report
  calculation logic.

### OBS-015 - Verify Enrollment selector data and expected control flow

- **Affected roles / screen:** Administrator and Registrar; Enrollments.
- **Observation:** The reports questioned why only certain grades appeared and why
  the enrollment dropdowns behaved as displayed.
- **Current repository behavior:** Enrollment and section selection depend on the
  configured academic year, grade levels, and sections. Lifecycle tests document
  that class/enrollment relationship defects are not currently reproducible, but
  the manual observation does not identify the selected academic year, configured
  sections, or a failed action.
- **Expected / requested behavior:** A user should be able to understand the
  sequence of selecting an available grade and section, and unavailable options
  should have an explicit configuration reason.
- **Classification:** **INCONCLUSIVE**.
- **Severity / priority:** Medium / **P2**.
- **Evidence:** Administrator and Registrar observation documents;
  `docs/KNOWN-ISSUES.md` lifecycle finding; enrollment source/screens.
- **Dependencies:** A reproducible scenario with the selected year, grade, section,
  expected availability, and no production write.
- **Investigation required:** Yes.
- **Smallest next step:** Record a read-only configuration/selection trace on a
  non-production data set before proposing any selector or enrollment change.

### OBS-016 - Decide the Academic Years lifecycle before adding controls

- **Affected roles / screen:** Administrator; Academic Years.
- **Observation:** The report requested an option to add an academic year.
- **Current repository behavior:** Academic Years is intentionally a read-only
  viewer. Creating, closing, or archiving a year is an onboarding-time operation
  because it determines downstream periods and data shape. The archived-year
  trigger has a documented coverage gap that becomes relevant if an archive action
  is introduced.
- **Expected / requested behavior:** Any lifecycle controls need an approved policy
  for year creation, period structure, activation, closure, archival, authority,
  audit, and the trigger gap.
- **Classification:** **WORKFLOW / BUSINESS-RULE DECISION**.
- **Severity / priority:** Medium / **P4**.
- **Evidence:** Administrator observation document; `app/src/screens/AcademicYears.tsx`;
  D-015 / `docs/KNOWN-ISSUES.md` archived-year limitation; `docs/ROADMAP.md`.
- **Dependencies:** Product and data-integrity design; resolution of the archived
  write-protection gap before any archive action.
- **Investigation required:** Yes.
- **Smallest next step:** Keep the viewer read-only and write the academic-year
  lifecycle policy; do not add a CRUD control.

### OBS-017 - Decide subject-category administration boundaries

- **Affected roles / screen:** Administrator; School Setup, Add Subject category
  selector.
- **Observation:** The report asked to observe/add categories through the category
  dropdown when adding subjects.
- **Current repository behavior:** School Setup lets an administrator add a subject
  and choose an existing category. The selected category determines grading
  weights and cannot later be changed from that screen. The repository does not
  establish free-form category creation as safe current behavior.
- **Expected / requested behavior:** Category creation/editing needs a policy for
  grading-scheme ownership, valid grade levels, historical grade protection, and
  who may make the change.
- **Classification:** **WORKFLOW / BUSINESS-RULE DECISION**.
- **Severity / priority:** Medium / **P4**.
- **Evidence:** Administrator observation document; `app/src/screens/SchoolSetup.tsx`;
  D-009 and the deferred Grading Configuration rationale in `docs/ROADMAP.md`.
- **Dependencies:** A grading-governance decision; this is not a simple dropdown
  UI task.
- **Investigation required:** Yes.
- **Smallest next step:** Separate the need to choose an existing category from the
  request to create one, then obtain product approval for a protected category/
  scheme lifecycle before implementation.

### OBS-018 - Specify an Import Center observation scenario

- **Affected roles / screen:** Administrator and Subject Teacher; Import.
- **Observation:** The documents ask for observations of Import but report no
  concrete error, confusing state, file type, or result.
- **Current repository behavior:** Import is an implemented, guarded workflow;
  subject matching is intentionally configuration-controlled and an import must not
  invent a subject from a workbook typo.
- **Expected / requested behavior:** A testable import observation needs a named
  workbook shape, role, expected validation output, and an explicit statement that
  no production import will be committed.
- **Classification:** **INCONCLUSIVE**.
- **Severity / priority:** Low / **P4**.
- **Evidence:** Administrator and Subject Teacher observation documents;
  `app/src/screens/ImportCenter.tsx`; `app/src/screens/SchoolSetup.tsx`.
- **Dependencies:** A sanitized, non-production workbook and an approved
  read-only/preview-only scenario.
- **Investigation required:** Yes.
- **Smallest next step:** Define an import-preview test case; do not upload or
  commit a production workbook as part of observation triage.

### OBS-019 - Retain the verified Student Schedule behavior

- **Affected roles / screen:** Student; My Schedule.
- **Observation:** The Student Schedule was reported as correct.
- **Current repository behavior:** The schedule is derived from the learner's own
  enrollment/section; it is separately covered by the existing student-schedule
  regression evidence.
- **Expected / requested behavior:** Continue to show the enrolled learner's
  schedule without inventing structured meeting times from free-text schedule
  notes.
- **Classification:** **EXPECTED CURRENT BEHAVIOR**.
- **Severity / priority:** Low / **P4**.
- **Evidence:** Student Role observation document; Student portal schedule source;
  `AGENTS.md` free-text schedule constraint.
- **Dependencies:** None.
- **Investigation required:** No.
- **Smallest next step:** No change; preserve this as a positive live observation.

### OBS-020 - Turn vague Students-menu observations into testable reports

- **Affected roles / screen:** Administrator and Registrar; Students.
- **Observation:** The Administrator document says the Students menu was not fully
  tested; the Registrar document requests observations but identifies no concrete
  failure.
- **Current repository behavior:** Administrator and Registrar routes use different
  workflows and data sources; the reports do not identify a route, filter, record,
  or unexpected result to evaluate.
- **Expected / requested behavior:** A report should name the role, route, selected
  filters, expected outcome, actual outcome, and whether data was changed.
- **Classification:** **INCONCLUSIVE**.
- **Severity / priority:** Low / **P4**.
- **Evidence:** Administrator and Registrar observation documents; role navigation
  in `app/src/nav.ts`.
- **Dependencies:** A reproducible read-only scenario.
- **Investigation required:** Yes.
- **Smallest next step:** Convert the observation into one manual test case before
  adding a technical backlog change.

## Observation coverage ledger

This ledger shows how every substantive observation was preserved without
creating duplicate work items.

| Source document | Observation groups | Canonical disposition |
| --- | --- | --- |
| Administrator Role | Dashboard and Grade Submissions purpose; untested Students; Academic Records/Term 2; Classes & Sections/Grade 10; Import; Enrollment; School Setup/category; Academic Years; My Account | OBS-011, OBS-020, OBS-009, OBS-009, OBS-018, OBS-015, OBS-006/017, OBS-004/016, OBS-003/007 |
| Registrar Role | Dashboard/Grade Submissions purpose; Students; Academic Records; Classes & Sections; Enrollment; My Account | OBS-011, OBS-020, OBS-009, OBS-009, OBS-015, OBS-003/007 |
| Advisory Teacher | Dashboard/My Classes/Students/Attendance organization; Incoming/Consolidated purpose; Submissions lifecycle; Analytics/LOA/Reports presentation; My Account | OBS-008, OBS-012, OBS-013, OBS-014, OBS-003/007 |
| Subject Teacher | Repeats the Advisory Teacher organization, submission, analytics/LOA/reports, Import, and account observations | Duplicate / cross-role evidence for OBS-008, OBS-013, OBS-014, OBS-018, OBS-003/007 |
| Student Role | Dashboard term/history context; different profile name; Schedule correct; Taytay history; My Account | OBS-010, OBS-001, OBS-019, OBS-002, OBS-003/007 |
| Ui Issues | Academic Years status alignment; Students helper truncation; School Details density; My Account density | OBS-004, OBS-005, OBS-006, OBS-007 |

The documents contain headings for Users and several menu labels without a
reported symptom. They are preserved as non-findings rather than fabricated into
backlog items.

## Existing roadmap items related to observations

| ID | Existing documented item | Relationship to observation backlog | Priority | Status |
| --- | --- | --- | --- | --- |
| ROADMAP-001 | Rotate demo passwords and enable leaked-password protection | Existing P0 prerequisite before real learner data; not caused by a UI observation. | P0 | Not started; requires separate production/Auth authorization. |
| ROADMAP-002 | Reports & Documents screen and document engine | Registrar Reports & Documents remains intentionally planned, not a visual defect. | P4 | Deferred. |
| ROADMAP-003 | Demo learner portal account and principal-demo rehearsal | Needed for a normal learner demonstration, but not authorization to alter production. | P4 | Requires explicit go-ahead. |
| ROADMAP-004 | Public Enrollment / Phase 3 | Not started and outside this backlog. | P4 | Explicitly deferred. |

## Recommended execution order

1. **ROADMAP-001 (P0, existing):** separately authorize Auth hardening before
   any real learner data. Do not start it from this backlog.
2. **OBS-003 (P1):** verify My Account writes only in an authorized,
   non-production/rehearsal environment.
3. **OBS-013 (P2):** obtain a registrar/adviser decision on submission
   acknowledgement, return, withdrawal, and reopening before changing workflow.
4. **OBS-005 (P3):** fix the visible filter truncation as the smallest confirmed,
   independently verifiable UI change once implementation is authorized. OBS-004,
   OBS-006, and OBS-007 can be handled in a separate shared-layout scope.
5. **OBS-001 (P4, resolved):** use the documented student-only/demo learner account
   for Student isolation verification. Do not change the production owner mapping;
   seed-fixture reconciliation is a separate maintenance decision.

## Product decisions that require Joshua's direction

1. **Seed-fixture reconciliation:** The production owner association is deliberately
   Kent Ramirez. Should the committed seed's different label for the same linked
   IDs be reconciled with the durable rehearsal documentation? This is a
   maintenance/documentation decision, not authority to change production mapping.
2. **Submission custody policy:** May a teacher/adviser withdraw after submission?
   Who acknowledges, returns, reopens, finalizes, and publishes at each stage?
3. **Academic-year lifecycle:** Who may create, activate, close, and archive a
   year, and when should archive-write protection be expanded before an action
   exists?
4. **Information architecture:** Should staff worklists be grouped primarily by
   assignment/subject or by academic year/grade/section for multi-assignment staff?
5. **Subject categories:** Are grading categories centrally governed configuration
   or editable school-level data, and how must historical calculations be protected?

## Guardrails for follow-up work

- Do not treat this record as authorization to alter application code, Supabase,
  Auth, RLS, migrations, production data, passwords, or deployment.
- Do not use the Student observation to change account mappings until the intended
  production assignment is verified.
- Do not add Academic Years archive controls until the archived-year trigger gap is
  deliberately addressed.
- Do not turn a presentation request into a change to LOA logic, the grading
  engine, or grade-publication rules.
