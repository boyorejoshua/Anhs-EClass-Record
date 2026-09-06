# 32 · Public Enrollment — audit and design

**Phase 3.0. Investigation and design only. No schema, no code.**

Written 2026-09-06 against commit `99eeaea` and the live Supabase project
`wxkxdqwhefezjfmysypa`. Every claim about the current system below was
checked against the source tree or queried from the database; where
something was inferred rather than observed, it says so.

The target workflow, from the original scope:

> an applicant (student or parent, no account) submits an application →
> gets back an application ID and a way to check its status → a registrar
> reviews and approves or rejects → on approval a real student record and
> enrolment are created → section assignment → portal account
> provisioning → the applicant signs in as a student.

---

## 0. The finding that comes before the design

**Public Enrollment should not be built until `KNOWN-ISSUES.md` #1 is
closed.** This is not a caveat to note in passing; it decides sequencing.

`KNOWN-ISSUES.md` #1 — seven demo accounts on original passwords, and
leaked-password protection disabled in Supabase Auth — carries the
repository's own words: *"Must be closed before any real learner data
enters the system."*

Public Enrollment **is** the mechanism by which real learner data enters
the system, and worse than the general case:

- the data arrives **from the public**, not from a registrar typing it,
- it concerns **minors**, and
- it arrives **before** anyone has decided the applicant is a student, so
  there is no enrolment, no guardian relationship and no portal account
  to scope it to.

Shipping the intake path first would create exactly the condition #1
exists to prevent, and would do it at the least defensible moment. The
ordering in `ROADMAP.md` § Next already puts password rotation first; the
existence of this design does not change that, and Phase 3.1 should not
start until #1 is closed.

Two further prerequisites are cheaper but real:

| Prerequisite | Why it blocks | Where it lives |
|---|---|---|
| Rotate passwords + leaked-password protection | Above | `KNOWN-ISSUES.md` #1 |
| A decision on PII retention for **rejected** applications | See §5.4 — a rejected application is a file of a minor's personal data with no owner and no deletion rule. RA 10173 is not optional | Open question **Q-7** |
| A written exception to **D-005** | Every `public.` function today revokes EXECUTE from `anon`. This feature requires the first deliberate exception in the codebase. It must be a decision record, not a quiet grant | Open question **Q-1** |

Nothing else found in this audit argues against building it. The data
model is a good fit, the approval path is almost entirely reuse, and the
security model is achievable within the existing architecture. The
objection is **sequencing**, not feasibility.

---

## 1. How students and enrolments are created today

*(Investigation question 1.)*

Everything below is in `supabase/migrations/0025_student_management.sql`.

### `public.admit_student(p_student jsonb, p_enrollment jsonb)`

`SECURITY DEFINER`. The whole registrar-driven creation path, in one
call:

1. `app.has_permission('students.write')`, else `42501`.
2. `app.current_school_id()` must be non-null, else `42501`.
3. First and last name required, else `23514`.
4. **Duplicate refusal before any write** — see §4.
5. `insert into public.students (…)` — 19 columns, all read out of the
   `p_student` jsonb with `btrim`/`nullif` normalisation.
6. `v_enrol_id := public.enrol_student(v_student_id, p_enrollment)`.
7. `app.write_audit('students.create', …)`.
8. Returns `{studentId, enrollmentId}`.

### `public.enrol_student(p_student_id uuid, p_enrollment jsonb)`

Also `SECURITY DEFINER`, and **callable on its own** — the comment says
why: "this is what promotion is: the same person, a new year, a new
grade level." It checks `enrollments.write`, requires
`academicYearId` and `gradeLevelId`, verifies the student belongs to the
caller's school, refuses a second enrolment in the same year (`23505`),
inserts with `status` defaulting to `'enrolled'`, and audits.

`sectionId` is **optional** at this point. Section assignment is
therefore already a separate, deferrable step — `update_enrollment`
handles it later. The target workflow's "section assignment" stage needs
no new mechanism.

### What this means for a public path

**Reusable as-is, on approval:** `admit_student` end to end. An approval
RPC executing as a registrar can call it and get student + enrolment +
duplicate refusal + audit for free. This is the single largest piece of
the feature and it already exists.

