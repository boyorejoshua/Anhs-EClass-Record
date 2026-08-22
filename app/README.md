# Mendtrix Academic Records — web app (V1)

React + TypeScript + Vite. Implements the design system from
`design_handoff_academic_records` on top of the multi-tenant backend in
`../supabase`.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # grading engine — 28 tests
npm run typecheck
npm run build
```

## Layout

```
src/
├── lib/grading/    the grading engine — pure, no I/O, no React
├── data/           data layer: types + fixtures (Supabase impl next)
├── components/     Sidebar, StatusBadge, SaveIndicator
├── screens/        TeacherDashboard, ClassWorkspace, Gradebook
└── styles/         tokens.css (verbatim from the handoff), app, gradebook
```

## The grading engine is deliberately framework-free

`src/lib/grading` imports nothing. That is what lets the identical module
run in the browser for live recomputation as a teacher types, and in a
server function as the authority on save — one implementation, no drift.
Keep it that way.

## Two deviations from the design handoff, both deliberate

**1. Weights are rendered from configuration, not hard-coded.**
The handoff specifies the gradebook toolbar as the literal string
`Weights: WW 30% · PT 50% · TE 20%`, and `github.md` records those as
*"corrected to the real model"*. They are V0's weights, and **DepEd Order
015 s.2026 superseded them in June 2026**: core subjects are 20/50/30,
MAPEH and EPP-TLE 20/60/20, and Examinations subdivides into
ST1 30 / ST2 30 / TE 40. The visual treatment is exactly as specified;
the values come from the class's grading scheme.

**2. Periods come from the school year, not a fixed three.**
The handoff assumes three terms throughout. The period tabs render from
`year.periods`, so a four-quarter school works with no code change. The
`3 trimesters / 4 quarters` toggle in the header demonstrates this.

Everything else — colours, type scale, spacing, radii, the status
system, the grid spec, the keyboard model — follows the handoff.

## Current state

Built: app shell, role-based navigation, teacher dashboard, class
workspace, and the gradebook (sticky panes, full keyboard model, paste,
autosave, live computation, locked calculated columns, gaps filter,
mobile card entry).

**Both data sources are built.** `src/data/index.ts` picks Supabase when
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and fixtures
otherwise. Screens depend only on the `DataSource` contract in
`src/data/source.ts` and never on either implementation.

The fallback is not a convenience: it keeps local development, the test
suite and the single-file staging build working with no backend, and it
means a missing environment variable degrades to obviously-fake data
rather than a blank screen. A session on fixtures shows a **Sample
data** chip, so nobody demos fake numbers believing they are live.

Not built yet: attendance, submission workflow UI, registrar queue,
student portal, document generation.

## Connecting a backend

```bash
cp .env.example .env.local     # then fill in the two VITE_SUPABASE_* values
```

Apply `supabase/migrations/` to that project first. Reads go through
four contract functions (migration 0014), each returning its screen's
payload in one round trip, already shaped for TypeScript:

| Call | Returns |
|---|---|
| `session_context()` | user, roles, school, academic years and periods |
| `my_classes(year)` | class list with per-period status and completeness |
| `gradebook(class, period)` | scheme, assessments, roster and every score |
| `sf10_jhs(student)` | the permanent record |

Writes go through `save_scores(jsonb)`, which upserts only the dirty
cells. All are `SECURITY INVOKER`, so row-level security applies exactly
as it would to a direct query — they add reachability, never authority.

Because the whole contract is SQL returning JSON, it is verifiable in
psql without a browser or an HTTP layer. That is how the missing
`enrollments` read policy was found.

## Staging build

```bash
npm run build:staging      # -> staging/index.html
```

Inlines the whole app into one self-contained HTML file — openable from
disk, attachable to an email, publishable as a preview. Possible only
because the app is currently client-side end to end; once it talks to
Supabase this becomes a real deployment instead.

Demo affordances are **on** in this build, because a reviewer needs the
role switcher and the tenant toggle to reach every screen. It is not the
build a school gets — `npm run build` is.

The script fails loudly if the bundle ever contains a literal
`</script>`, which would close the tag early and silently break the page.

## Verifying the app runs

`npm run build && npm run preview`. Open a class from the dashboard to
reach the gradebook. The header toggle switches the tenant between three
trimesters and four quarters.

## Demo scaffolding — how it comes out

Two affordances exist purely so the platform can be reviewed before real
data and real accounts land:

| Affordance | Where |
|---|---|
| "Preview as" role switcher | sidebar footer, boxed and labelled **Demo preview** |
| "3 trimesters / 4 quarters" tenant toggle | header, beside a **Demo** chip |

Both are gated on `DEMO_MODE` in `src/config.ts`, which resolves:

- **dev server** → on
- **production build** → **off**, unless `VITE_DEMO_MODE=true`

So `npm run build` already produces a build with neither. Verified by
assertion, not by eye: a production build renders 0 demo blocks and 0
tenant toggles; a `VITE_DEMO_MODE=true` build renders them.

Removing them changes **no permission**. Role has always come from the
signed-in user's `user_roles` rows and access has always been decided by
row-level security in the database — the switcher only ever changed which
navigation was drawn on top of that.

## Appearance

**Refined** is the default and lives in `tokens.css` as the bare `:root`
block — the handoff's language with real elevation, a deeper sidebar and
slightly larger radii. Alternatives are token overrides in `themes.css`:

| Preference | `data-theme` | Character |
|---|---|---|
| **Refined** | *(none)* | Light, dense — the default |
| Comfortable | `comfortable` | Light sidebar, roomier rows |
| Dark | `dark` | Full dark chrome, easier in low light |
| System | resolves | Follows `prefers-color-scheme` |

This is a **real user preference**, not demo scaffolding: it persists per
person in `localStorage` and ships in production builds. `System` keeps a
`matchMedia` listener so an OS change takes effect immediately.

Refined is the absence of `data-theme` rather than a value, so the
default costs nothing at runtime.

Print templates (SF10, report cards) stay on white in **every**
appearance. They are paper, not screen, and an official document must
look the same however the operator has set their preference.

## Motion

`src/styles/motion.css`. One duration scale and one easing, both tokens.
Animation is used where it carries information, not for decoration:

| Where | Why |
|---|---|
| Save indicator | The dot breathes while saving, settles when saved — the most important motion in the product |
| Grade chip | One pulse on recompute, so a value changing three columns away is still attributable |
| Nav rail | Grows from centre, so moving between items reads as travel |
| Panels | Short staggered fade-up, leading the eye down the page |
| Theme change | Colour-only transition; never layout, or the page visibly reflows |
| Buttons | 90ms press — imperceptible present, conspicuous absent |
| Skeletons | Shape of what is coming, so the layout does not jump |

**`prefers-reduced-motion` removes all of it**, and the interface stays
fully legible — no state is communicated by motion alone. Verified in a
browser, not assumed: with reduced motion, animation duration collapses
to ~0 and panels sit at `opacity: 1` rather than being stranded invisible
by `animation-fill-mode`. Printing disables motion too.
