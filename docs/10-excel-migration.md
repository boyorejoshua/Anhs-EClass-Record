# 10 — Excel Import & Data Migration

*Covers Part 21 of the audit brief.*

---

## Why this matters commercially

Migration is not a technical convenience. It is the difference between a sale and a stall.

A school with 1,500 learners will not adopt a system that requires re-typing 1,500 learner records, plus teachers, plus sections, plus subjects. The manual entry cost alone exceeds the perceived benefit, and the project dies during setup — before anyone has seen the product work.

Two consequences:

1. **Import quality is a sales asset.** "We will have your learner data in the system in a day" is a stronger pitch than most feature lists.
2. **Import is where implementation cost lives.** It is the reason the commercial model in [16 Commercialization](16-commercialization.md) charges an implementation fee. Underprice this and every deployment loses money.

A useful reframe for the sales conversation: **Excel does not go away — it changes role.** It stops being the system of record and becomes the on-ramp and the off-ramp. Teachers who love spreadsheets keep using them; the data just lands somewhere durable.

---

## The pipeline

```
Upload file
     ↓
Detect sheet & header row
     ↓
Map columns  →  saved as a reusable mapping profile
     ↓
Validate  (structural → referential → business rules)
     ↓
Preview:  ✅ will import   ⚠ warnings   ❌ blocked
     ↓
Resolve  (fix in-app, or fix the file and re-upload)
     ↓
Confirm  →  transactional commit
     ↓
Import report  (persisted, downloadable, auditable)
```

**Design rules:**

- **Never partially commit.** A batch succeeds or rolls back entirely. Half-imported learner data is worse than none, because nobody knows what is missing.
- **Never guess.** Ambiguity surfaces to the operator; the system does not decide that "M. Santos" and "Maria Santos" are the same person.
- **Always dry-run first.** Preview is mandatory, not skippable.
- **Always produce a report.** Persisted to `import_batches`, downloadable, and referenced from the audit log.

---

## Import types

| Type | Priority | Source | Notes |
|---|---|---|---|
| **Student roster** | **MVP** | School's enrollment list | The one that unblocks everything |
| **Teacher / staff** | **MVP** | HR or the school's personnel list | Creates accounts and profiles |
| **Sections & subjects** | **MVP** | Curriculum documents | Usually small enough to type, but import saves an afternoon |
| **Class assignments** | **MVP** | Teaching-load sheet | Which teacher teaches what to whom |
| **Current-period scores** | Phase 2 | Teachers' live class records | For mid-year adoption |
| **Historical final grades** | Phase 2 | Prior-year records | Needed for SF10 completeness |
| **Attendance history** | Phase 2 | Prior attendance sheets | Lower value; often not worth migrating |
| **Guardian details** | Phase 2 | Enrollment forms | Prerequisite for a parent portal |

> **Recommendation on history.** Migrate *final grades* for prior years, not raw component scores. Final grades are what SF10 and academic history need; component scores from previous years are rarely needed again and multiply the migration effort several-fold for little benefit. Offer full component migration as a priced option if a school insists.

---

## Column mapping

School spreadsheets never match a fixed template, and demanding they do shifts the work back onto the customer.

**Approach: flexible mapping with saved profiles.**

```
Detected in file            →   Maps to
─────────────────────────────────────────────────────
"LEARNER'S NAME"            →   [ Full name ▾ ]  ⚙ split rule
"LRN"                       →   [ LRN ▾ ]
"SEX"                       →   [ Sex ▾ ]  ⚙ M/F → male/female
"BIRTHDAY"                  →   [ Date of birth ▾ ]  ⚙ DD/MM/YYYY
"ADDRESS"                   →   [ Barangay ▾ ]
"CONTACT NO."               →   [ Guardian contact ▾ ]
"REMARKS"                   →   [ — ignore — ▾ ]
```

- Auto-suggest by header similarity, with the operator confirming
- Per-column transform rules: name splitting, date format, value mapping, whitespace and case normalisation
- **Save the mapping as a named profile** — the same school's file next year imports in one click, and a profile that works for one DepEd school usually works for the next. This is a direct multiplier on implementation efficiency across customers.

### The name-splitting problem

The most common real-world mess. A single `LEARNER'S NAME` column arrives as any of:

```
DELA CRUZ, JUAN MIGUEL P.
Juan Miguel P. Dela Cruz
DELA CRUZ JUAN MIGUEL PEREZ
```

Compound Filipino surnames (`Dela Cruz`, `De los Santos`, `San Juan`) break naive splitting, and getting a learner's legal name wrong on an official document is not a small error.

**Approach:** offer the common split patterns, apply the chosen one, then **show the parsed result in the preview for every row** and let the operator correct outliers before committing. Do not silently split 1,500 names and hope.

---

## Validation

### Level 1 — Structural (blocking)

| Check | Failure |
|---|---|
| Required column mapped | ❌ Cannot proceed |
| Value present in a required field | ❌ Row blocked |
| Data type correct | ❌ Row blocked |
| Date parses under the chosen format | ❌ Row blocked |
| Number within range | ❌ Row blocked |

### Level 2 — Referential (blocking)

| Check | Failure |
|---|---|
| Section exists, or is being created in the same batch | ❌ Row blocked |
| Grade level exists | ❌ Row blocked |
| Subject exists in the catalogue | ❌ Row blocked |
| Teacher exists or is in the batch | ❌ Row blocked |
| Academic year is open | ❌ Batch blocked |

### Level 3 — Business rules (mostly warnings)

