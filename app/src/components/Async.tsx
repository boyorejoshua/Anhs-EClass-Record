import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loading / empty / error / retry, in one place.
 *
 * Every screen in the audit that fetched anything had at most a shared
 * banner at the top of the app and a blank body underneath. A teacher on
 * a school connection sees that blank body for several seconds and
 * cannot tell it apart from "there is nothing here" or "it is broken".
 *
 * Four states, always distinguishable:
 *   loading  — a skeleton the shape of the content
 *   error    — what failed, and a Retry that actually refetches
 *   empty    — what would be here, and how it gets here
 *   ready    — the content
 */

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T };

/**
 * Runs `load` when its dependencies change, and again on retry.
 *
 * Ignores the result of a superseded request. Without that, switching
 * period twice quickly can render the first response after the second —
 * the classic race that shows the wrong term's grades with the right
 * term's heading.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: React.DependencyList,
): [AsyncState<T>, () => void, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setState({ status: 'loading' });
    load()
      .then((data) => { if (mine === seq.current) setState({ status: 'ready', data }); })
      .catch((e: unknown) => {
        if (mine !== seq.current) return;
        setState({
          status: 'error',
          error: e instanceof Error ? e.message : 'Something went wrong.',
        });
      });
    // `load` is intentionally not a dependency: callers write it inline,
    // so a new identity on every render would loop forever. The explicit
    // dep list is the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  /** Optimistically patch loaded data — used after a successful write. */
  const patch = useCallback((updater: (prev: T) => T) => {
    setState((s) => (s.status === 'ready' ? { status: 'ready', data: updater(s.data) } : s));
  }, []);

  return [state, retry, patch];
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="sk" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div className="sk-row" key={i} />)}
    </div>
  );
}

export function Loading({ label = 'Loading…', rows }: { label?: string; rows?: number }) {
  return (
    <div className="panel-body">
      <p className="sr-only" role="status" aria-live="polite">{label}</p>
      <Skeleton rows={rows} />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <strong>Could not load this</strong>
      {message}
      {onRetry && (
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

/**
 * Renders the right one of the four states.
 *
 * `isEmpty` is a predicate rather than a length check so a screen can
 * decide for itself what "nothing to show" means — an attendance day
 * with a full roster but no class session is empty in a way that
 * `roster.length` cannot express.
 */
export function Async<T>({ state, retry, isEmpty, empty, children, rows }: {
  state: AsyncState<T>;
  retry?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
  rows?: number;
}) {
  if (state.status === 'loading') return <Loading rows={rows} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={retry} />;
  if (isEmpty?.(state.data) && empty) return <>{empty}</>;
  return <>{children(state.data)}</>;
}
