# 09 — UX Architecture

*Covers Part 26 of the audit brief — UX and information architecture, devices, offline.*

---

## The governing principle

> **The system must be easier than Excel. If it is not, adoption fails and nothing else in this document matters.**

This is not a design aspiration. It is the product's primary risk, and it has a specific failure signature: teachers keep a private spreadsheet "just to be safe," enter grades there first, and transcribe into the system at deadline. When that happens, the school has *added* a step rather than removed one, the registrar's dashboard shows compliance while the real work happens elsewhere, and the renewal conversation goes badly.

Excel wins on real merits: instant, offline, familiar, keyboard-driven, and forgiving. Any replacement must match it on **speed of entry** before it can win on anything else.

---

## PART 28 — The teacher grade grid

This one screen carries the product. It gets a specification rather than a description.

### Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│ Grade 9 — Pearl · Mathematics 9 · Term 2      [Term 1][Term 2][Term 3] │
│ ● Saved 12:04             38 students · 6 with gaps      [Submit ▸]    │
├────────┬───────────────────────────┬──────────────┬────────────────────┤
│ FROZEN │  Written Works (20%)      │ Perf. (50%)  │  COMPUTED          │
│        ├────┬────┬────┬────┬───────┼────┬────┬────┼─────┬─────┬────────┤
│ #  Name│WW1 │WW2 │WW3 │WW4 │ Total │PT1 │PT2 │ …  │ IG  │Grade│ Remark │
│        │ 20 │ 25 │ 30 │ 20 │  95   │ 50 │ 40 │    │     │     │        │
├────────┼────┼────┼────┼────┼───────┼────┼────┼────┼─────┼─────┼────────┤
│ 1 ABAD │ 18 │ 22 │ 27 │ 19 │  86   │ 45 │ 38 │ …  │82.4 │ 89  │        │
│ 2 BAUT │ 15 │ 20 │[24]│    │  ―    │ 42 │ 35 │ …  │  ―  │  ―  │        │
│ 3 CRUZ │ 20 │ 24 │ 29 │ 20 │  93   │ 48 │ 41 │ …  │91.2 │ 94  │        │
└────────┴────┴────┴────┴────┴───────┴────┴────┴────┴─────┴─────┴────────┘
   ↑ frozen          ↑ HPS row              ↑ live, read-only
