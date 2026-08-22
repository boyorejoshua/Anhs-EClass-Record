# 01 — Product Vision, Problem Statement & Target Customers

*Product vision, the Excel problem, and target customers — foundation for Parts 1 and 31 of the audit brief.*

---

## PART 1 — Product Vision

### What this platform actually is

**Mendtrix School Academic Records & Grading Platform** is a centralized, multi-school system of record for a school's academic data, with role-specific workspaces layered on top of it and a document engine that renders the school's official paperwork from that data.

It is not an online spreadsheet. The distinction is structural:

| A spreadsheet system | A system of record |
|---|---|
| The file *is* the data | The database is the data; files are exports |
| Truth lives wherever the newest copy is | Truth has one location and one version |
| Consolidation is a manual act | Consolidation is a query |
| History survives if someone kept the file | History is a first-class dimension of the model |
| Correctness is checked by re-reading | Correctness is enforced at write time |
| Who changed what is unknowable | Every change has an actor and a timestamp |

### The core loop

```
Encode once  →  Validate  →  Consolidate  →  Generate  →  Publish
```

A teacher enters a score exactly once. Every downstream artifact — the class record, the grade summary, the report card, the promotion report, the permanent record, the registrar's consolidated view, the student's portal page — is derived from that single entry. Nobody retypes anything, and no two artifacts can disagree.

### What the platform is composed of

Five layers, each addressable independently:

1. **Configuration layer** — school profile, academic calendar structure, grading schemes, grade levels, subjects, sections, roles, document templates. This is what makes one codebase serve many schools.
2. **Academic data layer** — students, enrollments, class assignments, assessments, scores, attendance. The source of truth.
3. **Workflow layer** — the grade lifecycle (draft → submitted → returned → approved → published), approvals, locks, corrections, and the audit trail that records all of it.
4. **Presentation layer** — role-specific workspaces for teacher, registrar, administrator, and student.
5. **Document layer** — a mapping engine that binds academic data to school-owned templates and produces print-ready, numbered, archived documents.

The layering matters commercially: layers 2, 3 and 5's engine are identical for every customer. Layer 1 and the templates in layer 5 are where a school's individuality lives. That ratio is the product.

### What success looks like

The platform succeeds when a school's registrar can answer *"what were this learner's Grade 8 grades?"* in five seconds, from any device, three years later — and can print the document that proves it, without asking a teacher for a file.

It fails if teachers keep a private spreadsheet alongside it. That single behaviour is the product's definition of failure, and it is why teacher usability is treated as a hard requirement rather than a polish item throughout this set.

---

## PART 2 — Problem Statement

### The Excel workflow, described honestly

Excel is not the villain here, and it is important to be clear about that when selling. Excel wins on a real merit: it is immediate, offline, familiar, free, and infinitely flexible. Any replacement that is slower to type into will lose regardless of its other virtues.

The problem is not the spreadsheet. It is what happens **between** spreadsheets.

### Where the cost actually accumulates

**1. The file is the record, so the record multiplies.**
Each teacher holds a private class record. The adviser holds a consolidation. The registrar holds another consolidation. The principal gets a summary. That is four copies of the same numbers, each capable of drifting from the others, with no mechanism to detect that they have.

**2. Consolidation is manual, repeated, and error-prone.**
An adviser with a section of 45 learners across 10 subjects consolidates 450 grades per term by hand or by copy-paste, three times a year. Every one of those is a re-entry, and re-entry has an error rate. The V0 prototype captures this exactly: its only inter-teacher mechanism is *exporting a JSON file and emailing it to the adviser to import* (`main.js:1327`, `main.js:860`).

**3. Submission status is invisible.**
"Have all 60 teachers submitted Term 2?" is currently answered by a person maintaining a checklist of received emails. There is no query for it. Chasing missing submissions is a recurring, unbudgeted administrative cost every single term.

**4. Version conflict is undetectable and silent.**
Two copies of `Grade9-Math-Term2-FINAL-v3-revised.xlsx` differ by one cell. Nothing in the workflow surfaces which is correct. The resolution mechanism is memory and seniority.

**5. Corrections have no trail.**
A grade changes after submission. Who authorised it, when, from what to what, and why, is recorded in an email at best and nowhere at all more often. For an academic record with legal weight, this is the most serious of the failures.

**6. Historical retrieval degrades over time.**
A learner's Grade 7 record lives in a file on a laptop belonging to a teacher who has since transferred. Producing an SF10 for a transferring learner turns into an archaeology exercise. The information *exists*, but the cost of retrieving it rises every year.

**7. Formula changes require touching every file.**
This one is about to become acute. DepEd Order 015, s. 2026 already changed component weights for SY 2026–2027, and **zero-based grading replaces transmutation in SY 2027–2028**. Every class record template in the school has to be rebuilt and redistributed, and every teacher has to be re-trained on the new file — twice in two years.

