import type { CurrentUser, Role } from '../data/types';

/**
 * Role-based navigation. Never render a nav item the role cannot use
 * (handoff, "Navigation, by role").
 *
 * V0 shows different menus per role but enforces nothing — every page
 * exists in the DOM and `showPage('registrar')` works from the console.
 * Here the menu is a convenience; the database is the boundary.
 */
const NAV: Record<Role, Array<{ key: string; label: string; glyph: string; count?: number }>> = {
  teacher: [
    { key: 'dashboard',   label: 'Dashboard',   glyph: '▤' },
    { key: 'classes',     label: 'My Classes',  glyph: '▦' },
    { key: 'gradebook',   label: 'Gradebook',   glyph: '▩' },
    { key: 'attendance',  label: 'Attendance',  glyph: '◫' },
    { key: 'reports',     label: 'Reports',     glyph: '◈' },
    { key: 'submissions', label: 'Submissions', glyph: '↑', count: 2 },
    { key: 'help',        label: 'Help',        glyph: '?' },
  ],
  adviser: [
    { key: 'dashboard',    label: 'Dashboard',          glyph: '▤' },
    { key: 'classes',      label: 'My Classes',         glyph: '▦' },
    { key: 'gradebook',    label: 'Gradebook',          glyph: '▩' },
    { key: 'attendance',   label: 'Attendance',         glyph: '◫' },
    { key: 'consolidated', label: 'Consolidated Grades', glyph: '◍' },
    { key: 'reports',      label: 'Reports',            glyph: '◈' },
    { key: 'submissions',  label: 'Submissions',        glyph: '↑' },
  ],
  registrar: [
    { key: 'dashboard',   label: 'Dashboard',        glyph: '▤' },
    { key: 'students',    label: 'Students',         glyph: '▦' },
    { key: 'enrollments', label: 'Enrollments',      glyph: '◫' },
    { key: 'queue',       label: 'Grade Submissions', glyph: '↑', count: 8 },
    { key: 'records',     label: 'Academic Records',  glyph: '◍' },
    { key: 'documents',   label: 'Reports & Documents', glyph: '◈' },
  ],
  school_admin: [
    { key: 'dashboard', label: 'Dashboard',     glyph: '▤' },
    { key: 'setup',     label: 'School Setup',  glyph: '⚙' },
    { key: 'years',     label: 'Academic Years', glyph: '◷' },
    { key: 'users',     label: 'Users',         glyph: '▦' },
    { key: 'classes',   label: 'Classes & Sections', glyph: '◫' },
    { key: 'grading',   label: 'Grading Configuration', glyph: '◍' },
  ],
  student: [
    { key: 'dashboard',  label: 'My Grades',       glyph: '▩' },
    { key: 'profile',    label: 'My Profile',      glyph: '▦' },
    { key: 'history',    label: 'Academic History', glyph: '◷' },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  teacher: 'Subject Teacher',
  adviser: 'Advisory Teacher',
  registrar: 'Registrar',
  school_admin: 'Administrator',
  student: 'Student',
};

interface Props {
  user: CurrentUser;
  activeRole: Role;
  activeKey: string;
  onNavigate: (key: string) => void;
  onRoleChange: (role: Role) => void;
}

export function Sidebar({ user, activeRole, activeKey, onNavigate, onRoleChange }: Props) {
  const items = NAV[activeRole];

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="side-brand">
        <div className="side-mark" aria-hidden="true">{user.schoolCode}</div>
        <div>
          <div className="side-name">Academic Records</div>
          <div className="side-sub">{user.schoolName.replace(' National High School', ' NHS')}</div>
        </div>
      </div>

      <div className="side-section">{ROLE_LABEL[activeRole]}</div>
      <div className="side-nav">
        {items.map((item) => (
          <button
            key={item.key}
            className="side-link"
            aria-current={activeKey === item.key ? 'page' : undefined}
            onClick={() => onNavigate(item.key)}
          >
            <span className="side-glyph" aria-hidden="true">{item.glyph}</span>
            <span>{item.label}</span>
            {item.count ? <span className="side-count">{item.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="side-foot">
        <div className="side-section" style={{ padding: '0 0 8px' }}>Preview as</div>
        <div className="side-preview">
          <div className="side-preview-grid">
            {(['teacher', 'adviser', 'registrar', 'school_admin', 'student'] as Role[]).map((r) => (
              <button
                key={r}
                aria-pressed={activeRole === r}
                onClick={() => onRoleChange(r)}
              >
                {ROLE_LABEL[r].split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="side-user">
          <div className="side-avatar" aria-hidden="true">{user.initials}</div>
          <div>
            <div className="side-user-name">{user.name}</div>
            <div className="side-user-role">{ROLE_LABEL[activeRole]}</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
