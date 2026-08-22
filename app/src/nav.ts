/**
 * The route model.
 *
 * Before this existed, `navKey` was stored in App state and consulted in
 * exactly one place — a boolean for the SF10 screen. Every other nav
 * item fell through to "dashboard, or the gradebook if a class happens
 * to be open". Clicking Attendance showed the dashboard; clicking
 * Reports showed the dashboard; clicking Users showed the dashboard. The
 * navigation looked like it worked and silently did not.
 *
 * So the rule this file exists to enforce:
 *
 *   NAVIGATION STATE DECIDES WHAT RENDERS. Always. Every route resolves
 *   to a screen, and a route with no screen resolves to an explicit
 *   "not available yet" — never to some other screen.
 *
 * `readiness` is deliberately data, not a comment. A route marked
 * `planned` renders NotAvailable, and the test suite asserts that every
 * route reachable from every role's menu maps to a screen. Adding a menu
 * entry without a screen therefore fails the build rather than shipping
 * a dead button.
 */
import type { Role } from './data/types';

export type RouteId =
  // shared
  | 'dashboard'
  // teaching
  | 'classes' | 'class' | 'attendance' | 'reports' | 'submissions' | 'help'
  | 'consolidated' | 'incoming'
  // registrar
  | 'students' | 'enrollments' | 'queue' | 'records' | 'documents'
  // administration
  | 'setup' | 'years' | 'users' | 'sections' | 'grading'
  // student portal
  | 'profile' | 'history';

export type ClassTab =
  | 'overview' | 'setup' | 'gradebook' | 'summary' | 'analytics' | 'loa'
  | 'attendance' | 'students' | 'reports' | 'submission';

/**
 * Where the user is. `classId` and `tab` belong to the route rather than
 * to component state so that opening a class from the dashboard, from My
 * Classes, or from a registrar queue row all land in the same place.
 */
export interface Route {
  id: RouteId;
  classId?: string;
  tab?: ClassTab;
  studentId?: string;
}

export const HOME: Route = { id: 'dashboard' };

export type Readiness = 'ready' | 'planned';

export interface NavItem {
  key: RouteId;
  label: string;
  glyph: string;
  readiness: Readiness;
  /** Shown on the NotAvailable screen so the limitation is specific. */
  note?: string;
}

/* ------------------------------------------------------------------ *
 * Per-role menus.
 *
 * A role never sees an item it cannot use. That is a courtesy, not a
 * control: the database is the boundary, and every one of these screens
 * fails closed on its own if the role's permissions do not allow the
 * underlying read.
 * ------------------------------------------------------------------ */

const TEACHING: NavItem[] = [
  { key: 'dashboard',   label: 'Dashboard',   glyph: '▤', readiness: 'ready' },
  { key: 'classes',     label: 'My Classes',  glyph: '▦', readiness: 'ready' },
  { key: 'attendance',  label: 'Attendance',  glyph: '◫', readiness: 'ready' },
  { key: 'submissions', label: 'Submissions', glyph: '↑', readiness: 'ready' },
  { key: 'reports',     label: 'Reports',     glyph: '◈', readiness: 'ready' },
  { key: 'help',        label: 'Help',        glyph: '?', readiness: 'ready' },
];

