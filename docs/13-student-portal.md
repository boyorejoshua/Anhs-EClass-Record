# 13 — Student Portal Architecture

*Covers Parts 12, 13 and 14 of the audit brief — Student Portal architecture, MVP, and future roadmap.*

---

## Why this is a first-class module

The Student Portal is the single largest functional addition in V1. **V0 has no student-facing surface whatsoever** — no student login, no student account, no student view of any kind. Every screen in the prototype is built for a teacher or a registrar.

This matters commercially more than it might appear. The portal is what changes the sales conversation from *"we digitised your gradebook"* to *"your school has a student portal."* It is the visible, demonstrable, parent-noticeable part of the product. A principal can show it at a PTA meeting. Nobody shows a registrar's submission queue at a PTA meeting.

It is also the module with the **highest privacy risk in the entire system**, because it is the only surface where a data subject logs in to see their own records — and any defect exposes learners to each other.

Both facts push in the same direction: build it properly, and build the authorization at the database layer.

---

## PART 12 — Student Portal Architecture

### Where the portal sits

```
                    ┌──────────────────────────┐
                    │   CORE ACADEMIC DATA     │
                    │  (single source of truth)│
                    └──────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼───────┐ ┌────────▼───────┐ ┌────────▼────────┐
     │ Teacher        │ │ Registrar      │ │ STUDENT PORTAL  │
     │ workspace      │ │ portal         │ │                 │
     │                │ │                │ │ read-only       │
     │ read + write   │ │ read + write   │ │ published only  │
     │ own classes    │ │ whole school   │ │ SELF only       │
     └────────────────┘ └────────────────┘ └─────────────────┘
```

The portal is a **read-only consumer** of the same data everyone else uses. It has no tables of its own, no separate grade store, and no synchronisation step. A grade a student sees is the same row the teacher entered — filtered by two predicates: *is it mine* and *is it published*.

This is worth stating explicitly because the tempting alternative — copying published grades into a "student_visible_grades" table — is a mistake. It creates a second source of truth, a sync job that can fail silently, and a window where the portal shows a grade that has since been corrected.

### The two-predicate rule

Every single query the portal makes is governed by two conditions, and **both live in the database's row-level security policy, not in application code**:

```
1.  Is this record the authenticated learner's own?
2.  Has it been published by the registrar?
```

```sql
CREATE POLICY student_reads_own_published_grades ON period_grades
  FOR SELECT USING (
    school_id = current_school_id()
    AND class_enrollment_id IN (
      SELECT ce.id
      FROM class_enrollments ce
      JOIN enrollments e ON e.id = ce.enrollment_id
      WHERE e.student_id = current_student_id()      -- predicate 1
    )
    AND EXISTS (
      SELECT 1
      FROM grade_submissions gs
      JOIN class_enrollments ce2 ON ce2.class_id = gs.class_id
      WHERE ce2.id = period_grades.class_enrollment_id
        AND gs.academic_period_id = period_grades.academic_period_id
        AND gs.published_at IS NOT NULL                -- predicate 2
    )
  );
```

**Why in the database rather than the application:** a future developer adding a new student endpoint, or writing a careless query, or building a mobile app against the same API, cannot bypass it. The wrong query returns zero rows instead of another learner's grades. Application-layer checks are one forgotten `WHERE` clause away from a breach; a policy is not.

### Portal information architecture

```
Student Portal
├── Dashboard              current standing at a glance
├── My Grades
│   ├── by period          Term 1 / Term 2 / Term 3 / Final  (configurable)
│   └── by subject         all periods for one subject
├── My Profile             identity + current enrollment
├── Attendance             ⚙ visible only if the school enables it
├── Academic History       ⚙ prior school years, if enabled
└── Documents              ⚙ Phase 2, if enabled
```

Deliberately shallow — five to six destinations, no nesting beyond two levels. The primary user is a 13-to-18-year-old on a phone with intermittent data. Every extra tap is a real cost.

### The configurability requirement

Four things in the portal are **school-configurable switches**, because schools genuinely disagree about them:

| Setting | Default | Why it varies |
|---|---|---|
| `student_can_view_attendance` | **off** | Some schools consider attendance a parent matter, not a learner matter |
| `student_can_view_general_average` | **on** | Some schools suppress it to discourage ranking behaviour |
| `student_can_view_prior_years` | **on** | Some restrict history to the registrar |
| `student_can_download_documents` | **off** | Most want document issuance controlled by the registrar |

Defaults are deliberately conservative. A school turning something *on* is a decision they made; a school discovering something was on by default is an incident.

