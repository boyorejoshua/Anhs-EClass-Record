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
 * Every case App's `screen()` switch handles, plus the routes it reaches
 * through shared branches. Kept as a literal so that adding a `ready`
 * menu entry without adding a case fails here rather than in production.
 */
const HANDLED = new Set([
  'dashboard', 'classes', 'attendance', 'submissions', 'reports', 'help',
  'class', 'queue', 'students', 'records', 'profile', 'history',
]);

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

  it('treats the class workspace as reachable for every role', () => {
    // 'class' is never a menu entry — it is reached by opening a class —
    // so isReady must not report it as unavailable.
    for (const role of ROLES) expect(isReady(role, 'class')).toBe(true);
  });

  it('has no menu entry pointing at a route id it does not define', () => {
    for (const role of ROLES) {
      for (const item of NAV[role]) {
        expect(navItem(role, item.key)).toBe(item);
      }
    }
  });

  it('builds every class workspace tab', () => {
    // Five of these six rendered "Not built yet" before this work.
    expect(CLASS_TABS.every((t) => t.readiness === 'ready')).toBe(true);
    expect(CLASS_TABS.map((t) => t.key)).toEqual([
      'overview', 'gradebook', 'attendance', 'students', 'reports', 'submission',
    ]);
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