### Quantifying it for a sales conversation

For a school of 1,200 learners, 40 teachers, 30 sections, per term:

| Activity | Rough manual cost |
|---|---|
| Teachers emailing class records to advisers | 40 teachers × 6 classes = 240 file transfers |
| Adviser consolidation | 30 sections × ~10 subjects × 40 learners ≈ 12,000 grade re-entries |
| Registrar chasing missing submissions | ongoing, unbudgeted, entire submission window |
| Registrar consolidating for official forms | full re-entry of the same 12,000 values |
| Error correction cycles | unknown, because errors are found by chance |

Multiplied by three terms. The platform's value proposition is the removal of the second, fourth and fifth rows entirely, and the collapse of the third row into a dashboard.

> **Requires validation.** These figures are illustrative, built from a plausible school profile. Real numbers from the pilot school make the sales case dramatically stronger and should be captured during discovery — see [20 Assumptions Register](20-assumptions-register.md).

### The proposed situation

```
School Administration          configures the school
        ↓
Registrar                      maintains student & enrollment records
        ↓
Teachers                       encode grades and attendance — once
        ↓
System                         calculates, consolidates, validates
        ↓
Registrar                      reviews, approves, generates documents
        ↓
Students                       access published results in the portal
```

Each arrow that currently carries a file attachment becomes a state transition inside one system.

---

## PART 3 — Target Customers

### Primary target: DepEd public secondary schools

**Profile of the ideal first customer:**

| Attribute | Target |
|---|---|
| Type | Public Junior High / Senior High, or integrated |
| Enrollment | 800–2,500 learners |
| Teaching staff | 30–100 |
| Sections | 20–60 |
| Current system | Excel-based E-Class Record, no SIS |
| Internet | Adequate in the admin/faculty area; variable in classrooms |
| Device access | Teachers have personal laptops or smartphones |
| Decision maker | School Head / Principal, with the Registrar as champion |

**Why this segment first:**

- **Maximum reuse.** DepEd forms, DO 015 grading rules, and the LRN identity system are shared across every school in the segment. The same template pack and the same grading scheme library resell with near-zero customization. This is the single biggest lever on Mendtrix's margin.
- **A shared, dated pain.** Every school in the segment faces the SY 2027–2028 zero-based grading change simultaneously. That is a market-wide forcing event, not a school-by-school persuasion problem.
- **A natural champion.** The registrar bears the heaviest manual cost and has the clearest view of what the system saves. Registrars also talk to each other across schools — the segment has organic referral behaviour.
- **The prototype already speaks the language.** V0 encodes DepEd concepts correctly. Demos land immediately with this audience.

**Why not below 800 learners:** the manual pain is tolerable, budgets are thin, and the implementation cost per school does not amortize.

**Why not above 2,500 initially:** larger schools bring procurement complexity, existing partial systems to integrate with, and higher expectations for support responsiveness than a 1–2 person team can meet while still building the product.

### Secondary target (Phase 2+): private and parochial schools

Better budgets, faster purchasing decisions, no public procurement rules. But each has its own report card design, its own grading policy, and often its own period structure. They become attractive **after** the document engine is proven flexible by real use — deliberately not in the first wave, because early customers shape the architecture and one idiosyncratic private school could pull the product off the reuse path.

### Explicit non-targets for V1

| Segment | Why not yet |
|---|---|
| Elementary (K–6) | Kindergarten to Grade 3 use non-numerical descriptive assessment — a genuinely different grading model. Additive later, distracting now. |
| Universities / HEIs | Different regulator (CHED), different records model, unit/credit systems, entirely different forms. A separate product. |
| Multi-campus school networks | Requires a district/division tier above the school tenant. The data model should not *preclude* it, but the feature waits. |
| Schools wanting full ERP | Payments, HR, inventory, library. Out of scope; noted in the Phase 3 roadmap only. |

### What the buyer actually buys

Worth being precise about this, because it shapes both the product and the pitch. The school is not buying "a grading website." It is buying, in descending order of what they will actually pay for:

1. **The registrar's time back.** Consolidation and chasing disappear.
2. **Defensible records.** Every grade has an author, an approver, and a history. This matters enormously when a grade is disputed.
3. **Continuity through policy change.** DepEd changes the rules; the school's system absorbs it without 40 teachers relearning a spreadsheet.
4. **Instant historical retrieval.** SF10 for a transferring learner in seconds, not days.
5. **Visibility.** The principal can see submission status without asking anyone.

Teacher convenience is notably *not* on that list — it is what the buyer needs to be true for the purchase to succeed, but it is not why they buy. Both facts matter: build for the teacher, sell to the registrar and the head.
