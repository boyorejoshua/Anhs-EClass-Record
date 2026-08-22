import { useState } from 'react';

/**
 * Shown when a backend is configured but nobody is signed in.
 *
 * Never says whether an address exists — the difference between "no such
 * account" and "wrong password" tells an attacker which addresses are
 * real. One message covers both.
 */
export function SignIn({ schoolName, onSignIn }: {
  schoolName: string;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSignIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <form className="signin-card panel" onSubmit={submit}>
        <div className="signin-brand">
          <div className="side-mark" aria-hidden="true">ANHS</div>
          <div>
            <h1>Academic Records</h1>
            <p>{schoolName}</p>
          </div>
        </div>

        <label className="signin-field">
          <span>Email</span>
          <input
            className="input" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            disabled={busy} autoFocus
          />
        </label>

        <label className="signin-field">
          <span>Password</span>
          <input
            className="input" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>

        {error && <p className="signin-error" role="alert">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="signin-help">
          Trouble signing in? Your school administrator can reset your password.
        </p>
      </form>
    </div>
  );
}
