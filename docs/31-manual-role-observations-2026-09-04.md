# Manual Role-by-Role Observations — Post Phase 2.2 Deploy

**Date:** 2026-09-04
**Tester:** Joshua Boyore, `joshua@anhs.test`, live production site, all 5 roles
**Context:** First manual walkthrough after PR #44 (Phase 2.1 + 2.2) merged and deployed.
**Source:** Five per-role Word docs with screenshots, consolidated here. Raw per-role
notes are kept in the appendix; the triage above it is the reviewed, prioritized version.

Two things this walkthrough already independently confirms, no further action needed:
- Multi-role switching works live (matches the Phase A checkpoint).
- The Academic Years screen shows real content (years, periods, status pills) — not
  the old `readiness: 'planned'` / "SOON" placeholder. Second independent confirmation
  that the merge deployed correctly.

---

## Priority — check these before/at the start of the next session

Small, fast, and worth resolving before creating the real demo student portal account,
because two of them touch identity/data resolution that account would inherit.

1. **Student role → "My Profile" shows a name that doesn't match the logged-in
   account.** Logged in as `joshua@anhs.test`, switched to Student role, "My Profile"
   displays **Ramirez, Kent** (LRN 136789010005, Grade 10, Section Pearl) — not a
   demo learner, not "Joshua Boyore." Likely explanation: the owner account's Student
   role is deliberately bound to an existing real student record (Kent Ramirez) as
   test scaffolding, predating the demo dataset. Needs an actual code-level answer:
   what determines which `students` row a session's Student-role view resolves to?
   Is this intentional fixture wiring, or a resolution bug? This matters directly for
   the next session — if the lookup logic is wrong, the new demo student account could
   inherit the same issue.

2. **My Account — "Save details" / "Change password" reported as not working**,
   independently on Administrator, Registrar, and (by the same-observation shorthand)
   Student docs. The screenshot captured shows the form in its default empty state
   (password fields blank, "Change password" correctly disabled) — so the screenshot
   doesn't itself prove a backend bug; it's equally consistent with "typed under 8
   characters and assumed the disabled button meant broken." Needs an actual retest:
   enter a valid detail change and a valid 8+ character password, submit, check
   network response and whether the change actually persists.

3. **Enrollment and Classes & Sections only show Grade 10** (Administrator role). The
   live data now includes a Grade 7 learner (Philip Domingez, 1 enrolled) alongside
   14 Grade 10 learners — so an all-Grade-10 display isn't just "the demo only has
   Grade 10 data" anymore, it may be an actual filter/default-grade bug worth a quick
   check now that real data has moved beyond a single grade level.

---

## Backlog — real, corroborated, not this session's scope

Do not start without an explicit instruction naming it.

