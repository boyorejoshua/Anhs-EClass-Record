# 03 — Existing System Assessment (Version 0)

*Covers Parts 2, 3, 4 and 5 of the audit brief — inventory, strengths, weaknesses, critical technical problems.*

---

## Summary judgment

> V0 is a well-shaped **grading engine and report generator** trapped inside a single-file, single-school, single-user, name-keyed, browser-storage prototype.

The domain knowledge is genuine and hard-won. The software architecture cannot carry a product. This document separates the two precisely, so nothing valuable gets thrown away and nothing unsalvageable gets carried forward out of sentiment.

---

## What V0 actually is

| Aspect | Reality |
|---|---|
| Architecture | 4 files, no build step, no framework, no package manager |
| `index.html` | 267 lines — all pages as `<div class="page">`, toggled by `showPage()` |
| `assets/js/main.js` | 1,557 lines — the entire application |
| `assets/js/supabase.js` | 419 lines — **dead code, never called from anywhere** |
| `assets/css/style.css` | 432 lines |
| `supabase_schema.sql` | 408 lines — never applied by any code in the repo |
| `CHEATSHEET.html` | 478 lines — developer documentation |
| Dependencies | CDN `<script>` tags only: supabase-js (unused), SheetJS (used) |
| Persistence | `localStorage` + a forced file download every 15 minutes |
| Deployment | Drag the folder to Vercel, or open `index.html` from disk |

It is a **real, working prototype** — not a mockup with fake data. Grade entry, computation, attendance, six SF forms and Excel export all genuinely function in the browser. That is worth respecting; it is also the reason it has been mistaken for a foundation.

---

## The five findings that determine the rebuild

### Finding 1 — There is no backend at all

`main.js` never references `supabase`, `supaLogin`, `supaSaveGrade`, `PHASE2_ENABLED`, or any function defined in `supabase.js`. A grep for `supa[A-Z]|PHASE2|supabase` across `main.js` returns **zero matches**.

Meanwhile `supabase.js` loads, self-initializes a client, logs `"[Phase 2] Supabase connected"`, and renders a green **"☁ Supabase Connected"** status pill (`supabase.js:391-417`). Every one of its ~15 data functions is uncalled.

**The UI is telling users their data is synced to a server. It is not.** A teacher trusting that pill and then clearing their browser cache loses a term of grades. This is the single most urgent finding in the audit.

`supaFullSync()` (`supabase.js:326-349`) was clearly intended as the bridge — it calls `getCD()`, `allStu()` and `calcT()` from `main.js` — but nothing ever invokes it.

The app itself half-admits the situation elsewhere (`main.js:971`):

> *"For Phase 2: Direct digital submission to Registrar requires a backend server connection. Currently, download all forms above and submit physically."*

### Finding 2 — Student identity is a name string

```js
// main.js — grades and attendance are keyed by uppercased name
grades[term][STUDENT_NAME] = { ww:[...], pt:[...], te }
att[date][STUDENT_NAME]    = 'P' | 'A' | 'L'
```

There is no student ID anywhere in the live data model. `addStu()` (`main.js:394`) uppercases and dedupes by name; `removeStu()` (`main.js:395`) deletes grade records by name.

Consequences: renaming a learner orphans every grade and attendance record. Two learners with the same name silently share one record. A learner cannot be tracked across school years, sections, or subjects. **SF10 — a permanent record following the learner — is structurally impossible.**

### Finding 3 — Students are owned by classes

```sql
-- supabase_schema.sql:96-98
create table public.students (
  id       uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
```

A learner enrolled in six subjects is six unrelated rows. There is no master record, therefore no academic history, no cross-subject consolidation without file exchange, and no learner-level anything.

This is the deepest defect. Everything a registrar needs is downstream of a student master record that does not exist.

### Finding 4 — School identity is a text default

```sql
-- supabase_schema.sql:22-25 and again at :64-67
school_name text default 'Angono National High School',
school_id   text default '301417',
region      text default 'IV-A CALABARZON',
division    text default 'Rizal',
```

```js
// supabase.js:41 — login identity derived from one school's domain
const email = `${empId.toLowerCase()}@anhs.edu.ph`;
```

Tenancy is not modeled. A second school means a second deployment, a second database, and a second set of edits. Hard-coded ANHS strings additionally appear at `main.js:72, 77, 117-134` and `index.html:21, 66-71`, and the storage namespace itself is `anhs_users` / `anhs_v4_*` / `anhs_current_user`.

