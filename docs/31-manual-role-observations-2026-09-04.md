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

- **Sort/group by Grade Year + Section.** By far the most repeated note — independently
  raised on Dashboard, My Classes, Students, Attendance, Academic Records, Classes &
  Sections, Submissions, Analytics, and Reports, across Administrator, Registrar,
  Advisory Teacher, and Subject Teacher docs. Currently these render as flat lists.
  Well-corroborated, cross-cutting, but a UI change across many screens — a
  right-sized future phase on its own, not a fold-in.
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
