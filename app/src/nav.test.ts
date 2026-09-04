import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLASS_TABS, NAV, defaultRole, isReady, navItem, resolveActiveRole, rolesFromSession,
} from './nav';
import type { Role } from './data/types';

/**
 * The regression these tests exist for.
 *
 * `navKey` used to be consulted in exactly one place — a boolean for the
 * SF10 screen — so every other menu entry fell through to the dashboard.
 * Clicking Attendance showed the dashboard. Nothing failed; the wrong
 * screen simply appeared, which is the hardest class of bug to notice
 * and the easiest to reintroduce.
 *
 * These assert the structural invariant that prevents it: every menu
 * entry is either marked ready and handled by App's switch, or marked
 * planned and rendered as NotAvailable. There is no third state.
 */

const ROLES: Role[] = ['teacher', 'adviser', 'registrar', 'school_admin', 'student'];

/**
 * Every route App's `screen()` switch actually handles, READ OUT OF
 * App.tsx rather than listed here.
 *
 * This used to be a hand-maintained literal, which made the test claim
 * more than it checked: it caught a new nav entry only if you also
 * forgot to update the list, and it could not notice a case that was
 * deleted. Parsing the source is crude, but it cannot drift.
 */
const APP_SOURCE = readFileSync(
  fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8');

const HANDLED = new Set(
  [...APP_SOURCE.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]!),
);

describe('navigation model', () => {
  it('gives every role at least one menu entry', () => {
    for (const role of ROLES) {
      expect(NAV[role].length, `${role} has no navigation`).toBeGreaterThan(0);
    }
  });

  it('uses unique keys within a role', () => {
    for (const role of ROLES) {
      const keys = NAV[role].map((i) => i.key);
      expect(new Set(keys).size, `${role} has duplicate nav keys`).toBe(keys.length);
    }
  });

  it('routes every READY menu entry to a screen App actually handles', () => {
    for (const role of ROLES) {
      for (const item of NAV[role]) {
        if (item.readiness !== 'ready') continue;
        expect(
          HANDLED.has(item.key),
          `${role} → "${item.label}" (${item.key}) is marked ready but App has no case for it. ` +
          'A ready route with no screen renders the wrong page silently.',
        ).toBe(true);
      }
    }
  });

  it('gives every PLANNED entry a specific explanation', () => {
    // A dead end is acceptable; an unexplained one is not. The note is
    // what turns "it did nothing" into "here is why, and what it needs".
    for (const role of ROLES) {
      for (const item of NAV[role]) {
        if (item.readiness !== 'planned') continue;
        expect(item.note, `${role} → "${item.label}" is planned but has no note`).toBeTruthy();
        expect(item.note!.length).toBeGreaterThan(40);
      }
    }
  });

  it('reports readiness accurately for every entry', () => {
    for (const role of ROLES) {
      for (const item of NAV[role]) {
        expect(isReady(role, item.key)).toBe(item.readiness === 'ready');
      }
    }
  });

  it('treats every DETAIL route as reachable for every role', () => {
    // These have no menu entry — they are reached by opening a row — so
    // a readiness lookup finds nothing. Reporting them unavailable is
    // how opening a class once bounced back to the dashboard, and the
    // same trap caught the student record when it was added.
    for (const role of ROLES) {
      for (const id of ['class', 'student'] as const) {
        expect(isReady(role, id), `${role} cannot reach ${id}`).toBe(true);
      }
    }
  });

  it('has no menu entry pointing at a route id it does not define', () => {
    for (const role of ROLES) {
      for (const item of NAV[role]) {
        expect(navItem(role, item.key)).toBe(item);
      }
    }
  });

  it('builds every class workspace tab', () => {
    expect(CLASS_TABS.every((t) => t.readiness === 'ready')).toBe(true);
    expect(CLASS_TABS.map((t) => t.key)).toEqual([
      'overview', 'setup', 'gradebook', 'summary', 'analytics', 'loa',
      'attendance', 'students', 'reports', 'submission',
    ]);
  });

  it('carries the whole legacy Record Book', () => {
    // Legacy sub-tabs: Setup · Grade Entry · Bulk Entry · Summary ·
    // Analytics · LOA. Bulk Entry is intentionally absent — it is a MODE
    // of the gradebook here (paste a block from Excel), not a page.
    const rb = CLASS_TABS.filter((t) => t.group === 'record-book').map((t) => t.key);
    expect(rb).toEqual(['setup', 'gradebook', 'summary', 'analytics', 'loa']);
  });

  it('keeps the Record Book tabs contiguous', () => {
    // The group renders one seam label before the first member. A gap
    // would draw the label mid-run and split the workflow visually.
    const idx = CLASS_TABS
      .map((t, i) => (t.group === 'record-book' ? i : -1))
      .filter((i) => i >= 0);
    expect(idx).toEqual(Array.from({ length: idx.length }, (_, k) => idx[0]! + k));
  });
});