### Finding 5 — The grading formula is already obsolete

```js
// main.js:289
const W = { ww:0.30, pt:0.50, te:0.20 };
```

**DepEd Order 015, s. 2026** — the assessment order accompanying the very DO 009 three-term calendar this app is built around — specifies:

| Subject group (Grades 4–10) | Written Works | Performance Tasks | Examinations |
|---|---|---|---|
| Core (English, Filipino, Math, Science, AP, GMRC/VE) | **20%** | **50%** | **30%** |
| EPP-TLE, MAPEH | **20%** | **60%** | **20%** |

And the Examinations component itself subdivides: **Summative Test 1 = 30%, Summative Test 2 = 30%, Term Exam = 40%** of the Examinations weight — a two-level component tree V0 has no way to express.

Further, the SY 2026–2027 transmutation table is explicitly transitional; **zero-based grading replaces it in SY 2027–2028**.

V0 can only be corrected by editing source code. `CHEATSHEET.html` §10 confirms this is the intended maintenance model, listing *"Change the system from DepEd (30/50/20) to a different weighting"* as a code-edit task.

> This finding is the strongest available argument for the configuration-driven grading engine. The prototype has been non-compliant since June 2026 through no fault of design intent — simply because the rules moved and the rules were in the code.

---

## Additional issues found

**Security**

- Passwords are `btoa(pass)` (`main.js:44`) — base64 encoding, not hashing. Anyone can read `localStorage.anhs_users` in devtools.
- `switchRole()` (`main.js:216`) lets any user reassign their own role.
- Role enforcement is navigation-only. Every page div exists in the DOM; `showPage('registrar')` works from the console regardless of role.
- Student names flow into `onclick="setGrade('...')"` handlers (`main.js:437`) escaped only for single quotes (`esc()`, `main.js:4`) — an injection surface.
- **A live Supabase project URL and anon key are committed in git history** (`supabase.js:20-21`).

**Correctness**

- A missing component counts as zero rather than being excluded (`main.js:301`), so a term graded before the exam exists reads artificially low.
- SF4 uses `monDates.length` — days *recorded*, not days in session — so the attendance denominator is wrong whenever a teacher misses a day.
- Attendance summary silently truncates to the last 20 dates (`main.js:807`).
- `registrar_submissions` uses `for insert ... using (...)` (`supabase_schema.sql:288`); Postgres requires `with check` for INSERT and would reject this policy.
- `supabase.js:129` upserts on `onConflict:'class_id,full_name'`, but no such unique constraint exists in the schema.

**Maintainability**

- The final-grade average is re-implemented inline in at least **eight** places (`main.js:304, 698, 711, 874, 880, 1269, 1340, 1385`).
- LOA banding is duplicated three times (`main.js:633, 709, 1285`); gender header rows about ten times.
- All rendering is `innerHTML` string concatenation with inline styles; all handlers are global functions bound via `onclick=`.
- Dead references to a removed `#roleScreen` element remain at `main.js:85, 88, 216`.

**Structural limits**

- Three terms hard-coded: `term in (1,2,3)` in SQL, `for(let t=1;t<=3;t++)` at `main.js:29, 156, 184, 330, 1193, 1281`. Quarters do not exist.
- Assessments capped at 10 per component by 20 flat SQL columns (`ww1..ww10`, `pt1..pt10`).
- Term dates hard-coded (`main.js:9-13`) and duplicated in markup (`index.html:141-151`).
- Grade levels fixed to Grade 7–12 in a `<select>` (`index.html:123-125`).
- Pass mark `>= 75` inlined in every consumer.
- Gender is a binary partition used as the primary grouping key throughout (`students:{male:[],female:[]}`).
- Subject is free text; sections are free text force-uppercased (`main.js:266`).

---

## Verdict per module: KEEP / REDESIGN / REBUILD

### ✅ KEEP — port into V1 largely as-is

