# 07 — System Architecture

*Covers Parts 7 and 25 of the audit brief.*

---

## PART 7 — Multi-School Tenancy

### The three options, compared honestly

| Dimension | **A** — DB per school | **B** — Multi-tenant | **C** — Hybrid |
|---|---|---|---|
| Data isolation | Strongest — physical | Strong — RLS, if disciplined | Per-tier |
| Blast radius of a bug | One school | Potentially all schools | Mixed |
| Migrations at 10 schools | 10 runs, 10 chances to diverge | 1 run | 1 + N dedicated |
| Deploying a fix | 10 deployments | 1 deployment | 1 + N |
| Backup/restore | 10 regimes; restore is clean | 1 regime; per-tenant restore needs tooling | Mixed |
| Monthly infra cost at 10 schools | ~10× baseline | ~1.2× baseline | Between |
| Onboarding a new school | Provision infrastructure | Insert a row | Depends on tier |
| Per-school customization | Trivially easy — **and that is the trap** | Must be configuration | Easy for dedicated tier |
| Cross-school analytics | Very hard | Trivial | Hard |
| Ops burden for 1–2 people | **Unsustainable past ~4 schools** | Manageable | Manageable |

### Recommendation: **Option B**, with Option C as a documented escape hatch

**One multi-tenant Postgres, shared schema, `school_id` on every table, isolation enforced by Row Level Security.**

The decisive argument is not technical, it is operational. At ten schools, Option A means ten migration runs, ten backup regimes, and ten upgrade windows for a 1–2 person team. That is what ends the business — not a scaling limit.

There is a subtler danger in Option A worth naming: **separate databases make per-school customization easy, and easy customization is fatal to a product.** When each school has its own database, "just add a column for this school" is a five-minute job. Ten schools later there are ten divergent schemas and no product — only ten bespoke systems wearing the same name. A shared schema makes that shortcut structurally unavailable, which forces the configuration layer to be good. **The constraint is the feature.**

### Non-negotiable isolation controls

Multi-tenancy is safe only if these hold. If any is skipped, Option A becomes the correct choice by default.

**1. RLS forced on every tenant table.**

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;   -- applies to the table owner too
```

**2. Tenant identity comes from a verified token claim, never from client input.**

```sql
CREATE FUNCTION current_school_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'school_id','')::uuid
$$;

CREATE POLICY tenant_isolation ON students
  USING (school_id = current_school_id());
```

The claim is set at token issuance from the user's verified role assignment. No API accepts a `school_id` parameter that affects what is returned.

**3. Subdomain resolves the tenant, but never grants access.**

`anhs.mendtrix.app` selects branding and the login context. Authorization still comes from the token. A user who edits the subdomain gets a login page for a school they cannot enter.

**4. An isolation test suite runs on every migration.**

Automated, table by table: create two schools, seed both, authenticate as School A, and assert zero rows of School B are visible via every table, every view, and every RPC. This test failing blocks the deploy. It is the single most important test in the codebase.

**5. Composite foreign keys carry `school_id`** (see [06 Data Architecture](06-data-architecture.md)) so a cross-tenant reference is a constraint violation, not a logic bug.

### The escape hatch

Because the schema is shared, a school can be moved to a dedicated database later **with no code fork** — same migrations, same application, different connection. That is Option C, and it should be:

- Offered as a **premium tier** for schools with specific data-residency or isolation requirements
- Priced to cover its real operational cost
- **Not built until a customer pays for it**

Documenting the path now costs nothing and prevents the architecture from foreclosing it.

---

## PART 10 / 31 — Technical Architecture

### Layer separation

```
┌───────────────────────────────────────────────────────────────┐
│  CLIENT                                                       │
│  React + TypeScript SPA, static build on a CDN                │
│  ├── Teacher workspace   ├── Registrar portal                 │
│  ├── Admin console       └── Student portal                   │
│  Shared grading module (read-only preview computation)        │
└───────────────────────────────────────────────────────────────┘
              │ HTTPS · JWT bearer
              ↓
┌───────────────────────────────────────────────────────────────┐
│  API                                                          │
│  ├── PostgREST — RLS-guarded reads and simple writes          │
│  └── RPC / Edge Functions — everything carrying policy:       │
│      submit · return · approve · finalize · publish · reopen  │
│      compute grades · generate documents · run imports        │
└───────────────────────────────────────────────────────────────┘
              ↓