⚖️ **Requires validation** with the pilot school — all four. Recorded in [20 Assumptions Register](20-assumptions-register.md).

---

## PART 14 — The Student Dashboard

### Design intent

The dashboard answers one question: **"how am I doing right now?"** Everything else is navigation.

The brief supplies a sketch, and it is broadly right, but three changes are worth making:

1. **Lead with the most recently published period, not a static list.** A learner opening the portal in December wants Term 2, not a generic summary.
2. **Do not show a computed general average unless the school enables it** — and never show a rank or a class position under any circumstances.
3. **Say plainly when nothing is published yet.** The most common state early in a term is "no grades yet," and an empty screen reads as a broken app.

### Layout

```
┌────────────────────────────────────────────────┐
│  Good morning, Joshua                          │
│  Grade 10 – Pearl · SY 2026–2027               │
├────────────────────────────────────────────────┤
│  TERM 2  ·  Published 18 Dec 2026              │
│                                                │
│    Mathematics 10 .................  88        │
│    Science 10 .....................  91        │
│    English 10 .....................  89        │
│    Filipino 10 ....................  90        │
│    Araling Panlipunan 10 ..........  87        │
│    MAPEH 10 .......................  92        │
│                                                │
│    General Average ................  89.5   ⚙  │
├────────────────────────────────────────────────┤
│  Term 1 ✓ published    Term 3 — not yet        │
├────────────────────────────────────────────────┤
│  ATTENDANCE — Term 2                        ⚙  │
│    Present 58 · Absent 2 · Late 1              │
├────────────────────────────────────────────────┤
│  [ My Grades ]  [ History ]  [ Profile ]       │
└────────────────────────────────────────────────┘
```

`⚙` marks a school-configurable element.

### The empty and partial states

These are not edge cases — they are the *normal* state for most of the school year, and they need designing rather than defaulting.

| Situation | What the learner sees |
|---|---|
| Nothing published yet, ever | "Your grades will appear here once your school publishes them." Plus current enrollment and subject list, so the page is not blank. |
| Some subjects published, others not | Published subjects listed; unpublished shown as **"Not yet released"** — *not* as a blank, and *not* as a dash that could be mistaken for a zero |
| Grade reopened for correction | Reverts to "Not yet released." No partial or stale value. |
| Enrolled but no subjects assigned | "Your subjects are being finalised." Prompts the learner to contact their adviser. |

> The "Not yet released" wording matters. A blank cell invites a learner to conclude they have no grade; an explicit status tells them the system is working and the school has not finished. This single copy decision will prevent a meaningful volume of support questions.

---

## PART 15 / Student Profile

Following the layered model in [06 Data Architecture](06-data-architecture.md), the profile screen displays three distinct layers and must not blur them:

**Identity — permanent, spans every year**
Name · Student number · LRN · Date of birth · Sex · Contact

**Current enrollment — this year only**
School year · Grade level · Section · Adviser · Enrollment status

**Current subjects — this year, this section**
Subject · Teacher · Grading periods available

**Historical — prior years, read-only**
Handled on the Academic History screen, not mixed into the profile.

### What a student may and may not edit

| Field | Student can edit |
|---|---|
| Password | ✅ |
| Contact number, personal email | ⚙ configurable, default **off** |
| Name, LRN, birth date, sex | ❌ never — these are official record fields |
| Section, grade level, subjects | ❌ never |
| Anything academic | ❌ never |

⚖️ **Requires validation.** Whether learners may update their own contact details, or whether that must go through the registrar, is a school policy question. Default off is the safe assumption.

---

## PART 8 — Academic History

### What it delivers

```
Academic History

  SY 2026–2027   Grade 10 · Pearl        In progress    ▸
  SY 2025–2026   Grade 9  · Diamond      Promoted       ▸
  SY 2024–2025   Grade 8  · Ruby         Promoted       ▸
```

Selecting a year expands to that year's subjects, period grades, final grades, general average, and promotion status — all read-only.

This screen is only possible because of the enrollment model in [06 Data Architecture](06-data-architecture.md): one permanent `students` record, one `enrollments` row per year, and academic year as a first-class dimension on every academic row. **V0 cannot produce this screen at all**, because its students are owned by classes and keyed by name.

### Rules

| Question | Answer |
|---|---|
| When does a year become visible in history? | When that year's grades are published. Publication is the only gate, and it is the same gate as everywhere else. |
| Are archived years read-only? | Yes — enforced by trigger at the database level, not by the UI. |
| Can a learner see a year they were not enrolled in? | No. History is derived from their own `enrollments` rows. |
| What about years before the system existed? | Shown only if the registrar migrated them. Clearly labelled as historical/imported so nobody mistakes an incomplete record for a complete one. |
| Can a learner see a corrected grade's history? | **No.** They see the current value. Version history is registrar and audit information, not learner information. |
| What happens to history if a learner transfers out? | Their account is deactivated; the records remain for SF10 issuance by the registrar. |