**What a public path genuinely needs that is different:**

| Need | Why `admit_student` cannot serve it |
|---|---|
| Accept data with **no session** | Every gate in it is `app.has_permission(…)` + `app.current_school_id()`, both JWT-derived |
| Hold data that is **not yet a student** | It writes `students` immediately. An application under review must not create a student row — a rejected applicant would leave a permanent record of a child who never attended |
| Be **re-read by the applicant** | Nothing in the student spine is readable without a session |
| Carry **application state** | `students.status` and `enrollments.status` are DepEd enrolment states, not a review workflow. Overloading either would be the "two concepts, one column" mistake the codebase avoids elsewhere |

So: **a new intake table, and an approval RPC that is mostly a wrapper
around `admit_student`.** That is the shape.

One detail worth carrying forward: **`student_number` is not
auto-generated.** No sequence, no default, no generator function — I
checked. `admit_student` takes it from the payload and it is nullable.
Whether an approved applicant gets a student number automatically, and
in what format, is Q-6.

---

## 2. The current `anon` posture

*(Investigation question 2 — the most important section.)*

Queried directly against production on 2026-09-06.

### What is true today

| Fact | Value |
|---|---|
| RLS policies naming `anon` | **zero** |
| RLS policies with `PUBLIC` roles (which would catch `anon`) | **zero** |
| Distinct policy role-sets across the whole `public` schema | exactly one: **`{authenticated}`** |
| `public.` functions executable by `anon` (outside extensions) | **none** |
| Tables with RLS enabled | **46 of 46** |
| Tables with FORCE RLS | 45 of 46 (`public.permissions`, `KNOWN-ISSUES.md` #3) |

**Every policy in the database is scoped to `authenticated`.** That is a
remarkably clean invariant and it is the thing this feature perturbs.

### The part that matters, and is not obvious

`anon` **already holds broad table-level SQL grants** — `SELECT`,
`INSERT`, `UPDATE`, `DELETE`, even `TRUNCATE` — on essentially every
table in `public`. That is stock Supabase, not something this project
did.

It is currently harmless **only because RLS refuses every row**. The
grants are wide open; the policies are what hold the line.

And this is the landmine:

```
pg_default_acl, schema public, object type "r" (relations):
  anon=arwdDxtm/postgres          ← a, r, w, d, D, x, t, m
  authenticated=arwdDxtm/postgres
```

**Default ACLs grant `anon` full DML on every *future* table created in
`public`.** A `public_applications` table created by a migration would be
`INSERT`/`SELECT`/`UPDATE`/`DELETE`-able by `anon` the moment it exists,
with nothing but RLS between an anonymous caller and every row in it.

Consequences for the design, and these are requirements, not
suggestions:

1. The migration that creates the intake table **must explicitly
   `revoke all on public.<table> from anon, public`** in the same
   migration. Relying on the default is relying on a grant that is
   actively against us.
2. `alter table … enable row level security` **and `force row level
   security`** — no repeat of `KNOWN-ISSUES.md` #3.
3. **No policy should name `anon` at all.** The write path should be a
   `SECURITY DEFINER` RPC, so the table stays at zero anon-reachable
   policies and the function is the only door. This keeps the
   `{authenticated}`-only policy invariant intact and makes the exception
   auditable in one place.
4. That RPC is the **first deliberate exception to D-005** and needs a
   decision record (Q-1).

### The test-coverage gap this exposes

Across all six SQL suites there is **exactly one** assertion about
`anon`: `05_schedule_and_tenant_security.sql` line 159, checking `anon`
has no EXECUTE on `my_schedule()`.

There is **no suite asserting that `anon` cannot read or write any
table.** Today that is fine, because it is trivially true and uniformly
enforced. The moment `anon` has one legitimate door, "anon can't do
anything" stops being trivially true and starts being a property that
needs testing per table. **Phase 3.1 must add an anon-isolation suite**
— see §7.

### School resolution without a JWT

`app.current_school_id()` reads the verified JWT. An anonymous applicant
has none. So the school must arrive as a **parameter**, which is in
direct tension with D-004 ("tenant comes from the verified JWT, never a
client parameter").

The tension is real but resolvable, and the resolution should be written
down rather than assumed:

- `public.schools.code` exists, is `NOT NULL`, and is a citext-style
  user-defined type — a natural public identifier (`ANHS`). No schema
  change needed for this.
- The parameter selects **which school's inbox to write into**. It grants
  no read access to anything, so the D-004 failure mode ("a client
  parameter decides what I can see") does not apply.
- The applicant-facing form already knows its school from the host, the
  same way `signInBrand()` in `app/src/config.ts` resolves
  `anhs.mendtrix.app → ANHS` today.
- An invalid or unknown code must fail closed and **must not** reveal
  whether a school exists — see Q-4 on enumeration.

This is a narrow, one-way exception: *write-only, into a named tenant's
inbox, granting nothing.* It should be recorded as a decision (Q-1).

---

## 3. Status lookup without an account

*(Investigation question 3.)*

**There is no precedent in this repository.** I searched the migrations
for `token`, `verification_code`, `claim_code`, `reference_code` and
every `pgcrypto` use: the only hits for "token" are comments about the
JWT. Nothing resembles "ID + something only the applicant knows."

The nearest relatives, and what each does and does not give us:

| Existing thing | Gives us | Does not give us |
|---|---|---|
| `app.next_document_number(type, year)` (0008) | A real, tested pattern for generating a per-school, per-year, human-readable sequential reference, backed by `document_number_sequences` | It is `SECURITY DEFINER` on `app.current_school_id()` — JWT-bound, so not directly callable here |
| `pgcrypto` **1.3, installed** | `crypt()` / `gen_salt()` — bcrypt hashing, already used elsewhere in this project's history | Nothing about delivery |
| `citext` **1.6, installed** | Case-insensitive email comparison for free | — |

### Recommended shape

**Application reference + claim code, where only a hash of the claim code
is stored.**

- **Reference** (`ANHS-2027-000042`): not secret, printable, quotable
  over the phone. Mirror `next_document_number`'s sequence approach, with
  the school passed in rather than read from a JWT.
- **Claim code**: 8–10 characters from an unambiguous alphabet (no
  `0/O`, `1/I/l`), generated server-side, **shown exactly once** on
  submission and never retrievable. Store `crypt(code, gen_salt('bf'))`
  only.
- **Lookup** is an RPC taking *both*, returning only a status and
  timestamps — never the submitted payload back, never the reviewer's
  notes, never the reason for rejection unless Q-5 says otherwise.
- **Lookup must be rate-limited and constant-ish in its failure mode**:
  the same response for "no such reference" and "wrong claim code".
  Otherwise the reference alone becomes an oracle for which applications
  exist.

The alternative — reference plus date of birth — is worse and should be
rejected explicitly: a birth date is guessable, is often known to third
parties, is *not* a secret, and for a minor it is precisely the datum we
should be least willing to accept as an authenticator.

An emailed magic link is a third option, materially better on usability
and materially worse on assumptions: it requires every applicant to have
an email address they can reach, which in this market is exactly the
assumption `docs/20-assumptions-register.md` exists to stop us making
casually. Q-3.

---

## 4. Duplicate and returning-student detection

*(Investigation question 4.)*

Two existing mechanisms, and they are quite different in quality.

### What `admit_student` already does — exact match, refuse

```sql
select st.id into v_existing
from public.students st
where st.school_id = v_school and st.deleted_at is null
  and ((v_lrn    is not null and st.lrn = v_lrn)
    or (v_number is not null and st.student_number = v_number));
```

Exact equality on **LRN or student number**, scoped to the school and
excluding soft-deleted rows, raising `23505` with the existing learner's
display name. There is also a partial unique index on LRN — the comment
notes it is partial "because a learner can be admitted before one is
issued," which is exactly the applicant's situation.

This is a *refusal*, not a *match*: it stops a duplicate, it does not
help a registrar recognise a returning student.

### What the Import Center already does — fuzzy match, offer candidates

This is the better precedent and it is already built
(`0026_import_center.sql`):

- `app.normalise_name(text)` — `lower()`, accents folded via
  `app.fold_accents`, all non-alphanumerics collapsed to single spaces.
  Its own comment: *"for COMPARISON only. Never stored, never
  displayed."*
- The resolver returns, per input row, a status of
  **`matched` / `ambiguous` / `new`** plus a `candidates` array carrying
  `studentId`, `enrollmentId`, `displayName`, `lrn`, `studentNumber`.
- One candidate → `matched`; more than one → `ambiguous` and *nothing is
  linked automatically*; zero → `new`.
- Matching happens **on the server**, deliberately. The client-side
  comment in `app/src/lib/import/plan.ts` explains why: a browser-side
  matcher would be a second implementation *and* "a way to probe for
  learners the caller cannot read."

That last point transfers directly and sharply: **candidate matching for
a public application must never run for the anonymous caller.** The
applicant must not learn whether a name matches an existing learner. The
match runs when the **registrar** opens the application for review, under
their session and their RLS.

### Recommended approach

Match at **review time**, not submission time, reusing
`app.normalise_name` and the `matched/ambiguous/new` vocabulary already
in the codebase:

1. **Exact LRN** — the strongest signal. Present as "this is almost
   certainly the same learner."
2. **Normalised name + birth date** — a strong pair.
3. **Normalised name alone** — weak; show as `ambiguous`, never
   auto-link.

And critically: matching **proposes**, the registrar **decides**. On
approval the registrar chooses "this is a new learner" (→ `admit_student`)
or "this is an existing learner returning" (→ `enrol_student` against the
existing `student_id`, which is what promotion already does). Both paths
exist. The registrar's choice is the thing to record in the audit row.

An unresolved question: whether cross-school matching should ever happen
for a genuine transfer. It should not, by default — D-002 and the whole
isolation suite say a school cannot see another school's learners. Q-8.

---

## 5. Minimum schema change

*(Investigation question 5.)*

### Reused, unchanged

- `admit_student`, `enrol_student`, `update_enrollment` — the entire
  approval-side write path
- `app.normalise_name`, `app.fold_accents` — matching
- `app.write_audit` — the audit trail
- `app.has_permission` and the `students.write` / `enrollments.write`
  codes — no new permission strictly required, though Q-2 asks whether
  review should have its own
- `manage-users` Edge Function, `create_student_account` action, and
  `link_student_portal_account` — portal provisioning, already proven
  end to end on 2026-09-04
- `public.schools.code` — school resolution, no new column
- `document_number_sequences` + the `next_document_number` pattern —
  reference generation
- `pgcrypto` — claim-code hashing
- `enrollment_events` — the existing record of enrolment-affecting events

### Genuinely new

**One table, and it is the only unavoidable one.**

`public.enrollment_applications` — one row per submitted application.

| Group | Columns | Note |
|---|---|---|
| Identity | `id uuid pk`, `school_id uuid not null`, `reference text not null`, `claim_code_hash text not null` | `unique (school_id, reference)` |
| Applicant | the same demographic shape `admit_student` already accepts — names, sex, birth date, birth place, address parts, contact number, email | Deliberately mirror the `students` column names so approval is a straight mapping, not a translation |
| Intent | `academic_year_id`, `grade_level_id`, `previous_school`, `is_transferee` | |
| Guardian | name, relationship, contact | `guardians` exists as a table; whether to reuse it pre-approval is Q-9 |
| State | `status text not null`, `submitted_at`, `reviewed_at`, `reviewed_by`, `decision_reason` | See §6 |
| Outcome | `student_id uuid null`, `enrollment_id uuid null` | Set on approval; the link back to the real record |
| Abuse | `submitted_ip inet null`, `submitted_user_agent text null` | Only if Q-7 says we may retain them |

Composite FK carrying `school_id` where it points at tenant-scoped rows,
per the existing convention.

**Possibly a second table**, only if Q-7 lands on server-side throttling:
`public.application_submissions` (school, IP hash, minute bucket, count)
— see §8.

**Nothing else.** No change to `students`, `enrollments`, `users`, or any
existing table. That is a genuinely small footprint, and it is the
strongest technical argument in the feature's favour.

### 5.4 — the retention problem, stated plainly

A rejected application is a **complete personal-data file on a minor**,
submitted by the public, belonging to no student, attached to no
enrolment, and with no deletion rule. It is not covered by "nothing is
ever deleted" (D-010), which is a rule about *academic records of
enrolled learners* — an applicant who was never admitted has no academic
record to preserve.

This needs a written retention policy before the table exists, not after
it fills up. And note: **`pg_cron` is not installed** on this project (I
checked), so there is no in-database scheduler for a purge job. Retention
would need either enabling `pg_cron`, an external scheduled call, or a
manual registrar action. Q-7.

---

## 6. The workflow state machine

Modelled on the grade lifecycle, which is the house pattern: every
transition an RPC that verifies permission, verifies the transition is
legal, writes, and audits.

```
                    (anonymous, RPC)
                          │
                          ▼
                      submitted
                          │  registrar opens it
                          ▼
                     under_review
                    ╱     │      ╲
          (info needed)   │       ╲
                ▼         │        ▼
         awaiting_info    │      rejected  ── terminal
                │         │
        (applicant        │
         resubmits)       ▼
                └──►  approved
                          │  admit_student + enrol_student
                          ▼
                       enrolled  ── terminal (student_id set)
                          │
                          ▼
              (optional) account_created
```

Notes on the choices:

- **`approved` and `enrolled` are separate states.** Approval is a
  decision; enrolment is a write that can fail. Collapsing them would
  produce the state the grade lifecycle deliberately avoids — a decision
  recorded with no data behind it. The same reasoning as
  `compute-period-grades` persisting before submitting.
- **`awaiting_info` is optional for 3.1** and could be deferred to a
  later phase. It is drawn because retro-fitting a state into a live
  workflow is worse than declaring it and not using it.
- **`rejected` is terminal, not deleted** — but see §5.4 on retention.
- **`account_created` may not deserve to be a state.** Portal
  provisioning already works and already records itself; this may be
  better as a nullable timestamp than a state. Q-10.

Each transition writes `app.write_audit` with actor and before/after, as
every other workflow in this system does.

---

## 7. Security model for the anonymous path

Requirements, in the order they must be satisfied:

1. **One door.** A single `SECURITY DEFINER` RPC —
   `public.submit_enrollment_application(p_school_code text, p_payload jsonb)`
   — is the only thing `anon` may execute. Every other `public.` function
   keeps its D-005 revoke.
2. **The table is not reachable.** `revoke all … from anon, public` in
   the creating migration; RLS enabled *and* forced; no policy naming
   `anon`. The `{authenticated}`-only policy invariant survives intact.
3. **Write-only for the applicant.** The submit RPC returns the reference
   and the one-time claim code, nothing else. It never returns row
   contents, never confirms whether a matching learner exists, never
   confirms whether the school has that grade level open.
4. **Status lookup is a second, separate RPC** taking reference + claim
   code, returning a status enum and timestamps only. Same failure
   response for unknown reference and wrong code.
5. **No enumeration.** The reference is sequential and therefore
   guessable — that is the price of it being quotable over the phone.
   The claim code is what protects the row, so the claim code must be
   the only thing that gates the read, and lookup must be throttled.
6. **Registrar side is ordinary.** Review, approve and reject are normal
   `authenticated` RPCs behind `app.has_permission`, with normal RLS on
   the table for `{authenticated}` scoped by `app.current_school_id()`.
   Nothing new is needed there.
7. **New test suite.** `supabase/tests/07_public_application.sql`, and it
   must assert at minimum:
   - `anon` has EXECUTE on exactly the two intended functions and nothing
     else;
   - `anon` has no `SELECT`/`INSERT`/`UPDATE`/`DELETE` reachable on
     `enrollment_applications` despite the default grant;
   - a School A reference + claim code returns nothing under School B;
   - a wrong claim code and an unknown reference are indistinguishable;
   - an approved application produces exactly one student and one
     enrolment, and a second approval of the same application is refused.

   And `01_tenant_isolation.sql` gains the new table.

---

## 8. Rate limiting and abuse surface

*(Investigation question 6.)*

**What exists today: nothing.** I searched the whole stack — SQL, TypeScript,
config, `vercel.json` — for rate limiting, throttling, captcha, Turnstile
and hCaptcha. The only hits are in `docs/08-security-and-privacy.md`,
which is a **planning-era** document describing what was intended, and
lists "progressive backoff per account and per IP" and rate limiting on
"auth endpoints, export and document generation, import." None of it was
built, and until now nothing needed it: every write path required a
session, and a session required an account a registrar created.

What is available without new infrastructure:

| Layer | What it offers | Gap |
|---|---|---|
| Supabase Auth | Built-in rate limits on auth endpoints | Irrelevant — this path has no auth |
| PostgREST / RPC | **Nothing by default** | This is the exposed surface |
| Vercel | Static hosting; the app talks to Supabase directly from the browser | Not in the request path at all, so it cannot throttle |
| `pg_cron` | Would enable a cleanup/decay job | **Not installed** |
| `pg_net` | Would enable outbound calls (e.g. to a captcha verifier) from SQL | **Not installed** |

So the honest position: **the first public write path in this
application would ship onto a stack with no rate limiting of any kind,
and the architecture has no natural chokepoint to add it to**, because
the browser talks to PostgREST directly with no server of ours in
between.

Options, roughly in order of effort:

1. **In-RPC counter.** A small table keyed by (school, hashed IP, minute)
   incremented inside the submit RPC, refusing past a threshold. Cheap,
   no new infrastructure, no new dependency. Weak against distributed
   abuse and requires retaining an IP hash (Q-7). Probably the right
   first answer.
2. **A captcha on the form** (Turnstile or hCaptcha), verified inside an
   Edge Function that fronts the submit RPC. Stronger, adds a third-party
   dependency and a network hop, and moves the write path out of
   PostgREST into an Edge Function — which is arguably where a public
   write belongs anyway, since `manage-users` already establishes the
   pattern of an Edge Function doing privileged work with validation in
   front of it.
3. **Application window gating.** Refuse submissions entirely unless the
   school has an open application window for a year. Not a rate limit,
   but it closes the surface for most of the calendar and is trivial
   given `academic_years` already carries status. Worth doing regardless.

Note that abuse here is not only volume. A public form that accepts a
minor's name, birth date and address is an attractive target for
**garbage insertion** (poisoning a registrar's queue) and for
**reconnaissance** (probing whether a given child is already enrolled).
Option 3 plus §7.3's "never confirm anything" rule addresses the second
better than any rate limit does.

---

## 9. Phase breakdown

Sized so each phase is independently reviewable and independently
revertible. **None of these starts until §0's prerequisites are met.**

### 3.1 · Schema and backend
The table, the two anonymous RPCs, the registrar-side transition RPCs,
the grants and revokes, the RLS, and the new test suite (§7.7). No UI.
Done when `07_public_application.sql` passes and `01_tenant_isolation.sql`
covers the new table.

### 3.2 · Public application form
The applicant-facing route. This is the first screen in the app that
renders **without a session**, which touches `App.tsx`'s session gate and
`nav.ts` — neither currently has a concept of a public route. That is
real work and is easy to under-estimate: today, no session means the
sign-in screen. Ends with the reference and claim code shown once, with
an explicit "write this down" treatment.

### 3.3 · Status lookup
Small, separate, and deliberately after 3.2 so the claim-code UX is
settled before something depends on it. A reference + claim code form and
a status display. Also public.

### 3.4 · Registrar review screen
The queue, the application detail, the candidate matches from §4, and
approve / reject / request-info. Reuses `RegistrarDashboard`'s queue
patterns.

### 3.5 · Approval → provisioning
Wire approval to `admit_student` / `enrol_student`, section assignment,
and optionally portal provisioning via the existing `manage-users`
path. Kept separate from 3.4 because this is the step that writes to the
real student spine, and it deserves its own review and its own rehearsal
against production — exactly as the demo account creation got on
2026-09-04.

A sixth phase, **3.6 · retention and purge**, exists only if Q-7 requires
it. It is listed so it is not forgotten rather than because it is
planned.

---

## 10. Open questions for Joshua

None of these should be answered by an agent. Each changes the design.

**Q-1 · Do we accept the first deliberate `anon`-executable function?**
D-005 currently admits no exceptions and was learned twice. This feature
cannot exist without one. Should it be recorded as a new decision record
amending D-005, and does the exception get a naming convention (e.g. a
`public_` prefix) so it is obvious in a grep?

**Q-2 · Should application review have its own permission code?**
`students.write` and `enrollments.write` exist and would work. A distinct
`applications.review` would let a school delegate review to someone who
cannot otherwise create learners. Which does ANHS actually want?

**Q-3 · Claim code, or emailed link, or both?**
§3 recommends a claim code shown once. An emailed link is friendlier and
assumes every applicant has reachable email. What is true for ANHS's
actual intake population?

**Q-4 · May the form reveal that a school exists?**
An invalid school code has to fail. Failing differently for "no such
school" and "school not accepting applications" is friendlier and leaks
the school list. Given the platform is multi-tenant and the school list
is not secret, is leaking it actually a concern?

**Q-5 · Does a rejected applicant see a reason?**
Showing one is humane and is a disclosure. Not showing one is opaque and
generates phone calls. A middle option is a fixed set of reason codes
rather than free text.

**Q-6 · Who assigns the student number, and in what format?**
There is no generator today. Is it registrar-entered at approval, or
generated, and if generated, what shape? This is school policy, not a
technical choice.

**Q-7 · Retention of rejected applications, and of IP data.**
How long is a rejected application kept, who may see it after the
decision, and is it deleted or anonymised? Separately: may we store a
hashed IP for throttling, and for how long? RA 10173 applies and this
should have a real answer, ideally a reviewed one.

**Q-8 · Cross-school matching for transferees.**
A genuine transferee may exist in another tenant. Default is that we
cannot and should not look. Confirm that is right, accepting that a
transferring learner is re-keyed by hand.

**Q-9 · Guardian data before approval.**
`guardians` exists as a table. Do we write guardian rows at approval
only, or hold guardian details inside the application row until then?
Holding them in the application row is simpler and keeps unapproved data
out of the real spine — recommended, but it is a data-model choice with
consequences for SF forms later.

**Q-10 · Is portal provisioning part of approval or a separate act?**
The workflow diagram shows `account_created` as optional. Approving an
application and creating a login are different decisions with different
risks; the demo on 2026-09-04 did them separately and that felt correct.

---

## 11. What this audit verified, and how

| Claim | How |
|---|---|
| `admit_student` / `enrol_student` behaviour and duplicate refusal | Read `0025_student_management.sql` |
| Zero policies name `anon`; all policies are `{authenticated}` | `pg_policies` on production |
| `anon` holds default DML grants on `public` tables | `information_schema.role_table_grants` |
| Default ACLs grant `anon` DML on *future* tables | `pg_default_acl` |
| `public.permissions` blocks `anon` despite its SELECT grant | Policy is `roles={authenticated}`, RLS enabled |
| No `anon`-executable functions outside extensions | `has_function_privilege` sweep |
| One `anon` assertion in six SQL suites | grep of `supabase/tests/` |
| No token / claim-code / verification precedent | grep of all migrations |
| `pgcrypto` 1.3 and `citext` 1.6 installed; `pg_cron` / `pg_net` not | `pg_extension`, `pg_available_extensions` |
| `app.normalise_name`, and `matched/ambiguous/new` | `0026_import_center.sql`, `app/src/lib/import/plan.ts` |
| No applications/admissions table exists | `pg_tables` pattern search |
| `student_number` is not auto-generated | grep for sequence/default on the column |
| No rate limiting anywhere in the stack | grep across SQL, TS, config; only planning-era mentions in `docs/08` |
| `schools.code` exists, `NOT NULL` | `information_schema.columns` |

Nothing in this document was written from memory of how the system
probably works.
