import { describe, expect, it } from 'vitest';
import { saveLabel } from './SaveIndicator';

/**
 * The sentence a teacher trusts when deciding whether their work is
 * safe. V0's answer to persistence was a forced file download every 15
 * minutes; this label is what replaced it, so it is worth pinning.
 */
describe('saveLabel', () => {
  const t0 = new Date('2026-09-07T10:00:00Z');
  const now = t0.getTime();

  it('says nothing is outstanding when nothing is', () => {
    expect(saveLabel('idle', null)).toBe('No changes');
  });

  it('says it is working while a save is in flight', () => {
    expect(saveLabel('saving', null)).toBe('Saving…');
  });

  it('confirms a save with when it happened', () => {
    expect(saveLabel('saved', t0, 0, now)).toBe('Saved just now');
    expect(saveLabel('saved', t0, 0, now + 30_000)).toBe('Saved 30s ago');
    expect(saveLabel('saved', t0, 0, now + 5 * 60_000)).toBe('Saved 5m ago');
  });

  it('reports HOW MUCH is unsaved on failure, not just that something is', () => {
    // "retry" says what to do but not what is at stake. A teacher needs
    // to tell one stray cell from a lost column.
    expect(saveLabel('error', null, 1)).toBe('Not saved — 1 change');
    expect(saveLabel('error', null, 12)).toBe('Not saved — 12 changes');
  });

  it('falls back to the instruction when the count is unknown', () => {
    expect(saveLabel('error', null, 0)).toBe('Not saved — retry');
  });

  it('never claims a save when the state is not saved', () => {
    // The failure that matters: showing "Saved" over unsaved work.
    for (const s of ['idle', 'saving', 'error'] as const) {
      expect(saveLabel(s, t0, 3, now)).not.toMatch(/^Saved/);
    }
  });
});