- ~~**Sort/group by Grade Year + Section.**~~ **RESOLVED 2026-09-06 — sorted, not
  grouped.** One shared comparator, `app/src/lib/ordering.ts`, now orders every list
  in scope by grade level *numerically* then section name, and every screen named in
  the finding calls it. 14 unit tests (`ordering.test.ts`) cover the comparator,
  including the case the whole finding turns on — `'Grade 7'` before `'Grade 10'`,
  which a text compare gets backwards — and `e2e/grade-section-ordering.mjs` reads
  the rendered DOM order on four screens, because a unit test cannot catch a screen
  that forgets to call the comparator.

  **The audit changed the shape of the job.** Nine *screens* are six *components*,
  and four of those nine are one component: `MyClasses.tsx` is My Classes,
  Attendance, Submissions and Reports, differing only by a `purpose` prop. The rest:
  `Dashboards.tsx`, `Students.tsx`, `RegistrarStudents.tsx` (Academic Records),
  `ReportPicker.tsx` (Analytics and LOA Reports), `ClassesAndSections.tsx`.

  **And the diagnosis was not "unsorted".** These lists were sorted, and sorted
  *wrongly* — `rds.my_classes` orders on `c ->> 'gradeLevel'`
  (`0014_app_data_sources.sql:117`), which is a **text** compare, and `ReportPicker`
  sorted the fully assembled label. Both put Grade 10 ahead of Grade 7. The fix is
  client-side and presentation-only: no contract, permission, RLS boundary or
  grading-engine code was touched.

  **No schema change was needed, and the doc had drifted in two places.**
  `grade_levels.ordinal` (7…12) already exists and is already used correctly by the
  setup-options contracts — but the row types these screens receive
  (`ClassSummary`, `DirectoryStudent`, and friends) carry only `gradeLevel: string`,
  so the ordinal is fetched and dropped on the way to the screen. Rather than run a
  migration through several `rds.*` functions for a presentation fix, the comparator
  parses the number out of the label **and** accepts an explicit `gradeLevelOrdinal`,
  so threading the real ordinal through later needs no caller change. Two things the
  finding asserted are no longer true: the **sections** table on Classes & Sections
  was *already* correctly ordered server-side (only its classes table needed the
  fix), and **Reports & Documents** is `readiness: 'planned'` — a SOON placeholder
  with no list in it — so it is out of scope with nothing to sort.

  **Sorted, deliberately not grouped.** The finding says "sort/group"; this sorts.
  There is no grouped-list pattern anywhere in this codebase to match — every list is
  a flat table or a flat run of cards, and the only sectioning device that exists is
  the class workspace's tab seam, which is not a list. Adding grade-level headings to
  six screens would be *inventing* a visual pattern, which is a design decision rather
  than an ordering one. Order answers the complaint as reported; headings, if wanted,
  are a deliberate later pass over these same call sites.

  **One thing the change surfaced, worth remembering:** four e2e suites
  (`consolidated-grades`, `custody-chain`, `guide-and-exports`, `loa-report`) failed
  on the new order, and *correctly so* — each opened a class with
  `.first()`, which silently meant "Grade 10 – Pearl" only because the old wrong
  order put it first. All four now select the class by name. `custody-chain.mjs`
  already carried a comment warning against exactly this.

  The original finding, for the record: by far the most repeated note —
  independently raised on Dashboard, My Classes, Students, Attendance, Academic
  Records, Classes & Sections, Submissions, Analytics, and Reports, across
  Administrator, Registrar, Advisory Teacher, and Subject Teacher docs. Currently
  these render as flat lists. Well-corroborated, cross-cutting, but a UI change
  across many screens — a right-sized future phase on its own, not a fold-in.
