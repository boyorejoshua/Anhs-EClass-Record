# 08 — Security & Privacy

*Covers Part 22 of the audit brief.*

> **This document is not legal advice.** Items marked ⚖️ identify where Mendtrix needs professional legal or data-privacy counsel before commercial deployment. They are flagged so they are not overlooked — not resolved here.

---

## Why this is a high-stakes system

The platform holds, for thousands of minors: full names, birth dates, addresses, guardian contact details, and complete academic performance histories. Under Philippine law this is personal information about children, held on behalf of a school.

Two consequences follow, and they should shape engineering priorities rather than sit in a compliance appendix:

1. **A breach here is materially worse than in most software.** The data subjects are children who did not choose this system and cannot meaningfully consent to it.
2. **Mendtrix is a processor acting for the school.** The school carries the primary obligation, but the school's exposure is created by Mendtrix's engineering. Getting this wrong damages the customer, not just the vendor.

---

## Threat model

Ranked by likelihood × impact, which is deliberately different from ranking by sophistication.

| # | Threat | Likelihood | Impact | Primary control |
|---|---|---|---|---|
| 1 | **Cross-tenant data exposure** — School A sees School B | Medium | Catastrophic | Forced RLS + composite FKs + isolation test suite |
| 2 | **Unpublished grades leaking to students** | Medium | High | Publication check inside the RLS predicate |
| 3 | **A student accessing another student's record** | Medium | High | RLS scoped to the authenticated learner |
| 4 | **Shared or weak teacher credentials** | **High** | Medium | Password policy, session management, MFA for privileged roles |
| 5 | **Insider misuse** — a legitimate user browsing beyond need | Medium | Medium | Least-privilege scoping + audit logging |
| 6 | **Mendtrix staff over-access** | Medium | High | No standing data access; time-boxed, audited support sessions |
| 7 | **Grade tampering** | Low | Catastrophic | Server-side transitions, append-only audit, versioned corrections |
| 8 | **Credential leakage into source control** | **High** — *already happened in V0* | High | Secret scanning in CI, no keys in the repo |
| 9 | **Document URL sharing** | Medium | Medium | Signed, short-lived URLs; never public buckets |
| 10 | **Data loss** | Low | Catastrophic | Managed backups + tested restores |

> Threat 4 deserves emphasis because it is the *most likely* and the least technical. Teachers share passwords — with a colleague covering a class, with a student assistant helping encode. No control fully prevents this; the mitigations are making the system pleasant enough to use that shortcuts are unattractive, scoping teacher access narrowly so a shared credential exposes little, and making the audit trail visible enough that misuse is traceable.

> Threat 8 is listed as *already happened*: V0 has a live Supabase URL and anon key committed at `supabase.js:20-21`, present in public git history. See the action item in [18 Risks](18-risks.md).

---

## Authentication

| Control | Requirement |
|---|---|
| Provider | Managed auth service. **Never hand-rolled.** |
| Password storage | bcrypt or Argon2 via the provider. V0's `btoa()` (`main.js:44`) is encoding, not hashing — the single worst security defect in the prototype. |
| Password policy | Minimum 10 characters, checked against a breached-password list; no forced rotation (it produces `Password1!`, `Password2!`) |
| Login identity | Email address. **Not** a derived `${empId}@school.edu.ph` pattern as in `supabase.js:41`, which hard-codes one school's domain into the identity system. |
| Rate limiting | Progressive backoff per account and per IP; lockout with administrator unlock |
| Sessions | Short-lived access token, rotating refresh token, absolute maximum lifetime, revocable |
| MFA | Available for all; **recommended mandatory for Registrar and School Administrator** |
| Student accounts | Provisioned in bulk; forced password change on first login |
| Deactivation | Immediate session revocation on account deactivation |

### Student account provisioning

A genuine design problem worth calling out: many learners have no institutional email, and some have no reliable personal email.

Recommended approach — school-scoped usernames (LRN or student number) plus a school-issued initial password, distributed by the adviser, with forced change at first login. Email becomes optional and is used for recovery only where present.

⚖️ **Requires validation.** Whether a school is comfortable issuing credentials to minors, how they are distributed, and what recovery looks like for a learner with no email are questions for the school, and may touch on parental consent. Recorded in [20 Assumptions Register](20-assumptions-register.md).

---

## Authorization

Three enforcement layers, each independently sufficient for the common case:

**1. Database (RLS) — the real boundary.** Every tenant table has forced RLS. Policies express tenant scope, role permission, and record scope. A query cannot return what the policy forbids, regardless of what the application asks for.