⚖️ **Requires validation:** whether the school wants learners to see prior-year records at all, and whether an incomplete migrated year should be shown or suppressed.

---

## PART 9 — Student Attendance View

**Default: off.** Enabled per school.

When enabled, the learner sees a **summary**, not the daily ledger:

```
Attendance — Term 2
  School days      61
  Present          58
  Absent            2
  Late              1

  [ view by month ]
```

**Deliberately excluded from the student view:**

- Per-day detail with reasons — reasons are frequently sensitive (illness, family circumstances) and belong with the adviser and guardian
- Teacher notes and remarks on attendance
- Comparison against classmates in any form
- Any figure that could be read as a disciplinary record

> The distinction between a *summary* and a *ledger* is the important one here. A learner benefits from knowing they have three absences. Publishing the annotated day-by-day record to a minor's self-service portal creates a document that can circulate, and the school has no control over where it goes.

⚖️ **Requires validation:** whether attendance is shown at all, at what granularity, and whether it should instead be reserved for a future parent portal.

---

## PART 10 — Student Documents

**Phase 2. Not in MVP.** The MVP student portal is read-only on screen.

### The permission chain

Document access is a chain, and every link must be crossed before a learner can obtain a file:

```
Generated
   ↓        registrar produces the document
Issued
   ↓        numbered, stored, logged
Published to student
   ↓        an explicit, separate registrar action
Student can VIEW
   ↓        renders in the portal
Student can DOWNLOAD
            ⚙ separate setting again — viewing ≠ downloading
```

**View and download are separated on purpose.** A school may be comfortable with a learner seeing their report card on screen, and not comfortable with a PDF of it circulating on Messenger. That is a legitimate distinction, and the product should support it rather than deciding for them.

### Candidate documents

| Document | Student-visible | Downloadable | Phase |
|---|---|---|---|
| Report card | ⚙ configurable | ⚙ configurable | P2 |
| Grade summary | ⚙ configurable | ⚙ configurable | P2 |
| Certificate of enrollment | ⚙ on request | ⚙ | P2 |
| Permanent record (SF10) | ❌ **never self-service** | ❌ | — |
| Good moral certificate | ⚙ on request | ⚙ | P3 |

**SF10 is deliberately never self-service.** It is a controlled, numbered, registrar-issued document that follows a learner between institutions. Self-service issuance would undermine its purpose and its integrity.

### Security

Every document access goes through the same path as everywhere else in the system: authenticate → verify the document belongs to this learner → sign a short-lived URL → redirect. Never a permanent public URL, never a URL protected only by being hard to guess. See [08 Security & Privacy](08-security-and-privacy.md).

---

## PART 11 — Student Authentication

### The provisioning problem

Many learners in the target segment have no institutional email and some have no reliable personal email. Email-based signup does not work as the primary mechanism.

**Recommended approach:**

```
Registrar enrolls learners (or imports the roster)
        ↓
Bulk-generate portal accounts
        ↓
Username = LRN or student number   ·   scoped to the school tenant
Initial password = system-generated, unique per learner
        ↓
Adviser distributes credentials to their section
        ↓
Learner logs in → FORCED password change
        ↓
Optional: learner adds a recovery email or guardian contact
```

**Design points:**

| Decision | Choice | Reason |
|---|---|---|
| Identifier | LRN or student number, **scoped to the tenant** | Learners reliably know it; it is already on their records |
| Not email | Email optional, recovery only | Cannot assume every learner has one |
| Initial password | Unique per learner, never a shared default | A shared default is equivalent to no password at all |
| First login | Forced change | |
| Recovery | Adviser or registrar resets; self-service only where a recovery contact exists | Most realistic for this population |
| MFA | Not for learners in V1 | Disproportionate friction; the account is read-only |
| Deactivation | On transfer out or graduation | Records survive; access does not |

> **Do not use a shared or pattern-based password** such as the learner's birth date. It is the most common shortcut in school systems and it means every learner can access every other learner's account. If bulk generation is too much friction for the school, that is a conversation to have — not a control to drop.

⚖️ **Requires validation:** whether the school is comfortable issuing credentials to minors, how credentials are distributed securely, whether guardian consent is needed for a learner account, and what recovery looks like for a learner with no email. See [08 Security & Privacy](08-security-and-privacy.md) for the legal dimension.