- ~~**Grade submission workflow gaps**~~ **ANSWERED 2026-09-07 — both halves already
  existed; the investigation found and fixed a different bug instead.**

  **Self-undo before acknowledgment: already built, since migration 0022.**
  `public.recall_grades` returns a submission to `draft` and reopens editing. It is
  surfaced as a **Recall {period}** button on the class Submission tab, offered only
  when `canRecall(status)`.

  **"Acknowledged" is the ADVISER's `received_at`** — not the registrar's
  `registrar_received_at`, and no new state was needed. The transition table is
  explicit: `submitted → ['draft', 'received', 'returned']`, where `'draft'` *is* the
  recall, and `canRecall(st)` is `st === 'submitted'` — true for exactly one status out
  of ten. That is precisely the window in which nobody has taken responsibility for the
  record. From `received` onward the only way back is the registrar's `return`,
  untouched.

  **Which also answers "what would an undo have to reverse?" — nothing.** Because
  recall is legal *only* from `submitted`, there is by construction no `received_at`,
  `forwarded_at` or `registrar_received_at` to unwind. `recall_grades` clears
  `submitted_by`/`submitted_at`, writes an audit row, and touches no other receipt
  column. Three independent guards: the permission + `teaches_class` check, an explicit
  `v_from <> 'submitted'` refusal written for a person (*"this period is already with
  the class adviser and can no longer be recalled; ask for it to be returned instead"*),
  and `app.assert_transition`.

  **The visible distinction was already there too.** `STATUS_MEANING` renders on the
  Submission tab: `submitted` → *"Sent to the class adviser, who has not yet received
  it. You can still recall it."*; `received` → *"The class adviser has received it.
  Editing is locked and it can no longer be recalled — ask the adviser to return it."*
  Alongside it, a three-step chain-of-custody list with real timestamps names who has
  and has not signed. `e2e/custody-chain.mjs` has walked the whole boundary in a real
  browser since 0022, including asserting the Recall button *disappears* once the
  adviser signs.

  **Grade Entry already autosaves, so that half scoped down as anticipated** — debounced
  700 ms, batched, per dirty cell, with a `SaveIndicator` reading *No changes / Saving… /
  Saved 3s ago / Not saved — retry* and a Retry that keeps the values in the inputs. No
  new save mechanism was written.

  **⚠️ What the investigation DID find — a real bug, now fixed.** Grade Entry showed
  *"Saved just now"* and then **showed the cell empty** after leaving the tab and coming
  back. `App` fetches the gradebook once per class+period and `ClassWorkspace` renders
  `{tab === 'gradebook' && <Gradebook/>}`, so leaving unmounts the grid and returning
  re-seeds it from the pre-edit snapshot. The value was on the server the whole time —
  reopening the class showed it — but the screen contradicted the save indicator, which
  is worse than having no indicator. Caught by driving the path, not by review. A save
  now marks the cached copy stale and re-entering the tab refetches once.

  **Three smaller things fixed with it.** (1) Pending edits are flushed on unmount
  rather than left to a timer racing an unmounted component. (2) A `beforeunload` guard
  while work is genuinely outstanding — which in practice means a *failed* save, since
  the debounce case is now flushed. (3) `Gradebook` had declared `onDirtyChange`, called
  it in four places, and **nobody ever passed it** — the count was computed and thrown
  away, AGENTS.md 8 in mirror image. It now drives an unsaved-count badge on the Grade
  Entry tab, reusing the same `tab-count` badge the Submission tab already uses, and the
  count appears in the indicator (*"Not saved — 3 changes"*) so a teacher can tell one
  stray cell from a lost column.

  Covered by nine new e2e checks (`save-and-undo.mjs`) and nine new unit tests —
  `saveLabel` extracted as a pure function so the wording is testable in a node
  environment, plus three tests pinning the undo boundary: that it ends at the
  adviser's signature and not the registrar's, that exactly one status out of the whole
  table is recallable (checked exhaustively, so a status added later cannot silently
  widen the window), and that undo never needs to unwind an adviser or registrar action.

  **Still open, and deliberately untouched:** the doc's third clause — *"no visible
  distinction between 'submitted, awaiting acknowledgment' and 'acknowledged'"* — is
  satisfied on the **Submission tab**, which is where the teacher acts. It is *not*
  surfaced on the My Classes card list, where a teacher scanning several classes still
  sees only a status badge. That is a presentation change across a shared component and
  was not asked for here.

  The original finding, for the record: once submitted, no way to undo/cancel before the
  registrar acknowledges; no visible distinction between "submitted, awaiting
  acknowledgment" and "acknowledged" (only after which it should become truly locked,
  reversible only by registrar rejection). Real workflow-design request, not a bug.
