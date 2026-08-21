# 14 — School Configuration Matrix

*Covers Part 25 of the audit brief.*

---

## Purpose

This matrix is the operational answer to the ten-schools question. Every school-specific value in the product appears here, classified by **who can change it and how**.

The classification is not documentation — it is a design constraint. When a new school asks for something, the matrix says whether that request is a settings change, an implementation task, or a product decision. Without it, every request drifts toward "just change the code for them," and ten schools become ten codebases.

## The four tiers

| Tier | Who | Turnaround | Cost to Mendtrix | Target share |
|---|---|---|---|---|
| **1 — Admin configurable** | School administrator, self-service | Immediate | Zero | **~80%** |
| **2 — Implementation configurable** | Mendtrix, during onboarding | Hours to days | Billable implementation | ~15% |
| **3 — Developer configurable** | Code change, ships to all tenants | Days to weeks | Product development | ~5% |
| **4 — Custom development** | Per-school code | Weeks | Billable, last resort | **~0%** |

> **The health metric.** Track what proportion of new-school requests land in Tier 1. If Tier 3 and Tier 4 requests are routine, the configuration model is too narrow and must be widened *before* signing more customers. Tier 4 in particular should be treated as a product failure that happens to have been paid for.

---

## The matrix

### School identity & branding

| Item | Tier | Notes |
|---|---|---|
| School name | 1 | |
| Government school ID | 1 | Appears on official forms |
| Region, division, district | 1 | |
| Address, contact details | 1 | |
| School logo | 1 | Upload |
| Letterhead image | 1 | Upload |
| School type | 1 | |
| Subdomain | 2 | Set at provisioning |
| Colour scheme / theme | 2 | A constrained palette, not arbitrary CSS |
| Fully custom visual design | 4 | **Decline.** Offer the theme instead — bespoke UI per school is the fastest route to ten codebases |

### Academic calendar

| Item | Tier | Notes |
|---|---|---|
| Academic year label and dates | 1 | |
| **Period structure** (quarter / semester / trimester / custom) | 1 | The V0 defect this exists to fix |
| Number of periods | 1 | Rows, not code |
| Period names and short names | 1 | "Term 1" vs "First Quarter" vs "Unang Markahan" |
| Period start and end dates | 1 | |
| Expected class days per period | 1 | The correct attendance denominator |
| School calendar: holidays, suspensions | 1 | |
| Year rollover | 1 | Guided flow |
| Overlapping or non-sequential periods | 3 | Rare; would need engine work |

### Academic structure

| Item | Tier | Notes |
|---|---|---|
| Grade levels offered | 1 | Rows — V0 hard-codes Grades 7–12 in a `<select>` |
| Grade level names and ordering | 1 | |
| Sections per grade level | 1 | |
| Section capacity | 1 | |
| Adviser assignment | 1 | |
| Subject catalogue | 1 | |
| Subject categories | 1 | Core / MAPEH / TLE / SHS variants |
| Curriculum map (which subjects per grade level) | 1 | Drives automatic class generation |
| Teacher class assignments | 1 | |
| SHS tracks and strands | 2 → 1 | Structure in Phase 2, then admin-managed |
| Electives outside the section default | 3 | Phase 2 feature |

### Grading

| Item | Tier | Notes |
|---|---|---|
| Component weights (WW / PT / Exams) | 1 | DO 015's 20/50/30 and 20/60/20 are rows |
| Component names | 1 | |
| Component tree — parents with weighted children | 2 | Structure authored at onboarding; weights then Tier 1 |
| Assessments per component | 1 | Teacher-managed, uncapped |
| Scheme assigned per subject category | 1 | |
| Per-subject scheme override | 1 | |
| Transmutation table | 2 | Seeded; a DepEd change is a data update, not a release |
| **Transmutation on/off (zero-based)** | 1 | Clearing the reference switches to direct rounding — the SY 2027–28 change is a settings toggle |
| Pass mark | 1 | V0 inlines `>= 75` everywhere |
| Rounding mode and precision | 1 | |
| Descriptor bands | 1 | Outstanding / Very Satisfactory / … |
| Period-to-final aggregation | 1 | Mean or weighted |
| Promotion rules | 2 | Structure at onboarding, thresholds Tier 1 |
| Non-numeric statuses (INC, DRP) | 1 | |
| Letter-grade scales | 3 | Phase 2 |
| A genuinely novel formula the engine cannot express | 4 | Last resort — first ask whether the engine should be extended for everyone |

