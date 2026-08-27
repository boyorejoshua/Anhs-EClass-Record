import { useCallback, useState } from 'react';
import type { NewAccount, StaffAccount, StaffDirectory } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  load: () => Promise<StaffDirectory>;
  createAccount: (draft: NewAccount) => Promise<{ userId: string; warning?: string }>;
  resetPassword: (userId: string, password: string) => Promise<void>;
  setUserRoles: (userId: string, roleCodes: string[]) => Promise<void>;
  setUserStatus: (userId: string, status: 'active' | 'inactive' | 'suspended') => Promise<void>;
}

/**
 * Where an account comes from.
 *
 * Until this screen, every login in the system was seeded. A school
 * could be shown the product but could never take it over: no way to
 * add a teacher, no way to change a role, no way to reset a forgotten
 * password. That is the difference between a demo and a deployment.
 *
 * THERE IS NO PUBLIC SIGN-UP, deliberately — see migration 0031. Every
 * account belongs to exactly one school, and the tenant is stamped into
 * the auth identity where no client can reach it. A self-serve form
 * would have to let the registrant name their own school, which makes
 * anyone holding the URL a teacher at that school. So Mendtrix
 * provisions the school and its first administrator; the administrator
 * creates everyone else here.
 *
 * The temporary-password handover is the other deliberate choice.
 * Supabase's emailed invite needs SMTP and needs every teacher to read
 * email; a DepEd public school reliably has neither. A password read
 * off a slip works on day one — and because the administrator briefly
 * knows it, every new account is flagged to change it on first sign-in.
 */
