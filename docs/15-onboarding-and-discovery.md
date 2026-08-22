# 15 — School Onboarding & Discovery

*Covers Parts 29 and 30 of the audit brief.*

---

## PART 29 / 36 — The onboarding process

The process in the brief is sound. Six improvements make it repeatable and protect margin:

1. **Qualify before discovery.** A short screening call prevents spending two days on a school that will not buy or is not ready. Discovery is expensive.
2. **Split discovery into two sessions.** One with leadership (decision, budget, timeline), one with the registrar and two teachers (how the work actually happens). These are different conversations and combining them means the operational detail gets crowded out by the commercial one.
3. **Make data collection a gated step with a checklist.** Missing files are the most common cause of a stalled implementation. Nothing proceeds until the checklist is complete.
4. **Add written data-verification sign-off.** The school confirms the migrated data is correct. Without this, every later data question becomes a Mendtrix problem.
5. **Run a limited pilot before full rollout**, not training-then-go-live. Detail in [12 MVP & Roadmap](12-mvp-and-roadmap.md).
6. **Add a formal handover.** Explicit transition from implementation to support, with a named contact and a documented escalation path on both sides.

### The process

```
┌─ SALES ──────────────────────────────────────────────────┐
 0.  Qualification call                    30 min
 1.  Discovery — leadership                 1 hr
 2.  Discovery — registrar + teachers       2 hr
 3.  Proposal and agreement                 —
└──────────────────────────────────────────────────────────┘
┌─ IMPLEMENTATION ─────────────────────────────────────────┐
 4.  Data & document collection  ★ GATE     1–2 wk (school-paced)
 5.  Workflow mapping and sign-off          2 days
 6.  Tenant provisioning and configuration  2 days
 7.  Data migration — dry run               2–3 days
 8.  Data verification  ★ SIGN-OFF          school-paced
 9.  Data migration — production            1 day
10.  Template authoring                     1–3 days
11.  Account creation and distribution      1 day
12.  UAT with registrar and 2–3 teachers    3–5 days
└──────────────────────────────────────────────────────────┘
┌─ ROLLOUT ────────────────────────────────────────────────┐
13.  Teacher training                       2 × 2 hr
14.  Limited pilot — one grade level        1 grading period
15.  Pilot review and remediation           1 wk
16.  Full deployment                        at a term boundary
17.  Hypercare — daily contact              2 wk
18.  Handover to support                    —
└──────────────────────────────────────────────────────────┘
┌─ ONGOING ────────────────────────────────────────────────┐
19.  Support, DepEd policy updates, annual renewal
└──────────────────────────────────────────────────────────┘
```

### Timing is a hard constraint, not a preference

**Steps 14 and 16 must land on term boundaries.** A school cannot change grading systems mid-term — teachers would have partial records in two systems and the period could not be closed in either.

Working backwards from the two anchor dates in [README](README.md):

| Target | Work must start by |
|---|---|
| Term 3 pilot, 4 Jan 2027 | Implementation begins **early November 2026** |
| SY 2027–2028 full deployment, ~June 2027 | Implementation begins **March 2027** |

Miss a boundary and the next opportunity is months away. Build the calendar backwards from it in every proposal.

### Where the effort actually goes

| Step | Typical effort | Note |
|---|---|---|
| Discovery | 3–4 hrs | |
| Data collection | Low for Mendtrix, **slow for the school** | The usual bottleneck |
| **Data cleaning** | **2–4 days** | ⚠️ **The real cost centre.** Inconsistent sections, duplicate learners, missing birth dates, names spelled three ways |
| Configuration | 2 days | Faster each school |
| Template authoring | 1–3 days | Much faster from the second DepEd school onward |
| Training | 4 hrs + materials | Reusable |
| Pilot support | 1–2 hrs/day for 2 weeks | |

**First school: 4–6 weeks elapsed, ~15 working days of effort. By the fourth DepEd school: ~8 working days**, as templates, mapping profiles, and training materials become reusable. That curve is the business model — and it only materialises if Tier 4 customisation stays near zero ([14 School Configuration Matrix](14-school-configuration-matrix.md)).

