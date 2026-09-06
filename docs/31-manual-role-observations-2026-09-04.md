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
- **Grade submission workflow gaps** (Advisory Teacher doc): once submitted, no way
  to undo/cancel before the registrar acknowledges; no visible distinction between
  "submitted, awaiting acknowledgment" and "acknowledged" (only after which it should
  become truly locked, reversible only by registrar rejection). Real workflow-design
  request, not a bug.
- **"Incoming Grades" vs "Consolidated Grades"** — purpose/difference unclear to the
  tester in both Advisory Teacher and Subject Teacher docs. Naming/discoverability
  issue at minimum; possibly two screens doing overlapping jobs. Worth a clear written
  answer, not necessarily a rebuild.
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
- **"Why does Administrator have Grade Submissions?" / "Why does Registrar have Grade
  Submissions?"** — asked independently in two docs. Needs one real, code-level answer
  (what does that menu item actually show for each role — a submission action, or a
  read-only view of what's been submitted?), not a guess from either of us.

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