export function Users({
  load, createAccount, resetPassword, setUserRoles, setUserStatus,
}: Props) {
  const [state, retry] = useAsync(load, [load]);
  const [adding, setAdding] = useState(false);
  const [editingRoles, setEditingRoles] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      retry();
    } catch (e) {
      // The database writes these refusals for a person — "you cannot
      // remove your own administrator role" — so pass them through.
      setError(e instanceof Error ? e.message : 'That action did not complete.');
    } finally {
      setBusy(null);
    }
  }, [retry]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Users</h1>
          <p className="page-sub">
            Everyone who can sign in to this school. Creating an account here is
            the only way one comes to exist — there is no public sign-up, because
            an account carries access to learners' records.
          </p>
        </div>
      </div>

      {error && (
        <div className="err-banner" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="panel notice" role="status">
          <span>{notice}</span>
          <button className="btn btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <Async state={state} retry={retry} rows={6}>
        {(dir) => (!dir.permissions.canWrite && dir.users.length === 0 ? (
          <EmptyState title="You cannot manage accounts">
            Only a school administrator can create or change accounts.
          </EmptyState>
        ) : (
          <>
            {adding && (
              <AddAccount
                roles={dir.roles}
                onCancel={() => setAdding(false)}
                onCreate={async (draft) => {
                  const result = await createAccount(draft);
                  setAdding(false);
                  setNotice(result.warning
                    ?? `${draft.firstName} ${draft.lastName} can now sign in as `
                      + `${draft.email} with the temporary password you set. `
                      + 'They will be asked to change it immediately.');
                  retry();
                }}
              />
            )}

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Accounts</h2>
                  <p className="page-sub">{dir.users.length} in this school</p>
                </div>
                {dir.permissions.canWrite && !adding && (
                  <button className="btn btn-primary" onClick={() => setAdding(true)}>
                    + Add user
                  </button>
                )}
              </div>

              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Employee ID</th>
                      <th scope="col">Roles</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="num">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dir.users.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        allRoles={dir.roles}
                        permissions={dir.permissions}
                        busy={busy === u.id}
                        editingRoles={editingRoles === u.id}
                        resetting={resetting === u.id}
                        onEditRoles={() => { setEditingRoles(u.id); setResetting(null); }}
                        onReset={() => { setResetting(u.id); setEditingRoles(null); }}
                        onCancel={() => { setEditingRoles(null); setResetting(null); }}
                        onSaveRoles={(codes) => run(u.id, async () => {
                          await setUserRoles(u.id, codes);
                          setEditingRoles(null);
                        })}
                        onSavePassword={(pw) => run(u.id, async () => {
                          await resetPassword(u.id, pw);
                          setResetting(null);
                          setNotice(`${u.firstName} ${u.lastName} can sign in with the new `
                            + 'temporary password. They will be asked to change it.');
                        })}
                        onToggleStatus={() => run(u.id, () =>
                          setUserStatus(u.id, u.status === 'active' ? 'inactive' : 'active'))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ))}
      </Async>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UserRow({
  user, allRoles, permissions, busy, editingRoles, resetting,
  onEditRoles, onReset, onCancel, onSaveRoles, onSavePassword, onToggleStatus,
}: {
  user: StaffAccount;
  allRoles: Array<{ code: string; name: string }>;
  permissions: StaffDirectory['permissions'];
  busy: boolean;
  editingRoles: boolean;
  resetting: boolean;
  onEditRoles: () => void;
  onReset: () => void;
  onCancel: () => void;
  onSaveRoles: (codes: string[]) => void;
  onSavePassword: (password: string) => void;
  onToggleStatus: () => void;
}) {
  const name = [user.lastName, user.firstName].filter(Boolean).join(', ')
    + (user.suffix ? ` ${user.suffix}` : '');

  return (
    <>
      <tr>
        <th scope="row">
          {name}
          {user.isSelf && <span className="tbl-sub">You</span>}
          {user.position && <span className="tbl-sub">{user.position}</span>}
        </th>
        <td>{user.email}</td>
        <td className="mono">{user.employeeId ?? <span className="faint">—</span>}</td>
        <td>
          {user.roles.length === 0
            ? <span className="faint">No role — cannot do anything yet</span>
            : user.roles.map((r) => (
                <span key={r} className="gb-chip" style={{ marginRight: 4 }}>{r}</span>
              ))}
        </td>
        <td>
          <span className="gb-chip" data-band={user.status === 'active' ? 'mid' : 'low'}>
            {user.status}
          </span>
          {/*
            Worth showing: an administrator who reset a password needs to
            know whether the person has actually taken it over yet.
          */}
          {user.mustChangePassword && (
            <span className="tbl-sub" data-warn="true">must change password</span>
          )}
        </td>
        <td className="num">
          <div className="row-actions">
            {permissions.canAssignRoles && !editingRoles && !resetting && (
              <button className="btn btn-sm" disabled={busy} onClick={onEditRoles}>Roles</button>
            )}
            {permissions.canWrite && !editingRoles && !resetting && (
              <button className="btn btn-sm" disabled={busy} onClick={onReset}>
                Reset password
              </button>
            )}
            {permissions.canDeactivate && !user.isSelf && !editingRoles && !resetting && (
              <button className="btn btn-sm" disabled={busy} onClick={onToggleStatus}>
                {busy ? '…' : user.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </button>
            )}
            {/*
              An account is never deleted. This person authored grade
              submissions, receipts and audit rows; removing the row
              would either cascade the school's history away or fail on
              a foreign key. Deactivating ends the login and keeps the
              record — so say so rather than leaving a gap where a
              Delete button visibly is not.
            */}
            {user.isSelf && !editingRoles && !resetting && (
              <span className="faint">Your own account</span>
            )}
          </div>
        </td>
      </tr>

      {editingRoles && (
        <tr>
          <td colSpan={6}>
            <RoleEditor
              user={user} allRoles={allRoles} busy={busy}
              onCancel={onCancel} onSave={onSaveRoles}
            />
          </td>
        </tr>
      )}
      {resetting && (
        <tr>
          <td colSpan={6}>
            <PasswordReset user={user} busy={busy} onCancel={onCancel} onSave={onSavePassword} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Checkboxes, not a single-select. Teacher AND Adviser is the common
 * arrangement, and the whole set is submitted at once so what the
 * administrator sees is exactly what gets written.
 */
function RoleEditor({ user, allRoles, busy, onCancel, onSave }: {
  user: StaffAccount;
  allRoles: Array<{ code: string; name: string }>;
  busy: boolean;
  onCancel: () => void;
  onSave: (codes: string[]) => void;
}) {
  const [codes, setCodes] = useState<string[]>(user.roles);
  const toggle = (code: string) => setCodes((prev) =>
    prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);

  return (
    <div className="inline-form">
      <p className="field-label">
        Roles for {user.firstName} {user.lastName} — a person may hold more than one
      </p>
      <div className="role-grid">
        {allRoles.map((r) => (
          <label key={r.code} className="check">
            <input
              type="checkbox" checked={codes.includes(r.code)}
              onChange={() => toggle(r.code)} disabled={busy}
            />
            <span>{r.name} <span className="faint mono">{r.code}</span></span>
          </label>
        ))}
      </div>
      <div className="row-actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSave(codes)}>
          {busy ? 'Saving…' : 'Save roles'}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PasswordReset({ user, busy, onCancel, onSave }: {
  user: StaffAccount;
  busy: boolean;
  onCancel: () => void;
  onSave: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const tooShort = password.length > 0 && password.length < 8;

  return (
    <div className="inline-form">
      <p className="field-label">
        A temporary password for {user.firstName} {user.lastName}. Give it to them
        directly — they will be asked to change it as soon as they sign in.
      </p>
      <label className="picker">
        <span className="field-label">Temporary password</span>
        <input
          className="input" type="text" value={password} autoComplete="off"
          onChange={(e) => setPassword(e.target.value)} disabled={busy}
        />
      </label>
      {/*
        Shown as plain text on purpose: the administrator has to read it
        out or write it down, and a masked field they cannot check is
        how a password gets mistyped and the teacher locked out.
      */}
      {tooShort && <p className="signin-error">Use at least 8 characters.</p>}
      <div className="row-actions">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || password.length < 8}
          onClick={() => onSave(password)}
        >
          {busy ? 'Saving…' : 'Set password'}
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddAccount({ roles, onCancel, onCreate }: {
  roles: Array<{ code: string; name: string }>;
  onCancel: () => void;
  onCreate: (draft: NewAccount) => Promise<void>;
}) {
  const [f, setF] = useState({
    email: '', password: '', firstName: '', lastName: '',
    middleName: '', suffix: '', employeeId: '', position: '',
  });
  const [codes, setCodes] = useState<string[]>(['teacher']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const valid = f.email.includes('@') && f.password.length >= 8
    && f.firstName.trim() !== '' && f.lastName.trim() !== '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        email: f.email.trim(), password: f.password,
        firstName: f.firstName, lastName: f.lastName,
        middleName: f.middleName || null, suffix: f.suffix || null,
        employeeId: f.employeeId || null, position: f.position || null,
        roles: codes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Add a user</h2>
          <p className="page-sub">
            They sign in with this email address and the temporary password you
            set, then choose their own password immediately.
          </p>
        </div>
      </div>

      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

      <div className="form-grid">
        <label className="picker">
          <span className="field-label">Email *</span>
          <input className="input" type="email" value={f.email} onChange={set('email')}
                 disabled={busy} required autoComplete="off" />
        </label>
        <label className="picker">
          <span className="field-label">Temporary password *</span>
          <input className="input" type="text" value={f.password} onChange={set('password')}
                 disabled={busy} required autoComplete="off" minLength={8} />
        </label>
        <label className="picker">
          <span className="field-label">First name *</span>
          <input className="input" value={f.firstName} onChange={set('firstName')}
                 disabled={busy} required />
        </label>
        <label className="picker">
          <span className="field-label">Middle name</span>
          <input className="input" value={f.middleName} onChange={set('middleName')}
                 disabled={busy} />
        </label>
        <label className="picker">
          <span className="field-label">Last name *</span>
          <input className="input" value={f.lastName} onChange={set('lastName')}
                 disabled={busy} required />
        </label>
        <label className="picker">
          <span className="field-label">Suffix</span>
          <input className="input" value={f.suffix} onChange={set('suffix')}
                 disabled={busy} placeholder="Jr." />
        </label>
        <label className="picker">
          <span className="field-label">Employee ID</span>
          <input className="input" value={f.employeeId} onChange={set('employeeId')}
                 disabled={busy} placeholder="EMP-005" />
        </label>
        <label className="picker">
          <span className="field-label">Position</span>
          <input className="input" value={f.position} onChange={set('position')}
                 disabled={busy} placeholder="Teacher I" />
        </label>
      </div>

      <p className="field-label">Roles</p>
      <div className="role-grid">
        {roles.map((r) => (
          <label key={r.code} className="check">
            <input
              type="checkbox" checked={codes.includes(r.code)} disabled={busy}
              onChange={() => setCodes((prev) => prev.includes(r.code)
                ? prev.filter((c) => c !== r.code) : [...prev, r.code])}
            />
            <span>{r.name} <span className="faint mono">{r.code}</span></span>
          </label>
        ))}
      </div>
      {codes.length === 0 && (
        <p className="signin-error">
          An account with no role can sign in and see nothing. Pick at least one.
        </p>
      )}

      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || !valid}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
