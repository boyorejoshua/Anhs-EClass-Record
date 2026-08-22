# Trimester Adaptation

*Phase 18. How legacy quarter assumptions were removed.*

---

## The problem

The legacy system is built on four quarters, and says so everywhere:

```js
cd.grades[q][name]                       // q ∈ 1..4
cd.hps[q]                                // per-quarter config
<option value="1">Q1</option> … Q4       // hard-coded markup
[1,2,3,4].map(qq => calcQ(s.name, qq))   // "all quarters" analytics
`Quarter ${q}`                           // labels
```

ANHS moved to **three trimesters** under DO 009 s.2026. A direct port
would have been wrong on the day it shipped.

---

## The rule applied

> No migrated feature may know how many periods exist, what they are
> called, or what order they come in.

Everything is keyed by `academicYearId` and `periodId`. The count, names,
short names and dates are rows in `academic_periods`, read at runtime.

| Legacy | New |
|---|---|
| `q` (1–4) | `periodId` (uuid) |
| `Q1`…`Q4` literals | `period.name` / `period.shortName` from the row |
| `cd.hps[q]` | `assessments` filtered by `academic_period_id` |
| `[1,2,3,4].map(...)` | `year.periods.map(...)` |
| Four `<option>`s | Rendered from `year.periods` |
| "Quarterly Assessment" | The component the scheme defines |

---

## How it is proven, not asserted

The seed carries **two tenants with different structures**:

| School | Structure | Periods |
|---|---|---|
| Angono NHS | `trimester` | Term 1 · Term 2 · Term 3 |
| Mendtrix Demo NHS | `quarter` | First … Fourth Quarter |

The same build renders three tabs for one and four for the other, with
no code path between them. Signing in as `teacher@demo.test` and seeing
four quarters is the check.

`academic_years.period_structure` accepts `quarter · semester ·
trimester · custom`, and nothing in the frontend branches on its value —
it is descriptive, not behavioural. A school on a structure nobody has
thought of yet works by inserting rows.

---

## Where a quarter assumption legitimately survives

**SF10-JHS prints four quarterly rating columns.** The form predates the
three-term calendar, and a learner's record can now span both regimes —
the seed includes exactly that case, a learner transferring in from a
four-quarter school.

`rds.sf10_jhs` therefore returns `periods` as an **ordered array**, not
fixed `q1..q4` keys, and the template prints exactly the periods the year
declares, hatches the unused column and shows a visible note. It does not
average, stretch or back-fill: a value invented for an unused box would
be a fabricated grade on a legal record.

Registered as **F11** in `docs/20-assumptions-register.md`, pending a
division-office answer.

---

## What was NOT carried across

Legacy Analytics has an "All Quarters" mode (`q === 0`) that averages
four quarterly grades and requires all four to exist.

Not migrated as-is, for two reasons: it hard-codes four, and it needs
stored period grades, which nothing currently writes. A cross-period view
is deferred until `period_grades` is materialised — see
`docs/21-functional-optimization-audit.md` §4.

---

## Verifying it stays true

```
grep -rniE "\b(q1|q2|q3|q4|quarter [1-4])\b" app/src --include=*.ts --include=*.tsx
```

Legitimate hits only: comments explaining the legacy shape, the SF10
four-column note, and the demo tenant's own period *names* — which are
data, not logic.