| Check | Response |
|---|---|
| Duplicate LRN in the file | ❌ Blocked — unambiguous data error |
| LRN already exists in the system | ⚠ Warning → offer update-vs-skip-vs-create |
| Similar name already exists | ⚠ Warning → show side by side, operator decides |
| LRN missing | ⚠ Warning → import allowed; learners legitimately arrive without one |
| LRN format unexpected | ⚠ Warning |
| Birth date implies an unusual age for the grade level | ⚠ Warning |
| Section over capacity | ⚠ Warning |
| Score exceeds the assessment maximum | ❌ Blocked |
| Grade outside the valid scale | ❌ Blocked |
| Duplicate section name | ⚠ Warning → merge or rename |

**The blocking/warning split is the crux of a usable importer.** Too strict and real data never passes — schools genuinely have learners without LRNs and typos in birth dates. Too lenient and the database inherits the spreadsheet's problems, which defeats the purpose. The rule: **block on things that are unambiguously wrong, warn on things that are merely unusual.**

---

## Preview

```
┌───────────────────────────────────────────────────────────────┐
│  Import preview — students_g9.xlsx                            │
│  ✅ 142 ready    ⚠ 6 warnings    ❌ 3 blocked                 │
├───────────────────────────────────────────────────────────────┤
│ Row │ Name              │ LRN         │ Section │ Status      │
├─────┼───────────────────┼─────────────┼─────────┼─────────────┤
│  12 │ DELA CRUZ, Juan M.│ 12345678901 │ Pearl   │ ✅ New      │
│  13 │ SANTOS, Maria     │ —           │ Pearl   │ ⚠ No LRN    │
│  14 │ REYES, Ana        │ 10987654321 │ Pearl   │ ⚠ Exists →  │
│     │                   │             │         │   [Update]  │
│     │                   │             │         │   [Skip]    │
│  15 │ CRUZ, Pedro       │ 12345678901 │ Diamond │ ❌ Duplicate│
│     │                   │             │         │   LRN (r.12)│
└───────────────────────────────────────────────────────────────┘
        [ Download error report ]   [ Import 148 rows ▸ ]
```

**Requirements:**

- Every row visible and paginated — no "3 errors found" without saying which
- Errors quote the source row number so the operator can find it in their file
- Downloadable error report as a spreadsheet, in the **same shape as the input** so the operator can fix and re-upload
- Per-row resolution for warnings, plus bulk apply ("update all existing")
- An accurate count before commit

---

## Commit & reporting

**Transactional.** The whole batch in one transaction. Any unhandled failure rolls back completely.

**Idempotency.** Re-uploading the same file must not duplicate. Matching precedence:

```
1. LRN, if present and valid
2. Existing student_number
3. Exact name + birth date
4. Otherwise → treated as new, operator confirms
```

**The import report** — persisted to `import_batches`, downloadable, linked from the audit log:

```
Import #1043 — Student Roster
File          students_g9.xlsx (148 KB)
By            registrar@school · 12 Nov 2026 14:32
Duration      4.2s

Rows read     151
Created       142
Updated         6
Skipped         0
Failed          3

Warnings resolved
  3 × missing LRN — imported without
  3 × existing learner — updated

Failures
  Row 15 — duplicate LRN 12345678901 (conflicts with row 12)
  Row 88 — invalid birth date "31/02/2010"
  Row 91 — section "Emerald" does not exist
```

---

## Migration as an implementation service

Import tooling makes migration *possible*. A repeatable process makes it *profitable*. This is the workflow the implementation team follows, and it is step 6 of [15 Onboarding & Discovery](15-onboarding-and-discovery.md).

```
1. Collect       Every relevant file from the school, as-is
2. Assess        What exists, what is missing, what is inconsistent
3. Clean         Iterate with the school on obvious data problems
                 ★ this is where the time goes, not the import itself
4. Dry run       Import into a staging tenant; produce the error report
5. Review        School verifies a sample against their own records
6. Commit        Import into production
7. Verify        Counts reconciled with the school's own figures
8. Sign off      School confirms in writing that the data is correct
```

**Step 3 is the honest cost centre.** School spreadsheets contain inconsistent section names, learners recorded twice, missing birth dates, and names spelled three ways. The importer surfaces these; a human still has to resolve them with the school. Budget accordingly — and note that the school, not Mendtrix, must be the one to decide what the correct value is.

**Step 8 matters legally as much as operationally.** Written sign-off that the migrated data is correct establishes that the school verified its own records. Without it, every subsequent data question becomes a Mendtrix problem.

---

## Export — the other direction

Import is half of the Excel story. Export matters for three reasons: teachers want their working records, registrars want data for uses the product does not cover, and **schools need to know they can leave**.

| Export | Format | Priority |
|---|---|---|
| Class record (DepEd E-Class Record layout) | XLSX | MVP |
| Grade summary, any view | XLSX | MVP |
| Student roster | XLSX | MVP |
| Attendance range | XLSX | MVP |
| Promotion report | XLSX + PDF | MVP |
| School forms | PDF + XLSX | Phase 2 |
| **Full tenant data export** | XLSX + CSV bundle | Phase 2 |

V0's `excelGrades()` (`main.js:1176-1322`) already produces the DepEd workbook shape teachers expect — `INPUT DATA`, `Term_1`, `Term_2`, `Term_3`, `FINAL GRADES`, `LOA SUMMARY`. That layout knowledge ports directly and should not be re-derived.

> **The full-export commitment is a sales asset.** A school buying from a small vendor worries about being stranded. "Your data is yours, exportable in an open format, written into the contract" answers the objection before it is raised — and costs little to honour.