- ~~**"Incoming Grades" vs "Consolidated Grades"**~~ **RESOLVED 2026-09-07 —
  naming/discoverability only; the screens do not overlap.** The audit found no
  functional overlap at all. They share the phrase "grades", the adviser role, and
  two adjacent slots in the menu; they share **no columns, no contract, and no
  grain**:

  | | Incoming Grades | Consolidated Grades |
  |---|---|---|
  | Component | `AdviserQueue.tsx` | `ConsolidatedGrades.tsx` |
  | Contract | `rds.adviser_queue(year)` | `rds.consolidated_grades(section, period)` |
  | One row is | one class **submission** | one **learner** |
  | Carries | status + custody timestamps + teacher | the computed period grade |
  | Marks? | **none, by design** | that is all it is |
  | Status? | that is all it is | **none** |
  | Scope | every advised class, whole year | one section, one period |
  | Writes? | yes — receive / forward / take back | no, read-only |

  So this was left as a naming fix and nothing was merged or restructured.

  **The distinction had already been decided and written down — just nowhere the
  adviser could see it.** `docs/20-assumptions-register.md` § "Closed: adviser had no
  way to see grades across subjects (27 Aug 2026)" states it exactly: Incoming Grades
  "only ever shows chain-of-custody status, never marks, by design — receiving a
  submission is acknowledging a hand-off, not reviewing it", which left the adviser
  with no answer to "has everyone in my section actually filed a grade, and what did
  they file", and migration 0030 plus the Consolidated Grades screen closed that. That
  sentence appeared in no screen, no tooltip and no menu. This change puts it in front
  of the person who needs it.

  **What changed.** Each screen's `page-sub` now says what it is, what it deliberately
  is **not**, and names the other one — matching how Academic Years explains its own
  boundary in its own copy. Consolidated Grades also states that a dash means "not
  filed yet, not a zero", which previously existed only as a hover `title` and is the
  main reason the screen reads as broken on first open, when every cell is a dash.
  Incoming Grades' empty state — exactly what the tester saw — now says the list can
  be empty while teachers already have grades entered, and points at the other screen.

  **Two defects surfaced on the way, both fixed.** (1) `AdviserQueue` was the only
  top-level destination in the app rendering as a bare `panel` with an `<h2>` while
  the other seventeen screens use `page` / `page-head` / `<h1 class="greeting">` — it
  presented as a fragment of some larger screen rather than as a destination. It now
  uses the same markup as `RegistrarQueue`, its opposite number in the chain. (2) The
  in-app **Help** guide told the adviser to "Check the grades, then sign for them" on
  the one screen that deliberately shows no grades. The adviser's four steps now read
  in sequence: see the hand-offs, open Consolidated Grades for the marks, go back and
  sign, then pass the section up.

  **Names kept, deliberately.** Renaming Incoming Grades (to "Incoming Submissions",
  say) was considered and rejected: "Consolidated Grades" is the legacy Record Book's
  own name, carried over on purpose (`docs/legacy-function-migration-map.md` § 10),
  and both labels appear in the principal demo checklist (`docs/28` step 7) that
  Joshua is about to walk. Renaming a screen out from under a checklist days before a
  demo trades one confusion for another. The labels are under-specified rather than
  wrong, and copy fixes that where a rename would only move it. If Joshua would still
  rather rename, the copy stands either way.

  **One relationship worth recording, because it is the sharpest illustration of the
  difference.** A grade appears on Consolidated Grades as soon as the subject teacher
  computes and saves it — which can be well before they submit. `rds.consolidated_grades`
  and the `period_grades_read_adviser` policy (migration 0030) filter on `is_current`
  and the period alone and never consult submission status, while `rds.adviser_queue`
  excludes `draft` outright. So a section can be full of marks on one screen and show
  nothing at all on the other. That is correct and useful — knowing who already has
  their marks in is exactly what an adviser chasing a term needs, and the custody
  queue cannot tell them.

  **A correction to this finding's own wording.** It says the question was raised "in
  both Advisory Teacher and Subject Teacher docs". The raw notes in the appendix below
  place it in the **Advisory Teacher doc only**; the Subject Teacher doc records "no
  new items" beyond what the adviser doc lists. That fits the code — neither screen is
  in the subject teacher's menu, so a subject teacher could not have seen either one.

  Covered by four new e2e checks (two in `custody-chain.mjs`, two in
  `consolidated-grades.mjs`) asserting the rendered copy, since a defect that is
  "the screen explains nothing" can only be caught by reading what the screen renders.

  The original finding, for the record: purpose/difference unclear to the tester.
  Naming/discoverability issue at minimum; possibly two screens doing overlapping
  jobs. Worth a clear written answer, not necessarily a rebuild.
- **Visual polish**: Analytics and LOA Reports described as "plain"/"eye irritating"
  in light ("Standard") theme, wants color; general "fix the UI" note on My Account
  across every role (likely spacing/alignment, not confirmed functional breakage).

