export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Never save silently — teachers distrust it (handoff, "Autosave").
 * V0's answer to persistence was a forced file download every 15 minutes
 * with "check your Downloads folder"; this is what replaces it.
 */
/**
 * The words alone, extracted so they can be unit-tested.
 *
 * Same reason `helpPlan` and `resolveActiveRole` are pure functions in
 * this codebase: vitest runs with `environment: 'node'` — no jsdom, no
 * @testing-library — so a rule that only exists inside JSX cannot be
 * tested at all. This one is worth testing because it is the sentence a
 * teacher trusts when deciding whether their work is safe.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the
 * relative wording is testable without freezing the clock.
 */
export function saveLabel(
  state: SaveState,
  savedAt: Date | null,
  unsaved = 0,
  now: number = Date.now(),
): string {
  if (state === 'saving') return 'Saving…';
  // On failure "retry" says what to do but not what is at stake. A count
  // does both — a teacher can tell one stray cell from a lost column.
  if (state === 'error') {
    return unsaved > 0
      ? `Not saved — ${unsaved} ${unsaved === 1 ? 'change' : 'changes'}`
      : 'Not saved — retry';
  }
  if (state === 'saved' && savedAt) return `Saved ${relative(savedAt, now)}`;
  return 'No changes';
}

export function SaveIndicator(
  { state, savedAt, unsaved = 0 }:
  { state: SaveState; savedAt: Date | null; /** Cells still not on the server. */ unsaved?: number },
) {
  const label = saveLabel(state, savedAt, unsaved);

  return (
    <span className="save" data-state={state} role="status" aria-live="polite">
      <span className="save-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function relative(d: Date, now: number = Date.now()): string {
  const secs = Math.floor((now - d.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
