# 17 — Product Demo Scenario

*Covers Part 32 of the audit brief.*

---

## What the demo must prove

One thing, in fifteen minutes:

> **A grade is entered once by a teacher and travels to the registrar, into an official document, and onto the student's phone — without a single file being emailed.**

Everything in the script serves that. Anything that does not is cut.

### Demo principles

| Principle | Why |
|---|---|
| **Show the journey, not the features** | A feature tour is forgettable. A grade travelling end to end is not. |
| **Four logins, one browser** | The role switches *are* the story. Use separate browser profiles or windows, pre-authenticated. |
| **Use a realistic fictional school** | Never another customer's data. Never obviously fake data either — "Test Student 1" undercuts credibility. |
| **End on the student's phone** | The emotional peak. Show it on an actual phone if possible. |
| **Let the prospect drive one step** | Hand over the keyboard for grade entry. The moment they type a score themselves, they are evaluating whether their teachers could. |
| **Never demo an unbuilt feature** | If asked, say what is planned and when. A discovered fiction ends the deal. |

---

## The demo environment

A permanently seeded tenant, **reset nightly**, isolated from production.

**Mendtrix Demo National High School**
- 1 school year: SY 2026–2027, **three terms** (matching the DepEd calendar the audience knows)
- Grades 7–10, 3 sections each
- ~40 learners per section, realistic Filipino names, valid-format LRNs
- 8 subjects per grade level with DO 015 grading schemes configured
- 12 teachers, 1 registrar, 1 administrator, 1 principal
- **Term 1 fully complete and published** — so history and the portal have content
- **Term 2 partially encoded** — so there is something live to demonstrate
- Report card template configured with the demo school's logo

> The Term 1 / Term 2 split matters. A demo tenant with no history has an empty student portal and an empty registrar dashboard, which makes the product look thin.

**Prepared accounts** (pre-logged-in, separate windows):

```
teacher@demo      Ms. Reyes — Mathematics, Grade 10 Pearl
registrar@demo    Mr. Santos — School Registrar
student@demo      Joshua Dela Cruz — Grade 10 Pearl
admin@demo        Mrs. Cruz — School Administrator
```

⚠️ Reset the tenant before every demo. A previous prospect's stray keystrokes appearing mid-pitch is avoidable and looks careless.

---

## The 15-minute script

### 0 · Frame it — 1 min

> *"Right now, when your teachers finish grades, they send you files. You open each one, copy the numbers into your own sheet, chase whoever hasn't sent theirs, and build the report cards from that. I'm going to show you the same process with no files at all."*

Name the pain in their words before showing anything. If discovery produced a number — "you said consolidation takes you about three days a term" — use it here.

### 1 · Teacher encodes — 4 min

Log in as **Ms. Reyes**.

- Dashboard: *"Six classes, already here. She didn't set anything up."*
- Open **Grade 10 Pearl — Mathematics — Term 2**
- **Point at the roster.** *"Forty learners, already loaded. No teacher typed this list — it comes from the registrar's enrollment. That's the first place the double entry disappears."*
- Show the assessments already defined
- **Hand over the keyboard.** *"Type a score and press Enter."*
  - The grade recomputes live
  - Enter moves down the column; Tab moves across
  - *"Try pasting a column from a spreadsheet."* — paste works
- Point out `● Saved` — *"No save button, no file, no Downloads folder."*
- Show one deliberate error: a score above the maximum flags immediately
- Show the gaps filter: *"Three learners missing a score — she can see exactly who."*
- Click **Submit**

> The two moments that land hardest: the roster already being populated, and paste working. Both are concrete proof the system removes work rather than adding it.

### 2 · Registrar reviews — 4 min

Switch to **Mr. Santos**.

- Dashboard: *"Submissions arriving live. Twenty-two of thirty classes in for Term 2."*
- **Missing submissions report** — *"Eight outstanding, which teacher, which class, how many days late. No spreadsheet of received emails."*
  - Pause here. For a registrar this is often the single most persuasive screen in the product.
