export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Never save silently — teachers distrust it (handoff, "Autosave").
 * V0's answer to persistence was a forced file download every 15 minutes
 * with "check your Downloads folder"; this is what replaces it.
 */
export function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: Date | null }) {
  const label =
    state === 'saving' ? 'Saving…'
    : state === 'error' ? 'Not saved — retry'
    : state === 'saved' && savedAt ? `Saved ${relative(savedAt)}`
    : 'No changes';

  return (
    <span className="save" data-state={state} role="status" aria-live="polite">
      <span className="save-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function relative(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