┌───────────────────────────────────────────────────────────────┐
│  DATA — Postgres                                              │
│  Tables (RLS forced) · views · functions · triggers           │
│  Grading engine · audit triggers · archive-year enforcement   │
└───────────────────────────────────────────────────────────────┘
              ↓
┌──────────────┬──────────────┬──────────────┬──────────────────┐
│ Auth         │ Object       │ Document     │ Email            │
│ (managed)    │ storage      │ renderer     │ (transactional)  │
│              │ (private)    │ (Chromium)   │                  │
└──────────────┴──────────────┴──────────────┴──────────────────┘
```

### The read/write split — the most important API decision

**Reads go through RLS.** A query returns what the user's token permits, enforced by the database. New screens cannot leak data by forgetting a `WHERE` clause.

**Writes that carry policy go through server-side functions.** Every state transition — submit, return, approve, finalize, publish, reopen — is an RPC that:

1. Verifies the actor holds the required permission
2. Verifies the transition is legal from the current state
3. Performs the write
4. Writes an audit row
5. Emits any notification

A modified client cannot skip a step, because the steps are not in the client. The privacy gate — a grade becoming student-visible — lives in the RLS predicate itself:

```sql
CREATE POLICY student_reads_published_only ON period_grades
  FOR SELECT USING (
    school_id = current_school_id()
    AND class_enrollment_id IN (SELECT ... WHERE student_id = current_student_id())
    AND EXISTS (
      SELECT 1 FROM grade_submissions gs
      WHERE gs.class_id = <this class>
        AND gs.academic_period_id = <this period>
        AND gs.published_at IS NOT NULL
    )
  );