**2. Server functions — policy-carrying writes.** Submit, return, approve, finalize, publish, and reopen verify permission and transition legality before writing, and always write an audit row.

**3. Client — usability only.** The UI hides what the user cannot do. This is a courtesy, never a control. V0 gets this exactly backwards: authorization is *only* in the navigation (`buildNav()`, `main.js:224`), every page exists in the DOM, and `switchRole()` (`main.js:216`) lets any user reassign their own role.

### Scope enforcement

```sql
-- A teacher reaches learners only through their assigned classes
CREATE POLICY teacher_reads_own_class_students ON class_enrollments
  USING (
    school_id = current_school_id()
    AND class_id IN (
      SELECT id FROM classes
      WHERE primary_teacher_id = auth.uid()
         OR id IN (SELECT class_id FROM class_teachers WHERE user_id = auth.uid())
    )
  );
```

Access follows the teaching load. Change an assignment and access changes with it — no permission editing, no stale grants.

### Mendtrix staff access

⚖️ **Contractually significant.** Mendtrix personnel must have **no standing access to learner data.**

- Platform administration (tenant provisioning, migrations, monitoring) is separated from data access
- Support access to a school's data is **requested, time-boxed, and reason-tagged**
- Every support session writes a prominent audit entry **visible to the school's own administrator**
- The school can review who from Mendtrix accessed what, and when

This should appear as a commitment in the customer agreement. It is also good engineering discipline: a support workflow that requires deliberate escalation is a workflow that gets used deliberately.

---

## Data protection

| Layer | Control |
|---|---|
| In transit | TLS 1.2+ everywhere; HSTS; no mixed content |
| At rest | Managed disk encryption on database and object storage |
| Backups | Encrypted; managed point-in-time recovery |
| Documents | **Private buckets only.** Access exclusively via signed URLs with short expiry, checked against the requester's permission before signing |
| Exports | Generated on demand, delivered over an authenticated session, never left in a public location |
| Logs | Application logs must never contain grades, learner names, or credentials |
| Secrets | Environment variables and a secret manager; **secret scanning enforced in CI** |

### Document access — the specific rule

An issued report card is a PDF in object storage. The failure mode is a URL that works for anyone who has it.

```
Request  →  Authenticate  →  Check permission against document.subject_id
         →  Sign URL, 5-minute expiry  →  Redirect
```

Never a permanent public URL. Never a URL whose only protection is being hard to guess.

---

## Backup, recovery & retention

| Concern | Approach |
|---|---|
| Backup frequency | Continuous PITR + daily snapshot |
| Retention | 30 days PITR, 12 monthly snapshots ⚖️ *confirm against school expectations* |
| **Restore testing** | **Quarterly, to a scratch environment, documented.** An untested backup is a hope. |
| Per-tenant restore | Requires tooling under multi-tenancy — build the "restore one school to a point in time" runbook **before** the first customer, not after the first incident |
| Data export on exit | A school must be able to leave with its complete data in a documented, open format. This belongs in the contract and reduces the buyer's perceived lock-in risk. |
| Retention policy | ⚖️ Academic records are legally long-lived — SF10 conceptually follows a learner for life. Deletion policy must be validated, not assumed. |

> The export-on-exit commitment is worth treating as a *sales* asset, not just an obligation. A school choosing a small vendor worries about being stranded; a written export guarantee answers that objection directly.

---

## Philippine privacy considerations ⚖️

**Every item in this section requires professional validation. None of it is legal advice.**

### Republic Act No. 10173 — Data Privacy Act of 2012

Areas Mendtrix must have counsel confirm:

| Topic | The question to put to counsel |
|---|---|
| **Controller / processor roles** | The school appears to be the Personal Information Controller and Mendtrix the Personal Information Processor. Confirm, and confirm what each role obliges. |
| **Outsourcing agreement** | A written data-processing/outsourcing agreement between school and Mendtrix is very likely required. What must it contain? |
| **NPC registration** | Does the school's data processing system require registration with the National Privacy Commission? Does Mendtrix have its own registration obligation? |
| **Data Protection Officer** | Is the school required to designate one? Does Mendtrix need one? |
| **Minors' data** | What consent or notice is required for processing learners' data, and does the school's existing enrollment consent cover an online system? |
| **Breach notification** | Confirm the notification thresholds and timelines to the NPC and to data subjects, and build the runbook to meet them. |
| **Data subject rights** | Access, correction, objection, erasure — how do these apply to academic records that the school is separately obliged to retain? |
| **Data residency** | Is there any requirement or school expectation that data stays in the Philippines? This affects hosting region choice and should be settled early. |
| **Retention** | How long must academic records be kept, and what may ever be deleted? |
| **Cross-border transfer** | If hosting is outside the Philippines, what applies? |