---

## PART 30 / 37 — School Discovery Questionnaire

Used across sessions 1 and 2. Answers feed directly into configuration and into [20 Assumptions Register](20-assumptions-register.md).

⚖️ marks a question whose answer may carry legal or compliance weight.

### A. School profile

1. Full official school name, and the name as it should appear on documents?
2. Government school ID?
3. Region, division, district?
4. Public, private, or other?
5. Grade levels offered? SHS tracks and strands?
6. Total learners, by grade level?
7. Total teaching staff? Non-teaching staff who need access?
8. How many sections per grade level? Average section size?
9. Is this one campus or several?
10. Who decides on a purchase like this? Who else must approve?

### B. Academic structure

11. Quarters, semesters, trimesters, or something else?
12. How many grading periods per year, and what are they called locally?
13. Start and end dates of the current and next school year?
14. Period start and end dates?
15. Expected class days per period?
16. How are holidays and class suspensions tracked today?
17. Do all grade levels use the same period structure? *(SHS often differs)*

### C. Grading

18. Component weights currently used, by subject group? *(Expect DO 015: 20/50/30 core, 20/60/20 MAPEH and EPP-TLE — confirm rather than assume)*
19. How many assessments per component per period, typically?
20. Is the Examinations component subdivided (ST1 / ST2 / Term Exam)?
21. Which transmutation table is in use? **Can we have a copy?**
22. Passing grade?
23. Rounding rule, and at which stage?
24. How is the final grade computed across periods — simple mean or weighted?
25. Descriptor bands and their labels?
26. How are Incomplete, Dropped, and Exempted handled?
27. Promotion rules — general average threshold, must all subjects pass, remediation?
28. **Are you aware of the SY 2027–2028 zero-based grading change, and how are you planning for it?** *(a strong opening — most schools are not)*

### D. Teacher workflow

29. Walk us through how a teacher records grades today, start to finish.
30. **Can we have a copy of a blank class record file, and a filled one?**
31. Who creates that file — the teacher, or is it issued centrally?
32. How does a teacher submit grades? To whom? In what format?
33. What are the deadlines, and what happens when one is missed?
34. Who chases missing submissions, and how much time does that take?
35. How are corrections handled after submission?
36. Do teachers keep their own separate records as well? *(Ask directly — the answer is usually yes, and it is the behaviour we must displace)*
37. What device does a teacher use? Personal or school-issued?
38. Where do teachers work on grades — school or home?

### E. Attendance

39. Who records attendance — advisers, subject teachers, or both?
40. Daily, per subject, or both?
41. What statuses are used beyond present and absent?
42. How is attendance reported, and how often?
43. **Can we have a copy of your attendance forms?**
44. How is the expected-days denominator determined?

### F. Registrar workflow

45. Walk us through what happens after teachers submit.
46. Who reviews? What are they checking for?
47. Who approves? Is there a second approver?
48. How are grades consolidated across subjects today?
49. How long does consolidation take per period? *(Capture the number — it is the strongest line in the proposal)*
50. How are report cards produced today?
51. How are permanent records (SF10) produced and stored?
52. What happens when a learner transfers in or out?
53. How are historical records retrieved? How long does it take?
54. What is the most time-consuming part of your term?

### G. Forms and documents

55. **Which SF forms do you actually file? Can we have blank copies and filled samples of each?**
56. Do you use any school-specific forms not in the SF series?
57. Have you customised any standard form?
58. Who signs each document? What are their exact titles?
59. Is there a document numbering convention? ⚖️
60. What is printed versus kept digitally?
61. Print volumes per period?
62. Paper size and any printing constraints?
63. Are digitally generated forms accepted by your division office? ⚖️

### H. Students and data

64. Do all learners have an LRN? What proportion do not?
65. **Can we have a copy of your current learner list?**
66. What learner information do you hold beyond name and LRN?
67. Do you hold guardian contact details? How current are they?
68. How many years of historical records exist, and in what form?
69. Do you want historical records migrated? How many years back?
70. Is there any existing school system we would need to work alongside?