```

A future developer writing a careless student-facing query still cannot expose an unpublished grade.

### Stack recommendation

| Layer | Choice | Why — and why not the obvious alternative |
|---|---|---|
| **Frontend** | React + TypeScript + Vite, SPA | Every screen is behind a login. No SEO, no first-paint pressure, no server-rendering benefit. A static bundle on a CDN has no server to pay for, patch, or page someone about at 2am. **Not Next.js:** it would add a server tier that earns nothing here and doubles the deployment surface. |
| **Grade grid** | TanStack Table + a hand-built keyboard/paste layer | This one screen decides whether teachers adopt the product. It justifies real engineering effort and a specific library choice. Generic form components will not produce a spreadsheet-grade editing experience. |
| **Styling** | Tailwind + a small component set | Fast, consistent, and — importantly — print styles are first-class, which matters for a document-heavy product. |
| **Backend platform** | Supabase (managed Postgres, Auth, Storage, Edge Functions) | Puts tenant isolation *in the database*, which is the strongest available place for it. One managed service instead of four separately operated ones. Matches the direction V0 was already pointed. **Not a hand-rolled Node/Express + Postgres stack:** it means building and operating auth, storage, and connection management for no differentiating benefit. |
| **Database** | PostgreSQL | RLS is the reason. Nothing else offers this quality of row-level multi-tenancy natively. |
| **Grading engine** | One TypeScript module, run in two runtimes | The browser imports it for instant preview as a teacher types; a Deno Edge Function runs the identical code as the authority on save. **One implementation, no drift.** The alternative — plpgsql on the server plus JS in the client — guarantees two subtly different formulas. |
| **PDF** | Print-optimized HTML → headless Chromium worker → stored PDF | The templates are HTML, so the same artifact serves screen, print, and PDF. **Not a PDF-drawing library:** hand-positioning boxes for a DepEd form layout is enormously more work and unmaintainable when a layout changes. V0's `window.print()` (`main.js:1362`) stays for teacher scratch prints — it is genuinely the right tool for that — but official documents need server-side rendering, numbering, and archival. |
| **Excel** | SheetJS, both directions | Already proven in V0 (`excelGrades`, `main.js:1176`). Client-side parse for import preview; **server-side validation and commit**, so import rules live in one enforceable place. |
| **Email** | A transactional provider (Resend, Postmark, or SES) | Cheap, reliable, with bounce handling. Never self-host SMTP. |
| **Hosting — frontend** | Any static CDN host | Trivial, cheap, rollback-friendly. |
| **Hosting — PDF worker** | A single small container (Fly.io / Railway / Render) | The one component that genuinely needs a long-running process with a browser binary. Keep it small and stateless. |
| **CI** | GitHub Actions | Migrations, isolation tests, grading-engine unit tests, build, deploy. |

### Where the grading engine lives — the reasoning

This deserves its own note because it is the decision most likely to be second-guessed.

Three options were considered:

1. **Database only (plpgsql).** Authoritative and close to the data, but the teacher's grid cannot show a live recomputation as they type without a round trip per keystroke. Unusable for the primary screen.
2. **Client only.** Fast and responsive, but the client is not trustworthy and every computation would need re-verification anyway.
3. **One TypeScript module, executed in both the browser and a server function.** ✅

Option 3 wins because the code is identical in both places. The browser's result is a *preview*; the server's result is *stored*. If they ever diverge, that is a bug with one location to fix, not a reconciliation problem.

The engine is a pure function:

```
compute(scheme, assessments, scores) → { components[], initialGrade, periodGrade }
```

No I/O, no database access, fully unit-testable. **Its test suite is built from V0's known-good outputs** — a real asset, since V0's arithmetic on its own terms is correct and provides free regression fixtures.

### Environments

| Environment | Purpose |
|---|---|
| Local | Supabase CLI, seeded with two synthetic schools so isolation is testable from day one |
| Staging | Full stack, synthetic data only — **never a copy of production learner data** |
| Production | Live schools |
| Demo | A permanently seeded fictional school, reset nightly. See [17 Demo Scenario](17-demo-scenario.md) |

> Copying production data to staging is the most common way school data leaks. The seeded-synthetic rule is a hard rule.

---

## PART 37 — What was deliberately rejected

Recording these with reasons, so they do not get relitigated informally.

| Rejected | Why |
|---|---|
| **Microservices** | The entire domain is one transactional boundary. Splitting grades from enrollments creates distributed-transaction problems in exchange for nothing. A modular monolith with a clean data layer is correct at this size, and remains correct well past ten schools. |
| **Kubernetes** | A static frontend, a managed database, and one small worker. There is nothing to orchestrate. |
| **A message broker** | Notification volume is a few thousand a day at ten schools. A database table plus a scheduled job handles it. Revisit if it ever becomes untrue. |
| **GraphQL** | Adds a schema layer and query-complexity concerns while making RLS harder to reason about. PostgREST plus RPC covers the need. |
| **Any AI feature** | No school problem in this brief is solved by it. Grade prediction and at-risk scoring in particular would introduce fairness and accountability questions into a system whose entire value is being *defensible*. Explicitly off the roadmap. |
| **A native mobile app for V1** | A responsive web app covers every V1 workflow. A native app is a second codebase and an app-store release process. Phase 3, if demand is real. |
| **Real-time collaborative editing** | Two teachers do not edit one class record simultaneously. Optimistic concurrency with a conflict warning is sufficient. |
| **Custom auth** | Never build authentication. Use the managed service. |
| **Blockchain / digital-signature infrastructure for documents** | Legal equivalence to a wet signature is not established for this use case (see [08 Security & Privacy](08-security-and-privacy.md)). A cryptographically notarised document that is not legally accepted solves nothing. |

### The overengineering test

Before any architectural addition, it must pass all three:

1. **Which school problem does this solve?** If the answer is a hypothetical school, stop.
2. **What breaks without it, at 10 schools and 20,000 learners?** If nothing, stop.
3. **Can 1–2 people operate this at 3am during a submission deadline?** If not, stop.

---

## Scale check

Sizing at the target of 10 schools × ~1,500 learners.

| Metric | Estimate |
|---|---|
| Schools | 10 |
| Learners | 15,000 |
| Enrollments per year | 15,000 |
| Class enrollments (≈9 subjects) | 135,000 |
| Assessments per period (≈12/class × 1,700 classes) | ~20,000 |
| **Assessment scores per period** | **~1.6 million** |
| Assessment scores per year (3 periods) | ~4.8 million |
| Period grades per year | ~405,000 |
| Attendance records per year | ~27 million |

Attendance dominates, and it is the only table needing a plan: **partition `attendance_records` by academic year** from the start. Everything else is unremarkable for Postgres — single-digit millions of narrow rows with tenant-first indexes.

**Concurrency:** the real load spike is submission deadline day, when most of a school's teachers encode simultaneously. That is hundreds of concurrent users doing small writes, not a throughput problem — but it *is* a reason autosave must batch rather than fire per keystroke, and a reason to load-test that specific scenario before the first pilot deadline.

**Conclusion:** a single managed Postgres instance handles the ten-school target comfortably. Revisit at roughly 50 schools, by which point the revenue justifies the attention.