### Added 2026-09-05 — two findings from live role editing in production

- **⚠️ Never leave `principal` as an account's only role — it locks the account
  out.** Confirmed live: setting an account to hold only `principal` produces the
  "No role assigned" screen, whose only control is *Sign out*. This is **not a new
  defect** — it is Known Issue #4 (`principal` exists in the database but has no
  client-side mapping) made concrete. The mechanism, traced in code:
  `ROLE_PRIORITY` in `app/src/nav.ts:273` lists five roles and does not include
  `principal`, so `rolesFromSession(['principal'])` returns `[]`, and
  `App.tsx:294` renders the no-role screen whenever `heldRoles.length === 0`
  outside DEMO_MODE. Nothing is corrupted — the database still grants `principal`
  seven real read permissions (`grades.read.all`, `students.read.all`,
  `attendance.read.all`, `classes.read.all`, `reports.read.school`,
  `school.config.read`, `audit.read`) — the client simply has no menu to render
  for it. **The operational hazard worth remembering:** a locked-out account
  cannot reach the Users screen to fix itself, so recovery needs a *second*
  account holding `school_admin`. Doing this to the only administrator account
  would leave no way back in through the UI. Recovering the owner account this
  way is exactly what happened on 2026-09-04 and it worked cleanly — see the
  audit trail note in that day's session log.
- ~~**Help shows identical content to every role.**~~ **RESOLVED 2026-09-05.**
  Help now orders itself by the signed-in role: the role's own guide renders
  first under a "Your guide" heading, the reference material follows, and
  everything belonging to other roles is still on the same screen below a
  "What the other roles do" heading. Nothing was deleted, hidden, or reworded —
  every step of every guide is byte-for-byte what it was. The ordering rule is
  a pure function, `helpPlan()` in `app/src/screens/Help.tsx`, unit-tested
  across all five roles (`Help.test.ts`), and `e2e/guide-and-exports.mjs`
  check 9 was rewritten to assert per-role ordering in a real browser — the old
  check asserted the teacher's steps lead for everyone, which was the defect,
  and would have kept passing against the fix. One question the fix had to
  settle: an adviser gets **both** their own four moves and the eleven teaching
  steps, their own first, because `ROLE_LABEL.adviser` is "Advisory Teacher",
  `nav.ts` builds the adviser menu as the whole teaching menu plus two items,
  and `App.tsx` gates class and roster editing on teacher and adviser alike —
  an adviser teaches. An Administrator gets the registrar's guide as theirs,
  since `school_admin` is the registrar menu plus School Setup, Academic Years
  and Users. The original finding, for the record:
  Confirmed by reading
  `app/src/screens/Help.tsx`: `export function Help()` takes no parameters at
  all, and the render is unconditional — the eleven-step subject-teacher guide,
  then all three short role guides (adviser, registrar, learner), then the
  reference material, to whoever opens it. The nuance worth recording is that
  this is a *documented deliberate choice*, not an oversight: the comment above
  the render (lines 266–271) reasons that since Help now sits in every role's
  menu, "a guide that describes only one of five jobs misleads the other four" —
  so the fix applied was to show everything rather than to filter. But the file's
  other comment (lines 117–129) sets a stricter standard the current render does
  not meet: a registrar who opens Help "and reads 'open your class and enter the
  scores' has been handed somebody else's job, which is worse than no guide at
  all." A registrar still lands on the teacher's eleven steps first and must
  scroll past all of them to reach their own four. That gap between the stated
  standard and the shipped behaviour is real, and role-filtering Help is the
  obvious answer — **but explicitly not this phase.** Do not implement without an
  instruction naming it. *(That instruction came on 2026-09-05; see the
  resolution note above. The answer turned out to be ordering rather than
  filtering, which keeps the "misleads the other four" reasoning intact.)*

---

## Already answered / by design — no action needed

