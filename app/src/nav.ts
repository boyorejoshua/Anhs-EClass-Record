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
  | 'consolidated' | 'incoming' | 'analytics' | 'loa-reports'
  // registrar
  | 'students' | 'student' | 'enrollments' | 'queue' | 'records' | 'documents'
  | 'import'
  // administration
  | 'setup' | 'years' | 'users' | 'sections' | 'grading'
  // everyone: their own login. Distinct from the student portal's
  // 'profile', which is a LEARNER record read from a different identity.
  | 'account'
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
  // Scoped by RLS, not by menu: a teacher sees only the learners in their
  // own classes, so the same entry is safe for every teaching role.
  { key: 'students',    label: 'Students',    glyph: '☖', readiness: 'ready' },
  { key: 'attendance',  label: 'Attendance',  glyph: '◫', readiness: 'ready' },
  { key: 'submissions', label: 'Submissions', glyph: '↑', readiness: 'ready' },
  // Additional entry points, not replacements: both tabs stay inside the
  // class workspace, and both routes render the same component.
  { key: 'analytics',   label: 'Analytics',   glyph: '◔', readiness: 'ready' },
  { key: 'loa-reports', label: 'LOA Reports', glyph: '◑', readiness: 'ready' },
  { key: 'reports',     label: 'Reports',     glyph: '◈', readiness: 'ready' },
  // Deliberately near the bottom: importing is something a teacher does
  // once a term, not something they navigate to every day.
  { key: 'import',      label: 'Import',      glyph: '⇥', readiness: 'ready' },
  { key: 'account',     label: 'My Account',  glyph: '☺', readiness: 'ready' },
  { key: 'help',        label: 'Help',        glyph: '?', readiness: 'ready' },
];

/* ------------------------------------------------------------------ *
 * The registrar's menu, named so the ADMINISTRATOR can be defined as a
 * superset of it rather than as a hand-kept copy.
 *
 * The school's rule, in their words: the registrar creates sections,
 * and "administrator is the main admin of the system" with "the same
 * access as the registrar".
 *
 * The database already agreed. Every one of the registrar's forty
 * permissions is granted to school_admin as well, and has been since
 * 0002 — there was nothing to grant. Only the MENU disagreed, hiding
 * Grade Submissions, Students and Academic Records from an account
 * fully entitled to use them.
 *
 * That inverts this file's own rule. "A role never sees an item it
 * cannot use" is a courtesy. An account that cannot SEE an item it CAN
 * use is a defect, and the harder of the two to notice: nothing errors,
 * the screen simply is never offered.
 *
 * Spread rather than copied, so a screen added to the registrar reaches
 * the administrator in the same commit. Two hand-kept lists would have
 * drifted the first time either changed.
 * ------------------------------------------------------------------ */
const REGISTRAR: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard',          glyph: '▤', readiness: 'ready' },
    { key: 'queue',     label: 'Grade Submissions',  glyph: '↑', readiness: 'ready' },
    { key: 'students',  label: 'Students',           glyph: '▦', readiness: 'ready' },
    { key: 'records',   label: 'Academic Records',   glyph: '◍', readiness: 'ready' },
    // Sections and classes did not exist anywhere in the UI until this
    // screen — the only way one came to exist before it was seed data,
    // or an import that happened to name one. This is the actual start
    // of a school year for a registrar: which sections exist, which
    // classes run in them, who teaches and who advises.
    { key: 'sections',  label: 'Classes & Sections',  glyph: '◫', readiness: 'ready' },
    // The registrar is the only role that can create a class or admit a
    // learner, so a workbook for a class nobody has set up comes here.
    { key: 'import',    label: 'Import',             glyph: '⇥', readiness: 'ready' },
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
    { key: 'account',   label: 'My Account',          glyph: '☺', readiness: 'ready' },
];

export const NAV: Record<Role, NavItem[]> = {
  teacher: TEACHING,

  adviser: [
    ...TEACHING.slice(0, 4),
    // The adviser's half of the chain of custody. Subject teachers hand
    // their section's grades here; the adviser signs for each one and
    // passes the section on to the registrar.
    { key: 'incoming', label: 'Incoming Grades', glyph: '⇤', readiness: 'ready' },
    { key: 'consolidated', label: 'Consolidated Grades', glyph: '◍', readiness: 'ready' },
    ...TEACHING.slice(4),
  ],

  registrar: REGISTRAR,

  school_admin: [
    // Everything the registrar reaches …
    ...REGISTRAR.filter((i) => i.key !== 'account'),

    // … plus the administration the registrar does not hold.
    { key: 'setup', label: 'School Setup', glyph: '⚙', readiness: 'ready' },
    {
      key: 'years', label: 'Academic Years', glyph: '◷', readiness: 'planned',
      note:
        'Creating a school year and its periods decides the shape of everything ' +
        'downstream, and archiving one makes it read-only by trigger. It is seeded ' +
        'during onboarding rather than edited live.',
    },
    { key: 'users', label: 'Users', glyph: '▦', readiness: 'ready' },
    {
      key: 'grading', label: 'Grading Configuration', glyph: '◍', readiness: 'planned',
      note:
        'Grading schemes, component trees and transmutation tables are already data ' +
        'rather than code — the gradebook renders whatever the scheme says. Editing ' +
        'them in the UI is deferred; changing a scheme mid-year would alter grades ' +
        'already computed under it.',
    },
    { key: 'account', label: 'My Account', glyph: '☺', readiness: 'ready' },
  ],

  student: [
    { key: 'dashboard', label: 'My Grades',        glyph: '▩', readiness: 'ready' },
    { key: 'profile',   label: 'My Profile',       glyph: '▦', readiness: 'ready' },
    { key: 'history',   label: 'Academic History', glyph: '◷', readiness: 'ready' },
    // 'profile' above is the LEARNER record — LRN, guardian, enrolment.
    // This is the LOGIN: name and password. Two different things that
    // both reasonably answer to "my profile", so both are listed.
    { key: 'account',   label: 'My Account',       glyph: '☺', readiness: 'ready' },
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

/**
 * Routes reached by opening something rather than by clicking a menu.
 *
 * They have no NavItem, so a readiness lookup finds nothing and would
 * report them unavailable — which is how opening a class once bounced
 * straight back to the dashboard. Anything drilled into from a list
 * belongs here.
 */
const DETAIL_ROUTES: ReadonlySet<RouteId> = new Set(['class', 'student']);

export function isReady(role: Role, id: RouteId): boolean {
  if (DETAIL_ROUTES.has(id)) return true;
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