### Attendance

| Item | Tier | Notes |
|---|---|---|
| Attendance status codes and labels | 1 | Beyond P/A/L |
| Whether each status counts as present / absent / neutral | 1 | |
| Attendance mode: per-subject or daily homeroom | 1 | A real fork between schools |
| Whether attendance is required at all | 1 | |
| Consecutive-absence alert thresholds | 1 | Phase 2 |

### Users, roles & permissions

| Item | Tier | Notes |
|---|---|---|
| Which roles the school uses | 1 | No school uses all of them |
| Role display names | 1 | Local vocabulary |
| Role → permission matrix | 1 | Editable per school |
| User accounts and role assignment | 1 | |
| MFA requirement per role | 1 | Phase 2 |
| Password policy strength | 2 | Floor set by Mendtrix; a school may tighten, never loosen |
| An entirely new permission concept | 3 | Extends the catalogue for everyone |

### Workflow

| Item | Tier | Notes |
|---|---|---|
| Optional Principal countersign stage | 1 | Off by default |
| Submission deadlines per period | 1 | Phase 2 |
| Whether department heads review first | 1 | |
| Who may publish | 1 | Via the permission matrix |
| Whether reopening needs a reason | — | **Always required. Not configurable.** |
| Additional approval stages beyond the model | 3 | State machine change |

### Student portal

| Item | Tier | Notes |
|---|---|---|
| Portal enabled at all | 1 | |
| Students may view attendance | 1 | Default **off** |
| Students may view general average | 1 | Default on |
| Students may view prior years | 1 | Default on |
| Students may view documents | 1 | Default off, Phase 2 |
| Students may download documents | 1 | Separate from viewing |
| Students may edit own contact details | 1 | Default off |
| Announcement visibility | 1 | Phase 2 |

### Documents & reports

| Item | Tier | Notes |
|---|---|---|
| Signatory names and titles | 1 | |
| Signature order on each document | 2 | |
| Document numbering format | 2 | |
| Report card template | 2 | 1–3 days per school; largely shared across DepEd schools |
| SF form templates | 2 | Shared template pack, per-school overrides |
| A school-invented form | 2 | New data source + template, if the data exists |
| A form needing data the platform does not hold | 3 or 4 | e.g. SF3 books, SF8 health — normally **decline** |
| Page size, margins, orientation | 2 | Per template |
| Which documents each role may issue | 1 | Permission matrix |

### Data & integration

| Item | Tier | Notes |
|---|---|---|
| Import column mapping profiles | 2 | Saved and reusable across schools |
| Export formats | 3 | Product-level |
| Data retention window | 2 | ⚖️ pending legal validation |
| Backup schedule | 2 | Platform-level |
| Dedicated database (isolation tier) | 2 | Priced premium; same code, different connection |
| Third-party integrations | 3 | Phase 3 |

---

## Decision rule for new requests

```
A school asks for something
        ↓
Is it already a setting?                    → Tier 1. Show them.
        ↓ no
Is it configuration or a template?          → Tier 2. Implementation task.
        ↓ no
Would 2+ other schools want this?           → Tier 3. Product backlog.
        ↓ no
Is the school paying for it, and does it
avoid forking the codebase?                 → Tier 4. Price it honestly.
        ↓ no
                                            → Decline, and explain why.
```

**Declining is a legitimate outcome and should be normalised internally.** A single school's idiosyncratic requirement, implemented as bespoke code, costs Mendtrix more over five years than the deal is worth — and the cost lands on every future deployment, not just that one.

The most useful phrase in a discovery meeting: *"We can do that — here's what it costs, and here's the standard way that gets you 90% of it today."* Schools usually take the standard way.

---

## Anti-patterns

Recording these because each is a plausible path to ten codebases:

| Anti-pattern | Why it is fatal | Do instead |
|---|---|---|
| `if (school === 'ANHS')` anywhere in the code | The literal beginning of a per-school fork | Add a setting |
| A per-school database column | Schema divergence; migrations stop being universal | `school_settings`, or a real feature for everyone |
| Editing a shared template for one school | Silently changes every other school's output | Clone to a school-specific template version |
| A per-school build or branch | Ten deployment pipelines, ten regression surfaces | One build, configuration at runtime |
| Hard-coding a period count "just for now" | V0's exact mistake, in six places | Periods are rows |
| Promoting one school's variant to the default | The second school inherits the first school's quirks | Promote only when three schools share it |