- **Grading period defaults to Term 2, not Term 1.** Already investigated and
  confirmed correct in the Phase 2.2 academic-year audit: the selector resolves to
  whichever period has `status: active` (Term 2 currently), not "most recent" or a
  hardcoded value. Raised again here (Administrator doc) but not new.
- **"Academic Years — there should be an option for adding a year."** Deferred by
  design, and the screen now states why directly: creating a year decides the shape
  of everything downstream, and it's seeded at onboarding rather than edited live.
  Not a gap — a documented, intentional boundary.

---

## Needs a one-line clarification from Joshua before anyone acts on it

- **"School Setup — the overall UI and every section was messed [up]."** Reviewed the
  two referenced screenshots directly — the school-details form and the subjects
  table both render as ordered, aligned content, nothing visibly broken. What
  specifically looked wrong — a layout/overflow issue, a specific field, or a general
  density complaint?
- **Category dropdown on "Add subject."** Screenshot shows exactly two options — Core
  Subject (WW20/PT50/EX30) and MAPEH/EPP-TLE (WW20/PT60/EX20) — matching DO 015
  s.2026. Was the observation that this list should support more categories, or
  something else about how it renders?
- **Academic History shows "Taytay Rizal School" for a student not flagged as a
  transfer.** Could be real seed/fixture data doing exactly what it's supposed to for
  a different demo learner than expected, or a genuine display-logic issue. Needs the
  specific learner identified before it's actionable.