- Open Ms. Reyes's submission — full detail, no re-keying
- Demonstrate **Return**: add a reason, send it back. Switch to the teacher window — it is there, with the reason, and editable again. Switch back, resubmit, **Approve**.
- **Finalize**, then **Publish**
- *"Approve, finalize, and publish are three separate actions. Nothing reaches a learner until someone deliberately publishes it."*

### 3 · The document — 2 min

Still as registrar:

- Generate a report card for one learner — school logo, signatories, three terms, correct layout
- **Generate for the whole section** — 40 cards as one PDF
- *"That used to be a day. Every number came from what Ms. Reyes typed once."*
- Show the issuance log: numbered, dated, attributed

### 4 · The student portal — 3 min

Switch to **Joshua**, **on a phone if possible**.

- Dashboard: Term 2 grades, published moments ago
- *"He sees this because the registrar published it thirty seconds ago. Before that — nothing."*
- Show **Term 1** — already there
- Show **Academic History** — Grade 9, Grade 8
- *"His whole record, from any device. And he can only ever see his own."*

### 5 · Close — 1 min

> *"One entry by the teacher. The registrar reviewed and published it. The document generated itself. The learner has it on his phone. No file was emailed, and nobody typed a number twice."*

Then, if it fits the room:

> *"One more thing — in June 2027 DepEd replaces transmutation with zero-based grading. Every class record template in your school stops being correct. For us, that's a setting we change for you."*

---

## Variations

| Audience | Emphasis | Cut |
|---|---|---|
| **Principal / School Head** | Missing-submissions dashboard, audit trail, student portal | Grid keyboard detail |
| **Registrar** | Review queue, document generation, academic history, corrections | Teacher UX detail |
| **Teachers** | The grid — keyboard, paste, autosave, gaps filter. Let several type. | Registrar and admin entirely |
| **IT / technical** | Security model, RLS isolation, export, backups | The narrative arc |
| **5-minute version** | Teacher submits → registrar publishes → student sees it | Documents, admin, returns |

---

## Two extra scenes, if there is time

**The administrator — 2 min.** Show the period structure configured as trimesters, then show a second demo tenant on quarters. *"Same system. Your calendar is a setting, not a rebuild."* This is the multi-school argument made visible, and it matters to a head who is wondering whether the product was built for someone else.

**Corrections — 2 min.** Reopen a finalized grade with a reason, change it, re-approve. Show the audit trail with old value, new value, actor, timestamp. *"Grades can be corrected. They can never be corrected invisibly."* Registrars respond strongly to this — it addresses the disputed-grade scenario they have all lived through.

---

## Handling hard questions honestly

| Question | Answer |
|---|---|
| *"Can it do our exact SF9?"* | Yes — templates are configuration. Send us your blank form and we'll show you yours rendered. |
| *"What about SF1 through SF10?"* | Seven of the ten come straight from this data. SF3 is textbook inventory and SF8 is health data — different systems, and we'd rather say so than pretend. |
| *"What if the internet drops?"* | Typing continues, saves queue and flush on reconnect. *(Demonstrate it — turn off wifi mid-entry, keep typing, turn it back on.)* |
| *"Can students see each other's grades?"* | No, and it is enforced in the database, not the interface. Happy to walk your IT person through it. |
| *"How long to get us running?"* | Four to six weeks, and it must start at a term boundary. Here is the calendar working backwards. |
| *"What does it cost?"* | Implementation plus an annual subscription, banded by learner count. Let's talk about your procurement process first — that shapes the structure. |
| *"Is this already running somewhere?"* | *(Before the pilot:)* We're implementing with our first school for Term 3. You'd be early, and that comes with attention you won't get later. **Never claim customers that do not exist.** |

> The disconnect demonstration is worth rehearsing. Turning off wifi, continuing to type, and watching it sync back is thirty seconds and it defeats the most common objection in the segment more convincingly than any assurance.
