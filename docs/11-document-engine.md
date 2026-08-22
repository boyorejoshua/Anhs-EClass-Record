# 11 — Reporting & Document Engine

*Covers Part 20 of the audit brief.*

---

## What the engine is for

Schools run on paper. A grade that cannot be printed on the school's own form, with the right letterhead and the right signatures, has not finished being a grade. The document engine is where the platform's data becomes the artifacts the school actually hands to people.

Its architecture is set out in [05 School Forms Strategy](05-school-forms-strategy.md):

```
Core academic data  →  Report data source  →  Template binding  →  Output
```

This document covers the mechanics: how a document is produced, numbered, signed, stored, and reissued.

---

## The generation pipeline

```
Request  (who, what document, for which subject, which period)
   ↓
Authorize        — may this user generate this document for this subject?
   ↓
Gate check       — are the underlying grades finalized?
   ↓
Resolve source   — call the Layer 2 data-source contract → JSON payload
   ↓
Resolve template — the version effective for that academic year
   ↓
Render           — payload + template → print-ready HTML
   ↓
Convert          — HTML → PDF via headless Chromium
   ↓
Number           — allocate from the school's sequence, if numbered
   ↓
Store            — private bucket; checksum recorded
   ↓
Log              — generated_documents row + audit entry
   ↓
Deliver          — signed URL, 5-minute expiry
```

### The gate check

A document must not be generated from unfinalized data. The rule per document type:

| Document | Requires |
|---|---|
| Report card (SF9) | Submissions finalized for every subject in the period |
| Promotion report (SF5) | All periods finalized for the year |
| Permanent record (SF10) | All years finalized |
| Class list (SF1) | Enrollment confirmed |
| Teacher's working record | Nothing — it is explicitly a draft artifact |

Where a school genuinely needs a document before finalization, the engine produces it **watermarked `DRAFT`, unnumbered, and not logged as issued**. This is a real need — advisers preview report cards — and pretending otherwise just pushes people to screenshot the screen.

---

## Draft vs. issued

The distinction that keeps the document log meaningful:

| | Draft | Issued |
|---|---|---|
| Watermarked | ✅ `DRAFT` | ○ |
| Numbered | ○ | ✅ |
| Stored permanently | ○ transient | ✅ |
| Appears in the issuance log | ○ | ✅ |
| Requires `documents.issue` | ○ | ✅ |
| Can be produced pre-finalization | ✅ | ○ |

Registrar Staff can prepare drafts; only the Registrar issues. This maps directly to the permission split in [02 Roles & Workflow](02-roles-and-workflow.md).

---

## Document numbering

Official documents need traceable identifiers.

**Format** (configurable per school):

```
{school_code}-{doc_type}-{academic_year}-{sequence}
ANHS-SF10-2026-000147
```

**Rules:**

- Sequences are per school, per document type, per academic year
- Allocated **atomically** at issuance — never at request time, or gaps appear on every failed render
- Numbers are never reused, even if a document is voided
- A reissued document gets a **new** number and records which document it supersedes
- The sequence table (`document_number_sequences`) is the authority; the number is stamped on the rendered artifact

⚖️ **Requires validation.** Whether a school or DepEd mandates a particular numbering format for any official form — SF10 especially — must be confirmed. The format is configuration, so a mandate is accommodated; but discovering it after 500 documents are issued means a reconciliation exercise.

---

## Signatories

Signature blocks are rendered from configuration, resolved **at issuance time and then frozen**.

```yaml
signatories:
  - role:  adviser
    name:  $.staff.adviser_name        # resolved from the class/section
    label: "Class Adviser"
  - role:  registrar
    name:  $.config.registrar_name     # from school settings
    label: "School Registrar"
  - role:  principal
    name:  $.config.principal_name
    label: "School Principal"
```

**Freezing matters.** A report card issued in 2026 must continue to show the 2026 principal, forever. The names in force at issuance are recorded on the `generated_documents` row, not re-resolved on reprint.

### Digital signatures ⚖️

**Position for V1: signature blocks for wet signing. No digital signatures.**

The Electronic Commerce Act (RA 8792) recognises electronic signatures generally, but whether a receiving school, DepEd, or a university will *accept* an SF10 bearing an image-based or cryptographic signature is a separate and practical question. A cryptographically perfect document that a registrar refuses to accept has solved nothing and cost a great deal.

Recommended sequence:
1. **V1** — print, wet-sign, scan if needed. Exactly as the school does today.
2. **Phase 2** — investigate acceptance with the school, the division office, and one receiving institution. Get a definite answer.
3. **Phase 3** — implement only if the answer is affirmative and specific.