describe('role resolution', () => {
  it('derives roles from the session rather than defaulting to teacher', () => {
    expect(rolesFromSession(['registrar'])).toEqual(['registrar']);
    expect(defaultRole(['registrar'])).toBe('registrar');
  });

  it('keeps every role a user genuinely holds', () => {
    // Juan is a subject teacher AND an adviser. V0 could not express
    // this: its role column is a mutually exclusive CHECK.
    expect(rolesFromSession(['teacher', 'adviser'])).toEqual(['adviser', 'teacher']);
  });

  it('prefers the widest role as the landing view', () => {
    expect(defaultRole(['teacher', 'registrar'])).toBe('registrar');
    expect(defaultRole(['student', 'teacher'])).toBe('teacher');
  });

  it('returns nothing for an account with no role', () => {
    // Must not silently fall back to 'teacher' — that was the old bug,
    // and it showed a teacher menu to anyone whose roles failed to load.
    expect(rolesFromSession([])).toEqual([]);
    expect(defaultRole([])).toBeNull();
  });

  it('ignores role strings the app does not know', () => {
    expect(rolesFromSession(['janitor', 'teacher'])).toEqual(['teacher']);
    expect(defaultRole(['janitor'])).toBeNull();
  });
});

/* ==================================================================== *
 * THE BUG: clicking "Your roles" did nothing outside DEMO_MODE
 *
 * `App.tsx` used to compute the active role as
 * `(DEMO_MODE ? roleOverride : null) ?? sessionRole ?? 'teacher'`. The
 * comment above it called `roleOverride` "the demo switcher and nothing
 * else" — true of the DEMO_MODE preview grid, and NOT true of the
 * sidebar's "Your roles" group, which calls the identical setter
 * whenever a real account holds more than one role, in every build.
 * Outside DEMO_MODE that formula never looked at `roleOverride` at all,
 * so the click changed state and the screen showed no difference. This
 * is exactly what "clicking another role does nothing" looks like for
 * an account like the school's owner, which is multi-role by design and
 * runs in a production build with DEMO_MODE off.
 * ==================================================================== */
describe('resolveActiveRole — the multi-role switch', () => {
  it('outside DEMO_MODE, a HELD role from "Your roles" actually switches', () => {
    // This is the regression: with the old formula this returned
    // 'school_admin' regardless of roleOverride, because DEMO_MODE was
    // false and the override was never consulted.
    expect(resolveActiveRole({
      demoMode: false, roleOverride: 'registrar',
      heldRoles: ['school_admin', 'registrar', 'adviser', 'teacher', 'student'],
      sessionRole: 'school_admin',
    })).toBe('registrar');
  });

  it('walks a genuinely multi-role account through every role it holds', () => {
    const heldRoles: Role[] = ['school_admin', 'registrar', 'adviser', 'teacher', 'student'];
    for (const target of heldRoles) {
      expect(resolveActiveRole({
        demoMode: false, roleOverride: target, heldRoles, sessionRole: 'school_admin',
      })).toBe(target);
    }
  });

  it('outside DEMO_MODE, an override for a role NOT held is refused', () => {
    // Defends against a stale override surviving a sign-out into an
    // account with different roles — the value cannot smuggle in a role
    // this session never held.
    expect(resolveActiveRole({
      demoMode: false, roleOverride: 'school_admin',
      heldRoles: ['teacher'], sessionRole: 'teacher',
    })).toBe('teacher');
  });

  it('in DEMO_MODE, the preview grid may still force an UNHELD role', () => {
    // The whole point of the preview grid: reviewing a role before any
    // account genuinely holds it.
    expect(resolveActiveRole({
      demoMode: true, roleOverride: 'school_admin',
      heldRoles: ['teacher'], sessionRole: 'teacher',
    })).toBe('school_admin');
  });

  it('falls back to the session role when nothing is overridden', () => {
    expect(resolveActiveRole({
      demoMode: false, roleOverride: null, heldRoles: ['teacher'], sessionRole: 'teacher',
    })).toBe('teacher');
  });

  it('falls back to teacher when even the session has no role', () => {
    expect(resolveActiveRole({
      demoMode: false, roleOverride: null, heldRoles: [], sessionRole: null,
    })).toBe('teacher');
  });
});

/* ==================================================================== *
 * THE ADMINISTRATOR IS A SUPERSET OF THE REGISTRAR
 *
 * The school's rule: "administrator is the main admin of the system"
 * with "the same access as the registrar". The database always agreed —
 * every registrar permission is granted to school_admin too, and has
 * been since 0002. The MENU did not: Grade Submissions, Students and
 * Academic Records were missing from an account fully entitled to use
 * them, so the capability existed and could not be reached.
 *
 * Asserted structurally rather than by listing the expected keys, so
 * this keeps holding as either menu grows.
 * ==================================================================== */