### Session handling

Short-lived access tokens with rotating refresh, an absolute maximum session lifetime, and revocation on deactivation. Shared-device use is common — school computer labs, a sibling's phone — so **an obvious, always-reachable logout** matters more here than in the staff surfaces.

---

## PART 12 (security) — Student Data Isolation

The requirement, stated plainly:

```
Student A  →  ONLY Student A's records

NOT

Student A  →  all students, filtered by the frontend
```

### Enforcement layers

| Layer | Control |
|---|---|
| **Database** | RLS policies scoped to `current_student_id()`. **The real boundary.** |
| **API** | No endpoint accepts a `student_id` parameter that changes what is returned. The learner's identity comes from the token, always. |
| **Application** | Routes carry no student identifier. There is no `/student/12345/grades` URL to tamper with. |
| **Documents** | Ownership verified before a URL is signed. |

### The URL-tampering test

A learner must not be able to reach another learner's data by editing a URL, a request body, or a stored token claim. Concretely, these must all fail:

- Changing an ID in the address bar → **no such route exists**
- Adding `student_id` to an API request → **parameter ignored; identity comes from the token**
- Replaying another learner's document URL → **expired, and ownership re-checked at signing**
- Editing a client-side token → **signature invalid**
- A crafted direct query against the data API → **RLS returns zero rows**

**These become automated tests, not review items.** The portal test suite must include a deliberate cross-student access attempt against every student-reachable table and endpoint, and it must fail the build if any of them returns data.

### What a student must never see

| Never | Why |
|---|---|
| Another learner's record, anywhere, including error text | The core privacy boundary |
| Class rankings or comparative standing | No such view exists for this role |
| Draft, submitted, approved, or finalized-but-unpublished grades | Publication is the gate |
| Teacher working notes or registrar internal remarks | Not learner-facing information |
| Grade version history or correction reasons | Registrar and audit information |
| Any other learner's name in a class list | Rosters are not a student-facing feature |
| Submission workflow status | Internal process |

> Note the roster exclusion specifically. It is tempting to show "your classmates," and it is a genuine privacy leak — a list of who is in a section, exportable by any learner.

---

## PART 13 — Student Portal MVP vs. Future

### MVP — ships with V1

| Feature | Notes |
|---|---|
| Login with forced first-password change | |
| Dashboard with the most recent published period | Including designed empty states |
| View published grades by period | Periods driven by school configuration — **never hard-coded Term 1/2/3** |
| View published grades by subject | |
| General average | ⚙ configurable |
| Profile — identity and current enrollment | Read-only |
| Current subjects and teachers | |
| Academic history — prior years | ⚙ configurable |
| Attendance summary | ⚙ configurable, default off |
| Mobile-first responsive layout | The one surface designed phone-first |
| Logout, session expiry, password change | |

### Phase 2

Document viewing and download (with the full permission chain) · certificate requests · announcements · in-app notification on publication · email notification ⚙ · recovery email self-service · guardian linkage groundwork

### Phase 3 / future

Parent portal built on the guardian model · native mobile app · academic requests and online forms · enrollment self-service · payments and school services · messaging with advisers · learning analytics for the learner

### Keeping the MVP from being contaminated

Three architectural decisions taken now that let all of Phase 2 and 3 be added later **without migration**:

1. **`guardians.portal_user_id` exists from day one** (nullable). The parent portal becomes a new surface over an existing relationship, not a schema change.
2. **Documents are already modelled** with issuance, numbering, and permission state. Student access becomes a new policy, not a new table.
3. **Portal visibility flags live in `school_settings`** from the start. Adding a fifth flag is a row, not a migration.

Nothing else from the future list influences the MVP's data model. That is the test — a future feature that would require reshaping MVP tables should either be designed for now or deliberately declared out of scope.

---

## Success criteria

The portal has succeeded when:

- [ ] A learner logs in on a phone and sees their current grades in under 10 seconds
- [ ] A learner cannot reach another learner's data by any means — proven by automated adversarial tests
- [ ] An unpublished grade is invisible even to a deliberately malformed direct query
- [ ] Period labels come from configuration; a quarter school and a trimester school both render correctly with no code difference
- [ ] Empty and partial states read as informative, not broken
- [ ] The registrar can demonstrate exactly which grades are visible to learners and when they became so
- [ ] Support volume in the first published period is low enough for one person to handle

The last one is the practical test. A portal that generates a flood of "why can't I see my grade" questions has failed at communication even if it is technically correct — which is why the empty-state copy above is treated as a requirement rather than a detail.