```

**Fixed elements:** the student number and name column freeze horizontally; the header and HPS rows freeze vertically. A teacher scrolling to WW8 must still see whose row they are on. V0 gets this right conceptually; V1 must get it right at 45 students × 25 columns on a 13-inch laptop.

### Keyboard specification

Non-negotiable. A teacher entering 45 × 12 scores should never touch the mouse.

| Key | Action |
|---|---|
| `↑ ↓ ← →` | Move one cell |
| `Enter` | Commit, move **down** (column-wise entry — the natural pattern for one assessment across a class) |
| `Tab` | Commit, move **right** (row-wise entry — all scores for one student) |
| `Shift+Enter` / `Shift+Tab` | Reverse |
| `Esc` | Revert the cell to its last saved value |
| `Ctrl+V` | Paste a column or block from a spreadsheet |
| `Ctrl+S` | Force save (even though autosave runs — the muscle memory exists and refusing it feels broken) |
| `Home` / `End` | First / last column in the row |
| `Ctrl+↓` | Jump to the next student with a missing score |
| Typing a digit | Overwrites the cell immediately, no double-click |
| `Del` / `Backspace` | Clear the cell |

**Paste is a hard requirement, not a nice-to-have.** Teachers have existing spreadsheets. Refusing paste tells them the new system is a downgrade, in the first five minutes.

### Entry modes

**Grid mode** (default) — the layout above. Best on laptop and desktop.

**Bulk-entry mode** — one assessment, all students, a single vertical list with large touch targets. This is the *right* mode for a tablet or a phone, and V0 already has the instinct (`renderBulkEntry`, `main.js:466`). Carry it forward and make it the mobile default.

**Import mode** — upload a spreadsheet for one class and period, map columns, preview, commit. The bridge for teachers who genuinely prefer Excel: let them keep their file and push it in, rather than pretending they will stop.

### Saving

| Aspect | Behaviour |
|---|---|
| Trigger | On cell blur, batched over a short debounce window |
| Indicator | Persistent: `● Saved 12:04` / `◐ Saving…` / `⚠ Not saved — retrying` |
| Failure | The value stays in the cell, marked unsaved; a retry queue drains on reconnect |
| Navigation guard | Warn before leaving with unsaved cells |
| **Never** | A forced file download. V0 downloads a backup file every 15 minutes (`main.js:1542`) and toasts *"check your Downloads folder"* — an artifact of having no server, and precisely the anxiety a real backend removes. |

### Validation at the point of entry

| Condition | Response |
|---|---|
| Score > HPS | Red cell, inline message, value retained for correction |
| Negative or non-numeric | Rejected at keystroke |
| Empty | Neutral — a gap, not an error |
| Excused | A distinct mark, visually different from empty |

Errors appear where the error is. A validation summary at submission time, listing "23 problems," is how spreadsheets fail — and V0 defers most checking to the submission checklist (`main.js:952`).

---

## PART 12 — Dashboards & workflows

Detailed content per role is in [04 Functional Requirements](04-functional-requirements.md) M12. The UX rules:

**Every dashboard element answers a question the user actually asks.** A teacher does not ask "how many learners does the school have." Total-learner counts on a teacher dashboard fail the test and should be cut.

**One primary action per dashboard.** Teacher: *resume encoding*. Registrar: *review pending submissions*. Administrator: *fix what is misconfigured*. Principal: *see what is behind*. Student: *see my grades*.

**The teacher's landing page is a resume link.** The most common session is "continue what I was doing." Opening straight into the last class and period edited removes three clicks from the most frequent journey.

### Navigation

| Role | Structure |
|---|---|
| Teacher | Dashboard · My Classes · Attendance · Submissions · Reports |
| Adviser | *(the above)* + My Section |
| Registrar | Dashboard · Students · Enrollment · Submissions · Documents · Reports · Audit |
| Administrator | Dashboard · Setup · Users · Academic Year · Classes · Grading · Templates · Reports · Audit |
| Principal | Dashboard · Monitoring · Reports · Approvals |
| Student | My Grades · My Profile · Announcements |

Deliberately shallow. Two levels maximum. V0's structure (top nav + class bar + term bar + sub-nav) reaches four levels of chrome before content — reasonable in a prototype, too much in a product.

### Context persistence

Academic year, class, and period are **sticky context**, not repeated selections. Chosen once, shown in a persistent bar, changed deliberately. V0's class bar has the right idea and should survive the rebuild.

---

## PART 27 — Devices

Not everything should be mobile-first. Matching the surface to the device honestly:

| Workflow | Desktop | Tablet | Phone | Notes |
|---|---|---|---|---|
| Grade encoding (grid) | ✅ Primary | ◐ Bulk mode | ◐ Bulk mode | The grid needs screen width and a keyboard |
| Bulk entry (one assessment) | ✅ | ✅ | ✅ | Genuinely works everywhere |
| Attendance | ✅ | ✅ Primary | ✅ | Large touch targets; the classroom device is a phone |
| Class summary | ✅ Primary | ✅ | ◐ Scroll | Wide table |
| Submission | ✅ | ✅ | ✅ | Simple action |
| Registrar review | ✅ Primary | ◐ | ○ | Dense comparison work |
| Document generation | ✅ Primary | ○ | ○ | Print-oriented |
| Admin configuration | ✅ Primary | ○ | ○ | Infrequent, complex |
| Dashboards | ✅ | ✅ | ✅ | Reflow to cards |
| **Student portal** | ✅ | ✅ | ✅ **Primary** | Learners are on phones. Design this one phone-first. |

**Stated plainly:** the teacher grade grid is a desktop/laptop experience, and that is the correct trade-off. Contorting a 25-column spreadsheet grid onto a 375px screen produces something worse than either. Phone users get bulk-entry mode, which is genuinely better on a phone than a shrunken grid would be.

**Responsive strategy:** breakpoint reflow, not a separate mobile build. Tables become cards below the tablet breakpoint, except the grade grid, which switches to bulk mode.

---

## PART 29 — Offline & poor internet

### Recommendation: **no offline mode in V1.** Build resilience instead.

A full offline mode means local persistence, a sync engine, conflict resolution, and a merge UI for a shared academic record — a large, high-risk subsystem. Conflict resolution in particular is genuinely hard here: two devices editing the same class record offline produces a merge problem with no safe automatic answer, and a wrong merge silently corrupts a grade.

That cost is not justified when the actual failure pattern is *intermittent* connectivity, not *absent* connectivity. Schools in the target segment generally have working internet in the faculty and administration areas; what they have is unreliability, not absence.

### What ships instead — resilience

| Mechanism | Behaviour |
|---|---|
| **Aggressive autosave** | Small, frequent, batched writes. A dropped connection loses seconds, not a session. |
| **Retry queue** | Failed writes queue in memory and drain automatically on reconnect. |
| **Connection indicator** | Persistent and honest. `● Online` / `⚠ Reconnecting — 4 unsaved`. |
| **Never block on the network** | Typing continues during an outage; cells mark unsaved and flush later. |
| **Navigation guard** | Explicit warning if unsaved values exist. |
| **Light payloads** | One class × one period at a time. No large prefetch. |
| **Import as the fallback** | A teacher with genuinely no connectivity works in Excel and imports later — a supported path, not a workaround. |

### The revisit trigger

Reconsider offline mode if, during the pilot, teachers report being unable to complete encoding **because of connectivity** rather than time. That is measurable — instrument failed-write rates and session interruptions from day one, so the decision is made on data rather than anecdote.

⚖️ **Requires validation:** actual connectivity conditions at the pilot school, per location — faculty room, classrooms, and the registrar's office are likely to differ substantially. Recorded in [20 Assumptions Register](20-assumptions-register.md).

---

## Cross-cutting UX requirements

### Speed

| Interaction | Budget |
|---|---|
| Cell entry → visible | Instant (local state) |
| Recomputation after entry | < 100 ms (client-side engine) |
| Class grid load, 45 students | < 1.5 s |
| Period switch | < 500 ms |
| Save acknowledgement | < 1 s |
| Report card render | < 5 s |

The first two are why the grading engine runs in the browser as well as the server ([07 System Architecture](07-system-architecture.md)). A grid that round-trips to recompute after each keystroke will feel worse than Excel no matter how good the rest is.

### Familiarity

Deliberately borrow from spreadsheets: column letters or codes in headers, a frozen header row, the same keyboard model, a visible totals row, and cell-level rather than form-level editing. Teachers already know this interface. Meeting them there is worth more than any originality.

### Forgiveness

- Undo on the last edit
- `Esc` reverts a cell
- Nothing destructive without confirmation
- Nothing academic is ever permanently deleted
- Returned submissions explain what to fix, in the words of the person returning it

### Accessibility

Minimum keyboard operability throughout (which the grid delivers by design), visible focus indicators, sufficient contrast in both themes, and semantic markup. Not a compliance exercise — a teacher working from a laptop in a bright classroom benefits from the same contrast decisions.

V0's zoom control (`index.html:108-112`) is worth keeping: teachers do use it on dense grids.

### Print

Print styling is a first-class concern in a document-heavy product, not an afterthought. Every table view should print sensibly, and the document engine's templates are print-first by construction. V0's print CSS (`style.css:411`) is the right instinct.

---

## Onboarding the teacher

The first session determines adoption. Target: **a teacher enters their first real grades within 10 minutes of first login, unassisted.**

```
Login  →  "You have 6 classes" (already populated — nothing to set up)
       →  Pick a class
       →  Roster already there (this is the moment the value lands)
       →  "Add your first assessment" — one guided step
       →  Grid opens with a 20-second inline tour of the keyboard model
       →  Encode
       →  Autosave confirms visibly
```

The single most persuasive moment is the roster already being populated. It is concrete, immediate proof that the system removed work rather than adding it — and it is entirely a consequence of FR-CLS-5 in [04 Functional Requirements](04-functional-requirements.md).

V0's in-app guide and FAQ (`renderInstructions`, `main.js:1100`) is good source material for the help content and should be ported rather than rewritten.