⚖️ Flagged for legal validation in [20 Assumptions Register](20-assumptions-register.md).

---

## Output formats

| Format | Used for | Mechanism |
|---|---|---|
| **PDF** | Every official document | HTML → headless Chromium |
| **XLSX** | Data-oriented forms, teacher records, any tabular view | SheetJS server-side |
| **Print HTML** | Direct browser printing | The same template, print CSS |
| **On-screen** | Preview before generating | The same template, screen CSS |

**One template, four outputs.** This is the payoff of HTML-based templates and the reason a PDF-drawing library was rejected in [07 System Architecture](07-system-architecture.md).

### Batch generation

Report cards are produced by the section, not one at a time.

- Queue the batch; do not block the request
- Progress indicator, since 45 report cards takes a while
- One combined PDF for printing **and** individual PDFs for filing and portal delivery
- Partial failure reports which learners failed and why, without discarding the successful ones

---

## Storage & retrieval

| Concern | Approach |
|---|---|
| Location | Private object storage, partitioned by school |
| Naming | Content-addressed by document ID, never by a guessable pattern |
| Integrity | SHA-256 checksum stored on the row and verified on retrieval |
| Access | Signed URL, 5-minute expiry, permission checked before signing |
| Retention | Issued documents retained indefinitely ⚖️ *pending retention validation* |
| Reprint | **Returns the original stored artifact**, not a fresh render |

> The reprint rule is subtle and important. Re-rendering in 2029 would apply today's template, today's signatories, and today's data — producing a document that differs from the one the school issued. The stored file is the record; that is the whole point of storing it.

Where a genuine re-render is required — a correction — it produces a **new** document that supersedes the old. Both are retained, and the superseded one is marked.

---

## Report catalogue

### MVP

| Report | Audience | Format |
|---|---|---|
| **Report card** (configurable, SF9-shaped) | Adviser, Registrar, Student | PDF |
| **Promotion report** (SF5-shaped) | Registrar, Principal | PDF + XLSX |
| Class record (DepEd E-Class Record layout) | Teacher | XLSX |
| Class grade summary | Teacher | PDF + XLSX |
| Student grade summary | Registrar, Student | PDF |
| Class list | Teacher, Registrar | PDF + XLSX |
| Attendance summary | Teacher, Adviser | XLSX |
| Missing submissions | Registrar, Principal | On-screen + XLSX |

### Phase 2

School register (SF1) · Daily attendance (SF2) · Monthly movement (SF4) · Summarized promotion (SF6) · Personnel assignment (SF7) · Permanent academic record (SF10) · Certificates (enrollment, good moral, completion) · Document issuance log · School-wide analytics

### Out of scope

SF3 (books) and SF8 (health) require data the platform does not hold. See [05 School Forms Strategy](05-school-forms-strategy.md) for the reasoning.

---

## Template authoring

**Who does it:** Mendtrix, during onboarding. This is implementation-tier configuration, not admin self-service and not developer work.

**The process:**

```
1. Collect the school's blank forms and filled samples
2. Identify each field's origin  (direct / computed / config / workflow / manual)
3. Build the HTML template against the data-source contract
4. Render with the school's real data
5. Print and physically compare against the school's original
   ★ side by side, on paper — screen comparison misses margin and scale errors
6. Iterate with the registrar
7. Version and activate
```

**Effort:** 1–3 days per school for the standard set, and much less for the second and subsequent DepEd schools, since templates are largely shared. That reuse curve is a direct margin improvement per customer and is the reason the DepEd-first market choice in [01 Product Vision](01-product-vision.md) matters commercially.

**Step 5 is not optional.** Print-to-paper differences — margins, scaling, page breaks mid-table — are invisible on screen and immediately obvious to a registrar who has handled the real form for fifteen years.

---

## Failure handling

Document generation touches more moving parts than anything else in the system: data, template, renderer, storage, numbering.

| Failure | Response |
|---|---|
| Data source returns incomplete data | Fail before rendering; report exactly which field is missing |
| Template references an unbound field | Fail at activation, not at generation — validate templates when they are saved |
| Renderer times out | Retry once; then queue for manual retry with a clear error |
| Storage write fails | **Roll back the number allocation.** Never burn a sequence number on a document that does not exist. |
| Batch partially fails | Deliver the successes, report the failures individually |

The numbering rollback is the one most likely to be missed and the most annoying to discover later — a registrar being asked why documents 147 and 149 exist but 148 does not.