export const NAV: Record<Role, NavItem[]> = {
  teacher: TEACHING,

  adviser: [
    ...TEACHING.slice(0, 4),
    // The adviser's half of the chain of custody. Subject teachers hand
    // their section's grades here; the adviser signs for each one and
    // passes the section on to the registrar.
    { key: 'incoming', label: 'Incoming Grades', glyph: '⇤', readiness: 'ready' },
    {
      key: 'consolidated', label: 'Consolidated Grades', glyph: '◍', readiness: 'planned',
      note:
        'Consolidating every subject for an advisory section needs each subject ' +
        'teacher to have submitted first, and needs the period grades to have been ' +
        'computed and stored. That computation is the one piece of the chain not yet ' +
        'built — see docs/21-functional-optimization-audit.md.',
    },
    ...TEACHING.slice(4),
  ],

  registrar: [
    { key: 'dashboard', label: 'Dashboard',          glyph: '▤', readiness: 'ready' },
    { key: 'queue',     label: 'Grade Submissions',  glyph: '↑', readiness: 'ready' },
    { key: 'students',  label: 'Students',           glyph: '▦', readiness: 'ready' },
    { key: 'records',   label: 'Academic Records',   glyph: '◍', readiness: 'ready' },
    {
      key: 'enrollments', label: 'Enrollments', glyph: '◫', readiness: 'planned',
      note:
        'Enrolling, transferring and dropping learners writes to the enrollment ' +
        'history that SF10 is built from. It needs the import pipeline in ' +
        'docs/10-excel-migration.md, because no registrar will enroll 1,500 learners ' +
        'by hand.',
    },
    {
      key: 'documents', label: 'Reports & Documents', glyph: '◈', readiness: 'planned',
      note:
        'Issuing a numbered, signed, archived document needs the generation pipeline ' +
        'in docs/11-document-engine.md — atomic numbering, frozen signatories and ' +
        'stored artifacts. SF10 can already be previewed under Academic Records.',
    },
  ],

  school_admin: [
    { key: 'dashboard', label: 'Dashboard', glyph: '▤', readiness: 'ready' },
    {
      key: 'setup', label: 'School Setup', glyph: '⚙', readiness: 'planned',
      note: 'School profile and settings are currently configured during onboarding.',
    },
    {
      key: 'years', label: 'Academic Years', glyph: '◷', readiness: 'planned',
      note:
        'Creating a school year and its periods decides the shape of everything ' +
        'downstream, and archiving one makes it read-only by trigger. It is seeded ' +
        'during onboarding rather than edited live.',
    },
    {
      key: 'users', label: 'Users', glyph: '▦', readiness: 'planned',
      note:
        'Creating a user means creating a Supabase Auth identity with the tenant in ' +
        'app_metadata, which only a server-side function may do — a client holding the ' +
        'anon key must never be able to mint accounts.',
    },
    {
      key: 'sections', label: 'Classes & Sections', glyph: '◫', readiness: 'planned',
      note: 'Sections, subjects and teaching loads are seeded during onboarding.',
    },
    {
      key: 'grading', label: 'Grading Configuration', glyph: '◍', readiness: 'planned',
      note:
        'Grading schemes, component trees and transmutation tables are already data ' +
        'rather than code — the gradebook renders whatever the scheme says. Editing ' +
        'them in the UI is deferred; changing a scheme mid-year would alter grades ' +
        'already computed under it.',
    },
  ],

  student: [
    { key: 'dashboard', label: 'My Grades',        glyph: '▩', readiness: 'ready' },
    { key: 'profile',   label: 'My Profile',       glyph: '▦', readiness: 'ready' },
    { key: 'history',   label: 'Academic History', glyph: '◷', readiness: 'ready' },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  teacher: 'Subject Teacher',
  adviser: 'Advisory Teacher',
  registrar: 'Registrar',
  school_admin: 'Administrator',
  student: 'Student',
};

/**
 * The class workspace tabs.
 *
 * `group` reproduces the legacy Record Book, which is one screen with
 * its own sub-tabs (Setup · Grade Entry · Bulk Entry · Summary ·
 * Analytics · LOA). Bulk Entry is absent on purpose: it was a separate
 * legacy page, and here it is a MODE of the gradebook — paste a block
 * from Excel and it fills the grid. A second page for it would be a
 * worse version of a feature that already exists.
 */
export const CLASS_TABS: Array<{
  key: ClassTab; label: string; readiness: Readiness; group?: 'record-book';
}> = [
  { key: 'overview',   label: 'Overview',   readiness: 'ready' },
  { key: 'setup',      label: 'Setup',      readiness: 'ready', group: 'record-book' },
  { key: 'gradebook',  label: 'Grade Entry', readiness: 'ready', group: 'record-book' },
  { key: 'summary',    label: 'Summary',    readiness: 'ready', group: 'record-book' },
  { key: 'analytics',  label: 'Analytics',  readiness: 'ready', group: 'record-book' },
  { key: 'loa',        label: 'LOA',        readiness: 'ready', group: 'record-book' },
  { key: 'attendance', label: 'Attendance', readiness: 'ready' },
  { key: 'students',   label: 'Students',   readiness: 'ready' },
  { key: 'reports',    label: 'Reports',    readiness: 'ready' },
  { key: 'submission', label: 'Submission', readiness: 'ready' },
];

/** Menu entry for a route, if the role has one. Used for titles and readiness. */
export function navItem(role: Role, id: RouteId): NavItem | undefined {
  return NAV[role].find((i) => i.key === id);
}

export function isReady(role: Role, id: RouteId): boolean {
  // 'class' is never a menu entry — it is reached by opening a class.
  if (id === 'class') return true;
  return navItem(role, id)?.readiness === 'ready';
}

/**
 * Roles the signed-in user actually holds, in the order we would rather
 * land them in. A teacher who also advises a section is both, and V0
 * could not express that at all — its role column is a mutually
 * exclusive CHECK.
 */
const ROLE_PRIORITY: Role[] = ['school_admin', 'registrar', 'adviser', 'teacher', 'student'];

export function rolesFromSession(sessionRoles: readonly string[]): Role[] {
  const held = ROLE_PRIORITY.filter((r) => sessionRoles.includes(r));
  return held.length > 0 ? held : [];
}

/** The role whose menu we open on. */
export function defaultRole(sessionRoles: readonly string[]): Role | null {
  return rolesFromSession(sessionRoles)[0] ?? null;
}
