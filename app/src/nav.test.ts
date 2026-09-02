import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLASS_TABS, NAV, defaultRole, isReady, navItem, rolesFromSession } from './nav';
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
