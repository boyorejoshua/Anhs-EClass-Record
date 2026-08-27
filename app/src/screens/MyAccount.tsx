import { useState } from 'react';
import type { MyAccount as MyAccountData, ProfileEdit } from '../data/types';
import { Async, useAsync } from '../components/Async';

interface Props {
  load: () => Promise<MyAccountData>;
  save: (edit: ProfileEdit) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  /** So the shell can drop the must-change gate once it is satisfied. */
  onPasswordChanged?: () => void;
}

/**
 * The person's own account.
 *
 * Every role reaches this, including students — it is the one screen
 * that is never about somebody else. Until it existed a teacher could
 * not correct the spelling of their own name on the records they sign,
 * and nobody could change their password at all.
 *
 * WHAT IS NOT EDITABLE HERE, and why each one:
 *
 *   email     it is the sign-in credential and lives on the auth
 *             identity. Changing it in the person record alone would
 *             leave the two disagreeing, and they would still be
 *             signing in with the old address.
 *   roles     a teacher promoting themselves is the thing the whole
 *             permission model exists to prevent. An administrator
 *             changes these, from Users.
 *   status    same.
 *
 * The database enforces all three independently: `update_my_profile`
 * takes no user id and touches no such column, so this is not a screen
 * being polite about a rule it could break.
 */
export function MyAccount({ load, save, changePassword, onPasswordChanged }: Props) {
  const [state, retry] = useAsync(load, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">My Account</h1>
          <p className="page-sub">Your own details and password.</p>
        </div>
      </div>

      <Async state={state} retry={retry} rows={5}>
        {(account) => (
          <>
            <ProfileForm account={account} save={save} onSaved={retry} />
            <PasswordForm
              mustChange={account.mustChangePassword}
              changePassword={changePassword}
              onChanged={() => { retry(); onPasswordChanged?.(); }}
            />
          </>
        )}
      </Async>
    </div>
  );
}

function ProfileForm({ account, save, onSaved }: {
  account: MyAccountData;
  save: (edit: ProfileEdit) => Promise<void>;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    firstName: account.firstName,
    lastName: account.lastName,
    middleName: account.middleName ?? '',
    suffix: account.suffix ?? '',
    position: account.position ?? '',
    qualifications: account.qualifications ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setF((prev) => ({ ...prev, [k]: e.target.value }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await save({
        firstName: f.firstName, lastName: f.lastName,
        middleName: f.middleName || null, suffix: f.suffix || null,
        position: f.position || null, qualifications: f.qualifications || null,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Your details</h2>
          <p className="page-sub">
            {account.schoolName}
            {account.roles.length > 0 && ` · ${account.roles.join(', ')}`}
          </p>
        </div>
      </div>

      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

      <div className="form-grid">
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
          <input className="input" value={f.suffix} onChange={set('suffix')} disabled={busy} />
        </label>
        <label className="picker">
          <span className="field-label">Position</span>
          <input className="input" value={f.position} onChange={set('position')}
                 disabled={busy} placeholder="Teacher I" />
        </label>
        <label className="picker">
          <span className="field-label">Qualifications</span>
          <input className="input" value={f.qualifications} onChange={set('qualifications')}
                 disabled={busy} placeholder="BSEd Mathematics" />
        </label>
      </div>

      {/*
        Read-only, and labelled as such rather than simply absent — a
        person looking for "change my email" needs to be told where it
        went, not left hunting.
      */}
      <div className="form-grid">
        <div className="picker">
          <span className="field-label">Email (sign-in)</span>
          <p className="mono">{account.email}</p>
          <p className="faint">Ask an administrator to change this.</p>
        </div>
        <div className="picker">
          <span className="field-label">Employee ID</span>
          <p className="mono">{account.employeeId ?? '—'}</p>
          <p className="faint">Set by an administrator.</p>
        </div>
      </div>

      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </button>
        {saved && <span className="faint" role="status">Saved.</span>}
      </div>
    </form>
  );
}

/**
 * Two fields, because a mistyped password nobody can see locks the
 * person out of a system their school year depends on, and the only
 * way back is to find an administrator.
 */
export function PasswordForm({ mustChange, changePassword, onChanged }: {
  mustChange: boolean;
  changePassword: (password: string) => Promise<void>;
  onChanged: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await changePassword(password);
      setPassword('');
      setConfirm('');
      setDone(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Password</h2>
          {mustChange ? (
            <p className="page-sub" data-warn="true">
              You are signed in with a temporary password that an administrator
              set and therefore knows. Choose your own before you go any further.
            </p>
          ) : (
            <p className="page-sub">Choose a new password. At least 8 characters.</p>
          )}
        </div>
      </div>

      {error && <div className="err-banner" role="alert"><span>{error}</span></div>}

      <div className="form-grid">
        <label className="picker">
          <span className="field-label">New password</span>
          <input
            className="input" type="password" autoComplete="new-password"
            value={password} onChange={(e) => { setDone(false); setPassword(e.target.value); }}
            disabled={busy} minLength={8}
          />
        </label>
        <label className="picker">
          <span className="field-label">Confirm new password</span>
          <input
            className="input" type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => { setDone(false); setConfirm(e.target.value); }}
            disabled={busy}
          />
        </label>
      </div>

      {tooShort && <p className="signin-error">Use at least 8 characters.</p>}
      {mismatch && <p className="signin-error">The two passwords do not match.</p>}

      <div className="row-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || !valid}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
        {done && <span className="faint" role="status">Your password has been changed.</span>}
      </div>
    </form>
  );
}
