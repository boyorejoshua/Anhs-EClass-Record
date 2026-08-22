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

## ⚠️ `VITE_DEMO_MODE=true` is set in the build

The app currently runs on **fixture data** — no Supabase project is
configured — so the demo affordances (role switcher, tenant toggle) are
the only way to reach the registrar, admin and SF10 screens at all.

**Remove `VITE_DEMO_MODE=true` from `buildCommand` the moment real data
is connected.** Leaving it on would let anyone with the URL switch into
the registrar view. That is harmless against fixtures and unacceptable
against a real school's records.

## Connecting the backend

Set these in the Vercel project's environment variables, then remove the
demo flag above:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

With them set, `app/src/data/index.ts` selects the Supabase data source
instead of fixtures. Without them it falls back to fixtures, which is
what keeps local development and the single-file staging build working.

The migrations in `supabase/` must be applied to that project first.

## ⚠️ Not a private URL

`anhs-grading-system.vercel.app` is publicly reachable. Do not point it
at a Supabase project holding real learner data until authentication is
enforced and the items in `docs/20-assumptions-register.md` are settled.
