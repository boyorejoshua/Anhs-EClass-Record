/**
 * Build-time configuration.
 */

/**
 * DEMO MODE — scaffolding, not product.
 *
 * Everything gated on this flag exists only so the platform can be shown
 * and reviewed before real school data is loaded. It is NOT part of what
 * a school receives.
 *
 * What it currently gates:
 *   • the "Preview as" role switcher in the sidebar footer
 *   • the "3 trimesters / 4 quarters" tenant toggle in the header
 *   • the fixture data source
 *
 * How it resolves:
 *   • dev server              → on
 *   • production build        → OFF, unless VITE_DEMO_MODE=true is set
 *
 * On approval, when real data and real accounts are in place, set
 * VITE_DEMO_MODE=false (or simply build for production) and every one of
 * these affordances disappears. Roles then come from the signed-in
 * user's `user_roles` rows and nothing else — which is already how the
 * database decides access, so removing this changes no permission.
 */
export const DEMO_MODE: boolean =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE !== 'false');

/** True once a real backend is configured. */
export const HAS_BACKEND: boolean = Boolean(import.meta.env.VITE_SUPABASE_URL);