- ~~**"Why does Administrator have Grade Submissions?" / "Why does Registrar have
  Grade Submissions?"**~~ **ANSWERED 2026-09-07, and the answer is now on the screen.**

  **What it shows.** `RegistrarQueue.tsx` reading `rds.submission_queue(year)` — an
  *action* screen, not a read-only view. Every section an adviser has forwarded, with
  the class, teacher, period, a completeness figure (`scored/total`) and status, plus
  the five signatures that carry a record the rest of the way: **receive → approve →
  finalize → publish**, with **return** available throughout. Which buttons appear
  comes from the same transition table the database enforces
  (`app.assert_transition`, 0010); the database refuses anything else regardless.

  **The single most useful fact about it, previously written nowhere:**
  `rds.submission_queue` excludes `draft`, `submitted` **and** `received`
  (`0022_receipt_chain_and_recall.sql:486`). **Nothing reaches this screen until the
  adviser has forwarded it.** A registrar looking at an empty queue while teachers
  insist they have submitted is looking at records still sitting on the adviser's
  desk. That is now the second sentence of the screen's own copy.

  **Same component for both roles — verified, not assumed.** `nav.ts` defines the item
  once, in the `REGISTRAR` const, and `school_admin` is built as
  `[...REGISTRAR.filter(…), …administration]`, so it is literally the same object.
  `App.tsx`'s `case 'queue'` does not branch on role. Rendered side by side in a
  browser, the two roles' screens are **byte-identical** — same heading, same subtitle,
  same columns, same row count, same buttons.

  **Why the Administrator has it — decided, documented, and at the school's request.**
  `seed.sql` grants `school_admin` **every** permission (a bare
  `cross join public.permissions`, no filter), so it already held `grades.return`,
  `grades.approve`, `grades.finalize` and `grades.publish` before any menu offered
  them. `docs/20-assumptions-register.md` § "The administrator's reach" records the
  school's own words — *"administrator should have the same access as the registrar"*
  — and notes that the permissions were never the problem: **only the menu disagreed**,
  withholding Grade Submissions, Students and Academic Records from an account fully
  entitled to all three. Showing it was the fix, not the defect.

  **This is not the trio it looked like — it is three desks.** Three screens carry
  "submission" in their name and they are three different components, one per desk the
  record crosses:

  | Screen | Roles | Component / contract | It is |
  |---|---|---|---|
  | **Submissions** | teacher, adviser | `MyClasses` → class workspace Submission tab | your OWN classes, going out |
  | **Incoming Grades** | adviser | `AdviserQueue` / `rds.adviser_queue` | other teachers' work arriving for your section |
  | **Grade Submissions** | registrar, admin | `RegistrarQueue` / `rds.submission_queue` | what advisers have forwarded, and the last four signatures |

  Only the third carries `completeness` and `studentCount`; only the third can approve,
  finalize or publish. The adviser is the one role holding two of the three, which is
  why the adviser doc is where the confusion was recorded.

  **What changed.** The screen's `page-sub` was a bare counts line —
  *"0 awaiting review · 0 approved · 0 to publish"* — so it never said what it was for;
  the counts now sit on their own line beneath a real explanation. The heading read
  "Grade submissions" while the menu said "Grade Submissions", now matched. And in
  **Help**, an administrator's own guide was headed *"If you are the registrar"* —
  the app itself telling them they were looking at somebody else's job, which is a
  fair part of why the question got asked. It now reads *"If you are the registrar or
  the administrator"* and says plainly that an administrator holds everything a
  registrar holds. The registrar's Grade Submissions step also now names the
  forwarded-only rule.

  **⚠️ One thing this does NOT settle, and it is Joshua's call, not a naming fix.**
  An Administrator can approve, finalize **and** publish grades — the same account
  that configures the school. `docs/20` flagged exactly this when the access was
  widened: *"If ANHS later wants separation of duties — the person who publishes not
  being the person who configures — that is a policy decision to revisit, and the
  permission rows already support it."* If the testers' question was really *"should*
  an administrator have this?" rather than *"why does* it appear?", that is a live
  policy question, it is unchanged by this session, and the permission rows can
  express either answer. Nothing here pre-empts it.

  Covered by four new e2e checks — three in `subjects-and-admin.mjs` on the screen's
  rendered copy and heading, one in `guide-and-exports.mjs` on the guide heading.

  The original question, for the record: asked independently in two docs. Needs one
  real, code-level answer (what does that menu item actually show for each role — a
  submission action, or a read-only view of what's been submitted?), not a guess from
  either of us.

---

## Appendix — raw per-role notes (screenshots not reproduced; see original docs)

### Administrator
- Purpose of Grade Submissions on Administrator — full staff-level access, or unclear?
- Academic Records: not sorted by year/grade; defaults to Term 2 (see "already
  answered" above)
- Classes & Sections: not sorted; all subjects appear Grade-10-only
- Import menu: no specific observation recorded yet ("make some observations on this")
- Enrollment: only some grade levels display
- School Setup: "UI messed" (see clarification needed above); category dropdown note
- Academic Years: wants an add-year option (deferred by design)
- My Account: UI + save/password issue (see priority list above)

### Registrar
- Dashboard: purpose/content unclear
- Registrar menu: same Grade Submissions question as Administrator
- Students: no specific observation recorded yet
- Academic Records / Classes & Sections: not sorted by year/section
- Enrollment: dropdown/list display questioned
- My Account: UI + password issue

### Advisory Teacher
- Dashboard / My Classes / Attendance / Reports: not sorted by grade year + section
  (teacher may hold classes across more than one grade/section, not just one)
- Students: sorted by grade already — the one screen called out as good, just wants
  full alignment polish
- Incoming Grades: no data available to test yet; purpose vs. Consolidated Grades
  unclear
- Consolidated Grades: same naming/purpose question
- Submissions: purpose question + wants undo/cancel + clearer ack-status workflow
  (see backlog above)
- Analytics: UI fix + sorting; color suggestion for light theme
- LOA Reports: wants visual design pass, described as plain/text-heavy
- My Account: "fix the UI"

### Subject Teacher
- Same observations as Advisory Teacher across Dashboard, My Classes, Students,
  Attendance, Submissions, Analytics, LOA Reports, Reports, Import, and Account —
  no new items beyond what's listed under Advisory Teacher above.

### Student
- Dashboard: wants sorting by term + a history view
- My Profile: **name mismatch** (see priority list above)
- My Schedule: confirmed correct, no issue
- Academic History: Taytay Rizal School entry questioned (see clarification needed)
- My Account: same UI/password issue as other roles
