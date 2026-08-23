# Student Management — Specification

*What was built, and the one distinction it exists to protect.*

---

## The distinction

```
STUDENT        a PERSON. One row, per school, for as long as they attend.
   ↓           id · student_number · lrn · names · sex · birth_date
ENROLLMENT     one SCHOOL YEAR of that person's attendance.
   ↓           academic_year_id · grade_level_id · section_id
               status · promotion_status · general_average
CLASS_ENROLLMENT   one SUBJECT CLASS within that year.
```

| The teacher does this | The system does this |
|---|---|
| Moves a learner Pearl → Emerald | Edits `enrollments.section_id` |
| Moves a learner Grade 9 → Grade 10 | Adds a **new** `enrollments` row against the **same** `students.id` |
| Admits a new learner | Adds a `students` row **and** their first `enrollments` row |

A learner never becomes two learners. That is the whole design, and every
function below is shaped to make the wrong thing hard.

**The model already did this before this phase.** `students`,
`enrollments` and `class_enrollments` have been three tables since
migrations 0002–0003, with RLS and permissions on all of them. What was
missing was the way in: there was no way to add a learner except by
seeding one.

---

## Write path — migration 0025

| Function | Who | What it does |
|---|---|---|
| `admit_student(student, enrollment)` | `students.write` | Creates the **person** and their **first year**, in that order, in one transaction |
| `enrol_student(student_id, enrollment)` | `enrollments.write` | Adds a year to an **existing** person. This is what promotion is |
| `update_student(id, patch)` | `students.write` | Patches identity. An absent key is left alone, never blanked |
| `update_enrollment(id, patch)` | `enrollments.write` | Patches one year. **This is how a section transfer happens** |

### Duplicate prevention

Two partial unique indexes, added by this migration because nothing
enforced them:

```sql
students (school_id, lrn)            where lrn is not null
students (school_id, student_number) where student_number is not null
```

Partial because both are legitimately null — a learner can be admitted
before an LRN is issued.

`admit_student` checks *before* writing and names the clash:

> A learner with that LRN already exists in this school (Verification, Test).

The index would also catch it, but
`duplicate key value violates unique constraint students_lrn_unique` is
not something to show a registrar.

`enrollments (student_id, academic_year_id)` was **already** unique. That
is what stops a learner appearing twice in one directory, and
`enrol_student` reports it as:

> This learner is already enrolled for that school year — edit the
> enrolment instead of adding one.

---

## Read path

`rds.student_profile(student_id)` returns identity + every year + every
readable grade, in one round trip. **SECURITY INVOKER**, so the four
existing policies on `students` decide who may open it.

Verified against the live database with `set local role authenticated`,
so RLS was genuinely in force:

| Caller | Own record | A classmate | Another school |
|---|---|---|---|
| Student | ✅ visible | **NULL** | — |
| Teacher | — | ✅ (learners they teach) | **NULL** |
| Registrar | — | ✅ | **NULL** |

A caller with no route to the row gets `null` — the same answer as for a
learner who does not exist, which is the correct answer to give. The
screen renders "not found" either way.

> ⚠️ An earlier run of this same test appeared to show a student reading
> a stranger's record. It was a **false alarm from a bad test**: the block
> ran as `postgres`, which has `rolbypassrls` and therefore proves
> nothing about RLS. A second false pass followed, where the "unrelated
> learner" fixture resolved to NULL because every ANHS learner is in the
> class being tested. Both are recorded here because the lesson
> generalises: an isolation test that does not switch role, and one whose
> fixture is empty, both pass for free.

`rds.enrollment_options(year_id)` returns the grade levels and sections a
form may offer. **A form never accepts a typed section name** — that is
how a school ends up with `Masipag`, `masipag` and `Masipag ` as three
sections.

---

## Screens

### Students — `screens/Students.tsx`

Directory for the chosen school year. Search runs **on the server**
(name, LRN, student number); grade level and section filter in the
browser, because those arrive with the rows and a round trip to narrow a
visible list is worse than useless.

`+ Add student` appears for the registrar and school admin. That is a
**courtesy, not a control** — `admit_student` checks `students.write`
itself and refuses anyone else; hiding the button only spares a teacher a
pointless error.

Every role gets the Students entry. RLS decides what is in it: a teacher
sees learners in their own classes, an adviser their section, a registrar
everyone, a learner only themselves.

### Add student

Two panels, in the order the record is built: **Learner**, then
**Enrolment**. That order is not cosmetic — it is the schema, and a
registrar should be able to see that they are creating two things.

Submit stays disabled until first name, last name and grade level are
present. Section is disabled until a grade level is chosen, and then
lists only that grade level's sections.

### Student record — `screens/StudentRecordScreen.tsx`

Identity → current enrolment → academic history → grades. The shape of
the screen is the shape of the schema: one identity block because there
is one, a row per school year because there are many.

Named `StudentRecordScreen`, and its type `StudentRecord`, to stay clear
of `StudentProfile` — the **portal's** view of the signed-in learner's own
record. Same person, different question, and keeping them apart stops a
portal screen rendering a field only staff should see.

---

## Verification

`e2e/student-management.mjs` — 14 checks in Chromium, including:

- a teacher sees the directory but is **not** offered Add student
- the form separates learner from enrolment
- submit is disabled until the record is valid
- adding lands on the new learner's record, with the LRN and enrolment
- the directory grows by **exactly one**
- a duplicate LRN is refused, and the message **names the clash**
- the refused attempt created **nothing**

Plus the live-database checks above, and 138 unit tests.

---

## Not built yet

| Gap | Note |
|---|---|
| **Edit** from the UI | `update_student` and `update_enrollment` exist and are tested; no screen calls them yet |
| **Promotion** from the UI | `enrol_student` exists; the bulk "roll the year over" flow does not |
| Student ↔ portal account linking | `students.portal_user_id` exists; nothing sets it |
| Soft delete / merge | `students.deleted_at` and `students.merge` exist; no flow uses them |
