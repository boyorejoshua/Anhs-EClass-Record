# Record Book — Functional Specification

*What the Record Book is, tab by tab, and what each one is allowed to do.*

The legacy Record Book is one screen with six sub-tabs and is where a
teacher spends their term. It is reproduced here as a grouped run of tabs
inside the Class Workspace, on the new period architecture.

```
Class → Record Book →  Setup · Grade Entry · Summary · Analytics · LOA
```

Bulk Entry is absent as a tab **on purpose**: in the legacy system it was
a separate page; here it is a mode of the grid (paste a block from
Excel), and a second screen would be a worse version of a feature that
already exists.

Every tab operates on the **currently selected `periodId`**. Nothing
assumes four quarters, three terms, or any particular count.

---

## Setup

**Who** Teacher of the class · **When** Start of a period · **Writes** `assessments`

Reads the class's grading scheme and renders one section per leaf
component — so a core class shows Written Works / Performance Tasks /
ST1 / ST2 / Term Exam, and a MAPEH class shows its own weights, without
the screen knowing either.

Per item: an ordinal (`WW1`, `WW2`, …), an optional title, and a highest
possible score.

**Rules**
- Highest possible score must be > 0; > 1000 is flagged as a likely typo
- At least one assessment before saving
- An item that already has marks cannot be removed — the button is
  disabled and the reason is given
- The whole screen is read-only once the period is submitted

**Header fields are NOT editable.** School, teacher, subject, section and
school year were free text on the legacy record book; here they are
relationships. Letting a teacher retype the school year onto one class is
how the legacy file ended up with three spellings of the same section.

**RPC** `public.save_assessments(class, period, jsonb)` — refuses a
non-editable period, refuses to delete a scored assessment, writes an
audit row.

---

## Grade Entry

Unchanged by this phase. Keyboard model, paste from Excel, debounced
autosave, dirty tracking, retry without loss, gaps filter, excused state,
locked state, mobile cards.

---

## Summary

**Reads only.** One row per learner:

| Learner | *per component:* PS · WS | Initial | Grade | Remark |

- Components come from the scheme; a component tree is summarised at the
  parent, because that is the line the DepEd form carries
- Descriptor and remark come from the scheme's own descriptor bands
- "Needs attention only" filters to gaps or below-pass
- CSV export
- Clicking a learner opens **Student Detail**

---

## Student Detail

One learner, this class, this period: the component table with raw
totals, PS, weight and weighted score; then every assessment with its
mark, maximum, and status (Recorded · Missing · Excused · Over limit).

Identity is `classEnrollmentId → enrollment → student`. The legacy
version keys on the learner's **name**, so two learners called *Santos,
Maria* share one record. A rename here is a display change and nothing
else.

Attendance and prior years are deliberately **not** shown — a subject
teacher sees this class and this period. The wider record is the
registrar's, under Students → Academic Records.

---

## Analytics

Computed from stored scores, never fabricated.

Class size · average · highest · lowest · passing · failing · missing
scores · completion %

Plus grade distribution (96–100 / 91–95 / 86–90 / 81–85 / 76–80 / 75 /
below 75), mean percentage score per component, and a **needs attention**
list with a reason per learner.

**Divergences from legacy**
- Pass/fail counted against `scheme.passMark`, not a literal 75
- A learner with nothing entered is excluded from the average rather than
  counted as zero — otherwise the class average falls as the roster grows
- Completion is measured in **cells**, not learners

⚠️ The distribution bands are transcribed from the legacy report, not
from a DepEd issuance. A school that groups differently needs them
configurable.

---

## LOA — Level of Achievement

> ⚠️ **LOA is Level of Achievement, not Leave of Absence.** It is
> computed from grade entries and has no attendance component. The
> legacy module contains zero attendance references.

One section per component, banding each learner's percentage score:

| Band | Range |
|---|---|
| Highly Proficient | 90–100% |
| Proficient | 75–89% |
| Nearly Proficient | 50–74% |
| Low Proficient | 25–49% |
| Not Proficient | 0–24% |

Each shows count and percentage **of the whole class**, so learners
without a score are visible as a gap rather than silently dropped.

Then the period-grade distribution, banded by the **scheme's own
descriptors** — not a second hard-coded scale.

CSV export and a print stylesheet, because this report is filed on paper.

⚠️ The thresholds are legacy-derived. The legacy UI and its Excel export
label the same numbers differently ("Exceptional / Exceeds Expectations …"
on screen, "Highly Proficient / Proficient …" in the workbook); the
workbook wording is used here because that is the artifact that leaves
the school. Confirm with the division office before filing.

**Not carried across:** the Diagnostic Test section (`cd.diag` — items,
highest, lowest, MPS). It is a pre-test the schema has nowhere to store,
and adding a table for an unvalidated report section is the wrong order
of operations.

---

## Data flow

```
assessments  ──┐
               ├──►  rds.gradebook(class, period)  ──►  compute()  ──┐
assessment_scores ─┘                                                 │
                                                                     ▼
                                       summaryRows() ──► Summary · Student Detail
                                                    └──► analytics() ──► Analytics
                                                    └──► loaReport() ──► LOA
```

One round trip per class+period. Summary, Analytics and LOA all derive
from the same payload the gradebook already loaded — no extra queries,
and no chance of the three disagreeing.

⚠️ These figures are computed in the browser and **not stored**. Nothing
writes `period_grades`, so the student portal has no number to show even
after publication. That is the top deferred item in
`docs/21-functional-optimization-audit.md` §4, and it needs an Edge
Function running the shared engine — not a second implementation in SQL.
