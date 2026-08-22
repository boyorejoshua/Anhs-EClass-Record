# Deployment

`vercel.json` at the repo root drives the `anhs-grading-system` project.

## Why this file exists

The Vercel project was created before the V1 app existed, with
`framework: null` and no build step — so it served the **repo root** as
a static site. The repo root `index.html` is V0, which we deliberately
never touched, so the deployment kept showing the old design no matter
what landed on `main`. Nothing was wrong; nothing was pointing at the
new app.

## What it does now

| Path | Serves |
|---|---|
| `/` | The V1 app, built from `app/` |
| `/legacy/` | V0, exactly as it was — untouched, still working |

V0 is kept deliberately. It is the most accurate record of how the
school actually works, and it is still usable as a demo asset. Delete
the `mkdir -p dist/legacy && cp ...` clause from `buildCommand` when it
is no longer wanted.

### The trailing slash on `/legacy/` is load-bearing

V0's markup references its assets **relatively** (`assets/js/main.js`).
Served at `/legacy`, the browser resolves that against the root and
requests `/legacy/../assets/js/main.js` → `/assets/js/main.js`, which
does not exist in the V1 build, so the SPA catch-all rewrite answers it
with V1's `index.html`. V0 then loads HTML as JavaScript and renders a
blank page.

The redirect from `/legacy` to `/legacy/` is what makes the relative
paths resolve inside the V0 directory. Do not remove it, and do not
change the rewrite's `(?!legacy/)` guard.

## Backend

The app is connected to Supabase project `wxkxdqwhefezjfmysypa`
(region `ap-southeast-1`, Singapore). `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set inline in `buildCommand`.

**The anon key belongs in the client.** It carries no authority: every
table has `FORCE ROW LEVEL SECURITY`, and every policy derives the
tenant from `app.current_school_id()`, which reads the verified JWT —
either a top-level `school_id` claim or `app_metadata.school_id`, both
server-issued. An anonymous holder of this key can reach nothing,
because `app.current_school_id()` returns NULL and every policy fails
closed. Prefer moving it to the Vercel dashboard's environment
variables when convenient; the build reads whichever is set.

Without those variables, `app/src/data/index.ts` falls back to fixtures.
That fallback is what keeps local development, the test suite and the
single-file staging build working with no backend.

Apply `supabase/migrations/` in order before pointing a build at a new
project. `supabase/seed.sql` loads two demo tenants; it assumes matching
`auth.users` rows already exist, because `public.users.id` carries a
foreign key to `auth.users` with `ON DELETE RESTRICT`.

## Demo accounts

Seeded into the demo tenants. Password for all of them:
`MendtrixDemo2026!`

| Email | Role | Tenant |
|---|---|---|
| `maria@anhs.test` | Subject Teacher | ANHS (trimester) |
| `juan@anhs.test` | Subject Teacher **and** Class Adviser | ANHS |
| `registrar@anhs.test` | Registrar | ANHS |
| `admin@anhs.test` | School Administrator | ANHS |
| `joshua@anhs.test` | Student portal | ANHS |
| `teacher@demo.test` | Subject Teacher | Mendtrix Demo (quarter) |
| `learner@demo.test` | Student portal | Mendtrix Demo |

These are demonstration credentials on demonstration data. Rotate or
delete them before the project holds a real learner record.

## `VITE_DEMO_MODE` is now off

It was set while the app ran on fixtures, because the demo affordances
(role switcher, tenant toggle) were the only way to reach the registrar,
admin and SF10 screens. With real authentication in place they are no
longer needed, and leaving the flag on would let anyone with the URL
switch into the registrar view.

## ⚠️ Not a private URL

`anhs-grading-system.vercel.app` is publicly reachable. It currently
holds only seeded demonstration data. Do not load a real learner record
into this project until the items in `docs/20-assumptions-register.md`
are settled — in particular the Data Privacy Act obligations in
`docs/08-security-and-privacy.md`.
