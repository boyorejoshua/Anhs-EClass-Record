import type { CurrentUser, Role } from '../data/types';
import { DEMO_MODE } from '../config';
import { NAV, ROLE_LABEL, type RouteId } from '../nav';

/**
 * Role-based navigation.
 *
 * The menu is a convenience; the database is the boundary. Every screen
 * behind these entries fails closed on its own — RLS decides what the
 * signed-in user can read regardless of which item is drawn.
 *
 * Two things changed from the version this replaces:
 *
 *  • The item list moved to `nav.ts`, where each entry carries whether
 *    it is built. The counts here are derived from real data or absent —
 *    the old menu hard-coded "2" on Submissions and "8" on the registrar
 *    queue, which were invented numbers rendered as fact.
 *
 *  • An item that is not built is marked, and clicking it opens a screen
 *    that says so. It no longer silently renders the dashboard.
 */
interface Props {
  user: CurrentUser;
  activeRole: Role;
  /** Roles the signed-in user actually holds, from `user_roles`. */
  heldRoles: Role[];
  activeKey: RouteId;
  onNavigate: (key: RouteId) => void;
  onRoleChange: (role: Role) => void;
}

export function Sidebar({ user, activeRole, heldRoles, activeKey, onNavigate, onRoleChange }: Props) {
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

      {/* A user who genuinely holds more than one role switches here.
          This is not the demo switcher: it only ever offers roles the
          database already granted, so it changes the view and not the
          permissions. A teacher who also advises a section is the common
          case, and V0 could not express it at all. */}
      {heldRoles.length > 1 && (
        <div className="side-roles" role="group" aria-label="Your roles">
          {heldRoles.map((r) => (
            <button
              key={r}
              aria-pressed={activeRole === r}
              onClick={() => onRoleChange(r)}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}

      <div className="side-section">{ROLE_LABEL[activeRole]}</div>
      <div className="side-nav">
        {items.map((item) => (
          <button
            key={item.key}
            className="side-link"
            aria-current={activeKey === item.key ? 'page' : undefined}
            data-planned={item.readiness === 'planned' || undefined}
            onClick={() => onNavigate(item.key)}
          >
            <span className="side-glyph" aria-hidden="true">{item.glyph}</span>
            <span>{item.label}</span>
            {item.readiness === 'planned' && (
              <span className="side-planned" title="Designed, not yet built">soon</span>
            )}
          </button>
        ))}
      </div>

      <div className="side-foot">
        {/* DEMO SCAFFOLDING — not product.
            Exists so the platform can be reviewed across all five roles
            before real accounts exist. Absent from a production build,
            where the role comes from the user's `user_roles` rows.
            Removing it changes no permission: it only ever changed which
            navigation was drawn. */}
        {DEMO_MODE && (
          <div className="side-demo">
            <div className="side-demo-tag">
              <span aria-hidden="true">◈</span> Demo preview
            </div>
            <p className="side-demo-note">
              Role switching is a review aid. It changes the menu, never what the
              database will return.
            </p>
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
        )}
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