describe('the administrator menu', () => {
  const keys = (role: Role) => NAV[role].map((i) => i.key);

  it('reaches everything the registrar reaches', () => {
    const missing = keys('registrar').filter((k) => !keys('school_admin').includes(k));
    expect(missing, `hidden from the administrator: ${missing.join(', ')}`).toEqual([]);
  });

  it('adds the administration the registrar does not hold', () => {
    const extra = keys('school_admin').filter((k) => !keys('registrar').includes(k));
    expect(extra).toEqual(expect.arrayContaining(['setup', 'users']));
  });

  it('keeps My Account last, and lists it once', () => {
    const k = keys('school_admin');
    // My Account then Help, which is the order the teacher's menu has
    // always had. Help moved from the teacher's menu alone to every
    // role's — a registrar handed this system cold could not open the
    // guide at all — so the tail is now two items, not one.
    expect(k.slice(-2)).toEqual(['account', 'help']);
    expect(k.filter((x) => x === 'account')).toHaveLength(1);
  });

  it('offers the guide to every role, not just the teacher', () => {
    for (const role of ['teacher', 'adviser', 'registrar', 'school_admin', 'student'] as const) {
      const k = keys(role);
      expect(k, `${role} cannot reach Help`).toContain('help');
      expect(k[k.length - 1], `${role} does not end on Help`).toBe('help');
    }
  });

  it('lists no route twice', () => {
    const k = keys('school_admin');
    expect(new Set(k).size, `duplicates in: ${k.join(', ')}`).toBe(k.length);
  });
});

/* ==================================================================== *
 * PHASE 2.2 — ACADEMIC YEAR LIFECYCLE
 *
 * The database has supported multiple coexisting academic years since
 * migration 0003 (`unique(school_id, label)`, never `unique(school_id)`
 * alone), and the seed itself proves the full lifecycle: a 2025-2026
 * year is created, populated with real enrolment and grade rows, then
 * flipped to 'archived' — specifically "exercising the read-only
 * guard" per its own comment. None of that needed rebuilding.
 *
 * What DID need fixing: `session_context()` fetches every year's
 * `status` and orders the list most-recent-by-start-date first, but the
 * client's `AcademicYear` type dropped `status` on the way in, so two
 * screens (ReportPicker, ConsolidatedGrades) defaulted to "whichever
 * year starts latest" rather than "whichever year is active." Confirmed
 * against a rebuilt database: inserting a 'planning' SY 2027-2028 ahead
 * of time — an ordinary thing for a registrar to do — made it sort
 * ahead of the actually-active SY 2026-2027 in `session_context()`'s
 * own output. `App.tsx`'s top-level bootstrap already guarded against
 * this with `.find(status === 'active') ?? [0]`; the two screens did
 * not share that logic and are fixed to match it here.
 * ==================================================================== */
describe('academic year administration', () => {
  const keysOf = (role: Role) => NAV[role].map((i) => i.key);

  it('is reachable only by the administrator', () => {
    for (const role of ['teacher', 'adviser', 'registrar', 'student'] as const) {
      expect(keysOf(role), `${role} can reach Academic Years`).not.toContain('years');
    }
    expect(keysOf('school_admin')).toContain('years');
  });

  it('is marked ready, not planned — the viewer is built', () => {
    const item = NAV.school_admin.find((i) => i.key === 'years');
    expect(item?.readiness).toBe('ready');
  });

  it('App.tsx actually handles the years route (not a dead menu entry)', () => {
    expect(HANDLED.has('years'), 'no `case \'years\':` in App.tsx\'s switch').toBe(true);
  });
});

describe('year pickers prefer the ACTIVE year, not merely the first one', () => {
  // No component-rendering harness is set up for these two screens
  // (vitest here runs under `environment: 'node'`), so this is a
  // structural guard on the actual source rather than a rendered
  // assertion — in the same spirit as `HANDLED` above: it reads the
  // real file, so it cannot drift from what ships.
  const READ = (name: string) => readFileSync(
    fileURLToPath(new URL(`./screens/${name}`, import.meta.url)), 'utf8');

  it('ReportPicker seeds its year state from the active year', () => {
    const src = READ('ReportPicker.tsx');
    expect(src).toMatch(/years\.find\(\(y\) => y\.status === 'active'\)\s*\?\?\s*years\[0\]/);
  });

  it('ConsolidatedGrades seeds its year state from the active year', () => {
    const src = READ('ConsolidatedGrades.tsx');
    expect(src).toMatch(/years\.find\(\(y\) => y\.status === 'active'\)\s*\?\?\s*years\[0\]/);
  });
});

describe('the grading-period selector is not hard-coded to one school year', () => {
  it("the topbar's period options are built from year.label, never a literal", () => {
    // A literal like "SY 2026-2027" here would be exactly the defect
    // Phase 2.2 was asked to rule out. Asserting the template reads
    // from the variable is a direct check on the actual risk, rather
    // than an open-ended search for every way a literal could sneak in.
    expect(APP_SOURCE).toMatch(/SY \{year\.label\} · \{p\.name\}/);
  });

  it('offers every period of the year, not a fixed count', () => {
    expect(APP_SOURCE).toMatch(/year\?\.periods\.map\(\(p\) =>/);
  });
});
