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
 *   • the "three-term / four-quarter" tenant toggle in the header
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

/* ==================================================================== *
 * SIGN-IN BRANDING
 *
 * The one screen that renders BEFORE a session exists, so it cannot read
 * the tenant from a JWT the way every other screen does. That is a real
 * constraint, not an oversight — but the answer is not a literal in the
 * component.
 *
 * Resolution order:
 *   1. VITE_SCHOOL_NAME / VITE_SCHOOL_MARK   per-deployment build vars
 *   2. the host                              anhs.mendtrix.app → ANHS
 *   3. the platform                          neutral, never a school
 *
 * Step 2 is what makes one build serve many schools. Step 3 is what a
 * generic deployment shows: the platform's own name, not the first
 * customer's. Nothing here grants access — the tenant a user actually
 * belongs to still comes from their verified JWT after sign-in.
 * ==================================================================== */

export interface SignInBrand {
  /** Full school name, or the platform name when the host is unknown. */
  name: string;
  /** Short mark for the badge — an acronym, at most 5 characters. */
  mark: string;
}

/** Hosts this build knows by name. A school is added here, not in a screen. */
const KNOWN_HOSTS: Record<string, SignInBrand> = {
  'anhs': { name: 'Angono National High School', mark: 'ANHS' },
};

export function signInBrand(host = globalThis.location?.hostname ?? ''): SignInBrand {
  const name = import.meta.env?.VITE_SCHOOL_NAME as string | undefined;
  const mark = import.meta.env?.VITE_SCHOOL_MARK as string | undefined;
  if (name) return { name, mark: mark || name.slice(0, 4).toUpperCase() };

  const sub = host.split('.')[0]?.toLowerCase() ?? '';
  const known = KNOWN_HOSTS[sub];
  if (known) return known;

  return { name: 'Mendtrix Academic Records', mark: 'MAR' };
}
