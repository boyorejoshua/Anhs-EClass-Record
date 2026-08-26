import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * The last line of defence against a blank screen.
 *
 * Nothing in this app catches a render-time exception, so one anywhere
 * in the tree unmounts the whole thing — React clears the root and
 * shows nothing. That is a strictly worse failure than an error
 * message: it looks identical to "still loading" and to "the internet
 * is down", and a teacher who has just tried to submit a term's grades
 * cannot tell whether they succeeded.
 *
 * This is deliberately generic — it does not try to recover, retry, or
 * guess what broke. Its only job is to turn a silent crash into a
 * visible one, with an action that always works: reload.
 */
interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in render:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="panel">
          <div className="panel-body empty" role="alert">
            <strong>Something went wrong</strong>
            <p>
              This screen hit an error and could not continue. Nothing you were
              working on was submitted by this — reloading returns you to where
              you left off.
            </p>
            <p className="faint mono" style={{ marginTop: 8 }}>{this.state.error.message}</p>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
