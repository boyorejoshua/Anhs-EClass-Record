# Global Reporting Architecture

*Analytics and LOA, reachable without opening a class first.*

---

## The rule

> **There is no global Analytics calculation and no global LOA
> calculation, because there is no second calculation at all.**

The global pages render the *same React components* the class-workspace
tabs render. Not the same logic re-called — the same component:

```
Analytics  →  ReportPicker  →  RecordBookAnalytics   ← the workspace tab
LOA        →  ReportPicker  →  RecordBookLoa         ← the workspace tab
```

If these ever disagreed with the tab, it would be because the same
function was handed different data — never because two functions exist.
The e2e suite asserts exactly that: it reads every numeric cell from both
paths and compares them element by element.

---

## What the global entry points actually add

One thing: a way in that does not start with "open a class".

| | Class workspace tab | Global page |
|---|---|---|
| How you get there | Open a class, pick a tab | Click Analytics / LOA Reports |
| Which class | Implied by where you are | Chosen from a list |
| Which period | The header's period selector | The page's own picker |
| What renders | `RecordBookAnalytics` / `RecordBookLoa` | **the same** |

The workspace tabs are untouched. A teacher already inside a class should
not have to come out to see its analytics.

---

## `ReportPicker`

Year → Grading period → Class, then hand over.

**The period list is configuration, not a constant.** It comes from the
chosen year's `periods`. Nothing in the picker knows how many periods a
year has or what they are called — a three-term year offers three, a
four-quarter year offers four, and neither is written down anywhere in
this file. That is what makes it survive the next calendar change.

Two behaviours worth naming:

- **Switching year clears a stale period or class.** Rendering a report
  for a combination the user never picked is worse than rendering
  nothing.
- **Each class option names its section AND its subject** —
  `Grade 10 – Pearl · Mathematics 10` — in one flat list rather than
  grouped under section headings. Grouping reads better while the list is
  open, but a native `<select>` shows only the chosen option once closed,
  and a teacher with "Mathematics 10" in two sections then cannot tell
  which they picked.

  ⚠️ That ambiguity is not hypothetical. It made the two Analytics
  reports disagree during testing — 36 values against 40 — and **the
  reports were right**: the picker and My Classes had opened different
  classes. The fix was to make the option self-describing, and the test
  now pins both paths to the same class id.

---

## The header's period selector stands down

A page carrying its own year and period picker also inherited the
header's "Grading period" control, which does nothing there. Two controls
with the same label on one screen is worse than none — a teacher changes
the wrong one and concludes the report is broken.

`CARRIES_OWN_PERIOD` in `App.tsx` names the routes where the header's
control is not rendered. Not `hidden`: not rendered, so it is absent from
the accessibility tree too.

---

## LOA is a cohort report, and stays one

Global LOA covers **every section of that subject the teacher carries**,
exactly as the filed sheet does — `getLoaCohort` gathers them and RLS
decides the cohort. So picking *Grade 10 – Pearl · Mathematics 10* and
*Grade 10 – Diamond · Mathematics 10* produces the **same report**, which
is correct and was independently confirmed by the e2e run: both paths
produced 198 identical values.

Analytics is per-class and does not behave this way.

---

## Verification

`e2e/global-reports.mjs` — 15 checks in Chromium:

- both entries are in the main navigation
- the header's period selector stands down on these routes
- the period list is `Term 1 / Term 2 / Term 3`, from the year config
- nothing renders until a class is chosen
- **global and contextual Analytics agree exactly** (element by element)
- **global and contextual LOA agree exactly** (element by element)
- the class workspace still has both of its own tabs

---

## Not built

A cross-class or whole-cohort Analytics view — "how is Grade 10 doing
overall" — does not exist. `analytics()` is per-class by construction.
That is a new report with its own definition, not a wider selector, and
inventing one without the school's sign-off would be guessing at what it
should mean.
