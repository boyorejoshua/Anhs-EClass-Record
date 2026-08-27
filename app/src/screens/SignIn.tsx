import { useState } from 'react';
import type { SignInBrand } from '../config';

/**
 * Shown when a backend is configured but nobody is signed in.
 *
 * Never says whether an address exists — the difference between "no such
 * account" and "wrong password" tells an attacker which addresses are
 * real. One message covers both.
 */
export function SignIn({ brand, onSignIn }: {
  brand: SignInBrand;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Masking is the default, and revealing is the escape hatch.
   *
   * It earns its place here more than on most sign-in forms: a teacher's
   * first password is one an administrator read out to them, and a
   * mistyped password they cannot see produces the same "that email and
   * password did not match" as a wrong one — sending them back to the
   * administrator for a reset they did not need.
   */
  const [reveal, setReveal] = useState(false);

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
          <div className="side-mark" aria-hidden="true">{brand.mark}</div>
          <div>
            <h1>Academic Records</h1>
            <p>{brand.name}</p>
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

        {/*
          A div rather than a wrapping <label>, unlike the email field
          above. The toggle is a BUTTON, and a button inside a label is
          also inside that label's click target — so every press would
          both toggle and re-focus the input. `htmlFor` keeps the label
          association without swallowing the button.
        */}
        <div className="signin-field">
          <label htmlFor="signin-password">Password</label>
          <div className="pw-wrap">
            <input
              id="signin-password"
              className="input"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="pw-toggle"
              aria-pressed={reveal}
              aria-controls="signin-password"
              onClick={() => setReveal((v) => !v)}
              disabled={busy}
            >
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

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
