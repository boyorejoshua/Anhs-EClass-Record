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

Fixtures, not Supabase, back the UI today — `src/data/fixtures.ts`
mirrors the seeded database shape exactly, so `src/data/supabase.ts` is
a drop-in replacement returning the same types.

Not built yet: attendance, submission workflow UI, registrar queue,
student portal, document generation.

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