### DepEd-specific ⚖️

- DepEd has its own data privacy issuances and a Data Privacy Manual. Confirm what a school-deployed third-party system must comply with.
- Confirm whether any DepEd clearance, accreditation, or notification is needed before a public school adopts a third-party academic records system. **This could be a hard gate on the whole business model and should be checked early rather than late.**
- Confirm whether digitally generated forms are accepted in place of the official templates, and under what conditions.

### Digital signatures ⚖️

**Do not assume a digital signature is legally equivalent to a wet signature on an academic document.**

The Electronic Commerce Act (RA 8792) recognises electronic signatures in general, but whether a specific academic document — particularly SF10, which follows a learner between institutions — is accepted by a receiving school, by DepEd, or by a university with an image-based or cryptographic signature is a separate question with a practical answer that may differ from the legal one.

**Recommended position for V1:** generate documents with signature *blocks* for wet signing, exactly as the school does today. Treat digital signatures as a Phase 2+ investigation gated on a definite answer. A system that produces documents nobody will accept has solved nothing.

---

## Application security

| Area | Control |
|---|---|
| Input validation | Server-side on every write; the client's validation is UX only |
| SQL injection | Parameterised queries throughout; no string-built SQL |
| XSS | Framework escaping by default. V0's pattern of interpolating names into `onclick=` handlers (`main.js:437`) with only single-quote escaping is exactly what to avoid |
| CSRF | Bearer tokens rather than cookie-based session auth |
| File upload | Type and size validation, content sniffing, no execution, quarantined bucket |
| Dependencies | Automated vulnerability scanning; a patch cadence someone owns |
| Rate limiting | Auth endpoints, export and document generation, import |
| Error handling | Generic messages to the client; details to server logs only. **Error text must never reveal whether a record exists in another tenant.** |
| Headers | CSP, HSTS, X-Content-Type-Options, Referrer-Policy |

---

## Audit logging as a security control

Detailed in [04 Functional Requirements](04-functional-requirements.md) M14. The security-relevant properties:

- **Append-only, enforced in the database.** UPDATE and DELETE revoked from every role, including the service role. An audit log an attacker can edit is not an audit log.
- Every authentication event, including failures
- Every grade change with old and new values
- Every workflow transition with actor and reason
- Every document issuance
- Every Mendtrix support session
- Every permission change

⚖️ Retention of audit logs should be validated separately from academic-record retention — they may warrant a longer or shorter period.

---

## Security roadmap

**MVP — non-negotiable, ships with the first pilot:**
- Forced RLS with the automated isolation test suite in CI
- Managed auth with a real password policy
- Server-side enforcement of every state transition
- Publication gate inside the RLS predicate
- Audit logging of the seven minimum events
- Private document storage with signed URLs
- TLS everywhere; no secrets in source control
- Tested backup and restore

**Phase 2:**
- MFA enforced for Registrar and School Administrator
- Session management UI and revocation
- The audited Mendtrix support-access workflow
- Automated dependency scanning in CI
- A written incident-response runbook
- A third-party penetration test ⚖️ **before the first paying customer beyond the pilot**

**Phase 3:**
- Per-tenant encryption keys, if a customer requires it
- SIEM-style anomaly alerting
- Formal security certification, if the market demands it

---

## Pre-commercial-deployment checklist ⚖️

These must be resolved before money changes hands, not before launch:

- [ ] Legal counsel has reviewed controller/processor roles and drafted the data-processing agreement
- [ ] NPC registration obligations determined for both school and Mendtrix
- [ ] Consent basis for processing minors' data confirmed with the school
- [ ] Breach notification runbook written and tested against confirmed timelines
- [ ] Retention policy confirmed against DepEd record-keeping requirements
- [ ] DepEd clearance or accreditation requirements checked for third-party systems
- [ ] Digital signature acceptability answered definitively, or wet signatures retained
- [ ] Data residency expectations confirmed and hosting region chosen accordingly
- [ ] Penetration test completed and findings remediated
- [ ] Backup restore tested and documented
- [ ] Cyber-liability insurance evaluated
- [ ] Exposed V0 Supabase credentials rotated or the project retired