| Asset | Location | Why it's valuable |
|---|---|---|
| **Transmutation table** | `main.js:1` — 41-row lookup | Correct DepEd table, tedious to reproduce. Port as **seed data** in `transmutation_tables`, not as code. |
| **LOA / proficiency banding** | `main.js:633-634` | Correct descriptor thresholds. Port as configuration rows. |
| **SF form layouts** | `renderSF1/2/4/5/9/10`, `main.js:866-875` | Real DepEd layout knowledge. Port as HTML templates bound to data-source contracts. |
| **DepEd E-Class Record Excel structure** | `excelGrades()`, `main.js:1176-1322` | The workbook shape (INPUT DATA / Term_1-3 / FINAL GRADES / LOA SUMMARY) is what schools expect. Port as the export template. |
| **Grade-entry grid interaction model** | `renderGradeEntry`, `main.js:398`; `renderBulkEntry`, `main.js:466` | The spreadsheet-like grid and the bulk-entry-per-activity idea are the right UX instincts. Port the *design*, rebuild the implementation. |
| **In-app teacher guide + FAQ** | `renderInstructions`, `main.js:1100` | Content is reusable for onboarding and training material. |
| **Analytics / distribution bands** | `renderAnalContent`, `main.js:548` | Genuinely useful teacher feature; concept ports directly. |

### 🔧 REDESIGN — the concept survives, the implementation does not

| Module | What survives | What changes |
|---|---|---|
| **Record Book** | The mental model — one place a teacher manages roster, scores, attendance, remarks for a class | Backed by centralized data. **Roster is auto-populated from section enrollment, not typed.** No per-teacher data silo. |
| **Grade Summary** | Class-level term/final view | Becomes one view over shared data, alongside registrar, section, subject, school-year and student views. Calculations centralized. |
| **Attendance** | Daily P/A/L capture per class | Configurable status set; school-calendar aware; correct expected-days denominator; no 20-date truncation. |
| **Registrar page** | The submission-centre concept | Becomes a real workflow queue with approve/return/publish state transitions, not a download checklist. |
| **Consolidated (Advisory)** | Cross-subject consolidation and promotion | Becomes a **database query**. The JSON-file import/export mechanism (`main.js:1327`, `860`) disappears entirely — it exists only because there is no shared database. |
| **SF Forms page** | Generating forms from class data | Becomes the document engine: data-source → template → numbered, archived output. See [11 Document Engine](11-document-engine.md). |
| **Excel export** | SheetJS workbook generation | Kept, but as one output of the reporting engine rather than bespoke code per form. |
| **Diagnostic test** | Pre-test HSO/LSO capture | Generalizes into the assessment model rather than a special one-row-per-class table. |

### ❌ REBUILD — no code carries forward

| Component | Why |
|---|---|
| **Authentication** | `btoa()` in localStorage. Replaced by real auth with hashed credentials, sessions, and MFA capability. |
| **Persistence** | localStorage + forced downloads. Replaced by Postgres with RLS. |
| **Data model** | Name-as-key and class-owned students are unfixable in place. |
| **Authorization** | Navigation-only, self-assignable. Replaced by database-enforced RBAC. |
| **Application shell** | 1,557-line global-function `innerHTML` file. Replaced by a component architecture. |
| **Grading formula** | Hard-coded constant. Replaced by a config-driven engine. |
| **Multi-tenancy** | Does not exist. Built from the ground up. |
| **`supabase.js` entirely** | Dead code written against the wrong schema. Discard. |

### 🆕 NEW — required for V1, absent from V0

- School tenant management and tenant isolation
- Student master records and enrollment history
- Configurable academic year and period structures
- Subject catalogue, section, and class-assignment management
- Grade submission workflow with approval states
- **Student portal** (V0 has no student-facing surface whatsoever)
- Audit logging
- Document numbering, issuance, and archival
- Excel import / data migration
- Notifications
- Admin dashboards
- User management

---

## Immediate action items outside this planning phase

Two things should be handled regardless of when development starts:

1. **Rotate or delete the exposed Supabase credentials.** The project URL and anon key at `supabase.js:20-21` are in public git history. Rotating the key does not remove it from history; the project should be assessed and preferably retired. Tracked in [18 Risks](18-risks.md).
2. **Correct or remove the "☁ Supabase Connected" indicator** if V0 is shown to anyone again, including in demos. It asserts a data-safety property that is false, and a prospect discovering that during a pilot is a trust problem far larger than the feature.

---

## What V0 is still good for

Do not delete it. It has two ongoing uses:

- **A requirements artifact.** It is the most accurate available specification of how this school actually works — better than any document, because it was built against real practice.
- **A demo asset until V1's demo exists.** With the connectivity indicator corrected and expectations set honestly, it still communicates the vision to a prospect in five minutes.