### I. Student portal

71. Do you want learners to have online access to their grades?
72. Should learners see attendance? ⚖️
73. Should learners see prior years?
74. Should learners see their general average?
75. Should learners be able to download documents?
76. Do learners have email addresses? Do they have smartphones?
77. **How would you feel about issuing login credentials to learners?** ⚖️
78. Is guardian consent needed for a learner account? ⚖️
79. When should grades become visible — immediately on approval, or on a set release date?

### J. Parent access

80. Do parents ask for grade access today? How is it handled?
81. Would a parent portal be valuable, and when?
82. How do you currently verify who a learner's guardian is? ⚖️

### K. Infrastructure

83. Is there reliable internet in the faculty room? The registrar's office? Classrooms?
84. Typical speed, and how often does it go down?
85. Do teachers have internet at home?
86. What devices are available — school computers, personal laptops, phones?
87. Is there IT support on staff?
88. Any existing systems, and would data need to move between them?

### L. Privacy and governance ⚖️

89. Do you have a designated Data Protection Officer? ⚖️
90. Is your data processing system registered with the NPC? ⚖️
91. What consent do you currently obtain from parents regarding learner data? ⚖️
92. Are there DepEd requirements for third-party systems we should know about? ⚖️
93. Any expectation that data is stored in the Philippines? ⚖️
94. How long must academic records be retained? ⚖️
95. Who at the school would own access control?

### M. Commercial

96. Is there budget allocated, and from which fund?
97. **What is your procurement process for a service like this?** ⚖️ *(Critical for public schools — see [16 Commercialization](16-commercialization.md))*
98. Who signs the agreement?
99. What is your target timeline?
100. What would make this a clear success in your first year?
101. What is your biggest concern about moving off Excel?
102. Has the school tried something like this before? What happened?

> Question 102 is worth asking early. A school with a failed previous attempt has specific scars, and knowing them changes the whole approach.

---

## Data & document collection checklist

Step 4 does not close until every applicable line is ticked.

**Data**
- [ ] Learner list, all grade levels, current year
- [ ] Teacher/staff list with positions
- [ ] Section list with advisers
- [ ] Subject list per grade level
- [ ] Teaching-load assignments
- [ ] Guardian contacts *(if a parent portal is wanted)*
- [ ] Historical grades *(if migration is in scope)*

**Documents**
- [ ] Blank class record template
- [ ] Filled class record sample
- [ ] Blank copies of every SF form used
- [ ] Filled samples of every SF form used
- [ ] Report card, blank and filled
- [ ] Attendance forms
- [ ] Any school-specific form
- [ ] Transmutation table
- [ ] Written grading policy, if one exists
- [ ] School logo, high resolution
- [ ] Letterhead

**Sign-offs**
- [ ] Workflow map confirmed by the registrar
- [ ] Configuration confirmed by the administrator
- [ ] **Migrated data verified in writing by the school**
- [ ] Templates confirmed against printed originals — side by side, on paper
- [ ] UAT sign-off

---

## Training

**Teachers — 2 hours, hands-on, in groups of 10–15**
Login and orientation (15 min) · finding your classes (10) · **encoding, hands-on with real data — the bulk of it** (45) · attendance (15) · submitting and what happens next (15) · corrections and returns (10) · questions (10).

Two rules: everyone touches a keyboard, and the session uses **their own real classes**, not demo data. A teacher who has entered one real assessment leaves believing it works.

**Registrar — 2 hours, one-to-one**
Dashboard and queue · reviewing and returning · approving, finalizing, publishing · report card generation · student records and history · audit log · what to do when something looks wrong.

**Administrator — 1 hour**
Configuration · users and roles · monitoring · year rollover.

**Leave behind:** a one-page teacher quick reference (the keyboard shortcuts matter most), a registrar workflow card, in-app help, and a named support contact. V0's in-app guide (`renderInstructions`, `main.js:1100`) is good source material and should be ported rather than rewritten.
