import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compute, flattenComponents } from '../lib/grading';
import type { GradebookData } from '../data/types';
import type { ScoreEdit } from '../data/source';
import { SaveIndicator, type SaveState } from '../components/SaveIndicator';
import { EmptyState } from '../components/Async';

type ScoreMap = GradebookData['scores'];
type Category = 'all' | string;

interface Props {
  data: GradebookData;
  onSaveScores: (edits: ScoreEdit[]) => Promise<{ written: number }>;
  onDirtyChange?: (dirty: number) => void;
  /** Named so an unstarted period can say WHICH period is unstarted. */
  periodName?: string;
  /** Sends the teacher to Setup, where assessments are actually created. */
  onGoSetup?: () => void;
}

/**
 * The gradebook grid.
 *
 * This is the screen that decides adoption: if entering 45 students x 10
 * assessments is slower here than in Excel, teachers keep a parallel
 * spreadsheet and the whole product fails regardless of what else works.
 * The target is under 8 minutes, keyboard only.
 *
 * It replaces three V0 screens — Setup, Grade Entry and Bulk Entry —
 * with one grid where bulk is a MODE, not a page.
 */
export function Gradebook({
  data, onSaveScores, onDirtyChange, periodName, onGoSetup,
}: Props) {
  const { scheme, assessments, roster, editable } = data;

  const [scores, setScores] = useState<ScoreMap>(data.scores);
  const [category, setCategory] = useState<Category>('all');
  const [bulkMode, setBulkMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(false);

  const dirty = useRef<Set<string>>(new Set());
  // Remembers the last rendered grade per learner so a recomputed value
  // can pulse once. Without it the number changes silently three columns
  // away from where the teacher is typing and the causal link is lost.
  const prevGrades = useRef<Map<string, number | null>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    setScores(data.scores);
    dirty.current.clear();
    setSaveState('idle');
  }, [data.classId, data.periodId, data.scores]);

  /* ---------------------------------------------------------------- *
   * Columns — only components that actually have assessments, so an
   * empty component never renders a dead column.
   * ---------------------------------------------------------------- */
  const leaves = useMemo(() => flattenComponents(scheme.components), [scheme]);

  const columns = useMemo(() => {
    const withItems = leaves
      .map((leaf) => ({
        leaf,
        items: assessments
          .filter((a) => a.componentId === leaf.id)
          .sort((a, b) => a.ordinal - b.ordinal),
      }))
      .filter((g) => g.items.length > 0);

    return category === 'all' ? withItems : withItems.filter((g) => g.leaf.id === category);
  }, [leaves, assessments, category]);

  const visibleAssessments = useMemo(() => columns.flatMap((c) => c.items), [columns]);

  /* ---------------------------------------------------------------- *
   * Live computation — the same engine the server runs on save.
   * ---------------------------------------------------------------- */
  const results = useMemo(() => {
    const out = new Map<string, ReturnType<typeof compute>>();
    for (const s of roster) {
      const row = scores[s.classEnrollmentId] ?? {};
      out.set(
        s.classEnrollmentId,
        compute(
          scheme,
          assessments,
          assessments.map((a) => ({
            assessmentId: a.id,
            raw: row[a.id]?.raw ?? null,
            isExcused: row[a.id]?.isExcused ?? false,
          })),
        ),
      );
    }
    return out;
  }, [roster, scores, scheme, assessments]);

  // Record what was rendered, after the paint that used it.
  useEffect(() => {
    for (const s of roster) {
      prevGrades.current.set(s.classEnrollmentId, results.get(s.classEnrollmentId)?.periodGrade ?? null);
    }
  });

  const stats = useMemo(() => {
    let missing = 0;
    let over = 0;
    for (const s of roster) {
      for (const a of assessments) {
        const cell = scores[s.classEnrollmentId]?.[a.id];
        if (!cell || (cell.raw == null && !cell.isExcused)) missing += 1;
        else if (cell.raw != null && cell.raw > a.highestPossibleScore) over += 1;
      }
    }
    return { missing, over };
  }, [roster, assessments, scores]);

  const rowHasGap = useCallback(
    (ceId: string) =>
      assessments.some((a) => {
        const cell = scores[ceId]?.[a.id];
        return !cell || (cell.raw == null && !cell.isExcused);
      }),
    [assessments, scores],
  );

  const visibleRoster = useMemo(
    () => (onlyGaps ? roster.filter((s) => rowHasGap(s.classEnrollmentId)) : roster),
    [roster, onlyGaps, rowHasGap],
  );

  /* ---------------------------------------------------------------- *
   * Saving — debounced, batched, and never silent.
   * ---------------------------------------------------------------- */
  // Latest scores, readable from the debounced timer without making the
  // callback depend on `scores` (which would reset the debounce on every
  // keystroke and effectively disable it).
  const scoresRef = useRef(scores);
  useEffect(() => { scoresRef.current = scores; }, [scores]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    setSaveError(null);

    saveTimer.current = setTimeout(() => {
      // Post only the dirty cells. Snapshot the keys first: more edits
      // may arrive while the request is in flight, and those belong to
      // the next batch, not this one.
      const batch = [...dirty.current];
      if (batch.length === 0) { setSaveState('idle'); return; }

      const edits: ScoreEdit[] = batch.flatMap((key) => {
        const [ceId, assessmentId] = key.split(':');
        if (!ceId || !assessmentId) return [];
        const cell = scoresRef.current[ceId]?.[assessmentId];
        return [{
          classEnrollmentId: ceId,
          assessmentId,
          raw: cell?.raw ?? null,
          isExcused: cell?.isExcused ?? false,
        }];
      });

      void onSaveScores(edits)
        .then(() => {
          for (const k of batch) dirty.current.delete(k);
          setSaveState('saved');
          setSavedAt(new Date());
          onDirtyChange?.(dirty.current.size);
        })
        .catch((e: unknown) => {
          // Keep the values in the inputs and keep them dirty, so a
          // retry re-sends them. Losing a teacher's typing because a
          // request failed is the one unforgivable bug here.
          setSaveState('error');
          setSaveError(e instanceof Error ? e.message : 'Could not save.');
        });
    }, 700);
  }, [onSaveScores, onDirtyChange]);

  const retrySave = useCallback(() => { scheduleSave(); }, [scheduleSave]);

  const setScore = useCallback(
    (ceId: string, assessmentId: string, raw: number | null) => {
      setScores((prev) => ({
        ...prev,
        [ceId]: { ...(prev[ceId] ?? {}), [assessmentId]: { raw, isExcused: false } },
      }));
      dirty.current.add(`${ceId}:${assessmentId}`);
      onDirtyChange?.(dirty.current.size);
      scheduleSave();
    },
    [scheduleSave, onDirtyChange],
  );

  /* ---------------------------------------------------------------- *
   * Keyboard model. A teacher entering 45 x 10 should never reach for
   * the mouse (handoff, "Keyboard and entry").
   * ---------------------------------------------------------------- */
  const focusCell = useCallback((rowIdx: number, colIdx: number) => {
    const root = gridRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLInputElement>(
      `input[data-row="${rowIdx}"][data-col="${colIdx}"]`,
    );
    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
      const lastRow = visibleRoster.length - 1;
      const lastCol = visibleAssessments.length - 1;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          // Enter moves DOWN — one assessment across a class is the
          // natural entry pattern, so the default follows the column.
          focusCell(e.shiftKey ? Math.max(0, rowIdx - 1) : Math.min(lastRow, rowIdx + 1), colIdx);
          break;

        case 'Tab': {
          e.preventDefault();
          if (e.shiftKey) {
            if (colIdx > 0) focusCell(rowIdx, colIdx - 1);
            else if (rowIdx > 0) focusCell(rowIdx - 1, lastCol);  // wrap at row start
          } else if (colIdx < lastCol) {
            focusCell(rowIdx, colIdx + 1);
          } else if (rowIdx < lastRow) {
            focusCell(rowIdx + 1, 0);                              // wrap at row end
          }
          break;
        }

        case 'ArrowDown': e.preventDefault(); focusCell(Math.min(lastRow, rowIdx + 1), colIdx); break;
        case 'ArrowUp':   e.preventDefault(); focusCell(Math.max(0, rowIdx - 1), colIdx); break;
        case 'ArrowRight':
          if (e.currentTarget.selectionStart === e.currentTarget.value.length) {
            e.preventDefault(); focusCell(rowIdx, Math.min(lastCol, colIdx + 1));
          }
          break;
        case 'ArrowLeft':
          if (e.currentTarget.selectionStart === 0) {
            e.preventDefault(); focusCell(rowIdx, Math.max(0, colIdx - 1));
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.currentTarget.blur();
          break;

        case 'd':
        case 'D':
          // Ctrl/Cmd+D fills down from the cell above.
          if ((e.ctrlKey || e.metaKey) && rowIdx > 0) {
            e.preventDefault();
            const above = visibleRoster[rowIdx - 1];
            const item = visibleAssessments[colIdx];
            const here = visibleRoster[rowIdx];
            if (above && item && here) {
              const value = scores[above.classEnrollmentId]?.[item.id]?.raw ?? null;
              setScore(here.classEnrollmentId, item.id, value);
            }
          }
          break;

        default:
          break;
      }
    },
    [visibleRoster, visibleAssessments, focusCell, scores, setScore],
  );

  /**
   * Paste is a hard requirement, not a nicety. Teachers have existing
   * spreadsheets; refusing paste tells them the new system is a
   * downgrade in the first five minutes. This is what replaces V0's
   * separate Bulk Entry page.
   */
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text.includes('\n') && !text.includes('\t')) return;   // single value: let it through
      e.preventDefault();

      const rows = text.replace(/\r/g, '').split('\n').filter((r) => r.length > 0);
      setScores((prev) => {
        const next = { ...prev };
        rows.forEach((line, r) => {
          const cells = line.split('\t');
          const student = visibleRoster[rowIdx + r];
          if (!student) return;
          cells.forEach((cellText, c) => {
            const item = visibleAssessments[colIdx + c];
            if (!item) return;
            const parsed = cellText.trim() === '' ? null : Number(cellText.trim());
            if (parsed != null && Number.isNaN(parsed)) return;
            next[student.classEnrollmentId] = {
              ...(next[student.classEnrollmentId] ?? {}),
              [item.id]: { raw: parsed, isExcused: false },
            };
            dirty.current.add(`${student.classEnrollmentId}:${item.id}`);
          });
        });
        return next;
      });
      onDirtyChange?.(dirty.current.size);
      scheduleSave();
    },
    [visibleRoster, visibleAssessments, scheduleSave, onDirtyChange],
  );

  const fillColumn = useCallback(
    (assessmentId: string, value: number | null) => {
      setScores((prev) => {
        const next = { ...prev };
        for (const s of visibleRoster) {
          next[s.classEnrollmentId] = {
            ...(next[s.classEnrollmentId] ?? {}),
            [assessmentId]: { raw: value, isExcused: false },
          };
          dirty.current.add(`${s.classEnrollmentId}:${assessmentId}`);
        }
        return next;
      });
      scheduleSave();
    },
    [visibleRoster, scheduleSave],
  );

  /* ---------------------------------------------------------------- */
  const weightLabel = useMemo(
    () =>
      scheme.components
        .filter((c) => c.parentId === null)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((c) => `${c.code} ${c.weight}%`)
        .join(' · '),
    [scheme],
  );

  /**
   * A period nobody has set up yet.
   *
   * Every OTHER Record Book tab already said so — Summary, Analytics and
   * LOA all render an EmptyState pointing at Setup. Grade Entry was the
   * one that did not: it drew the full roster with an em dash in every
   * cell and no word of explanation, which reads as a system that has
   * lost the marks rather than a term that has not started. The
   * production demonstration dataset seeds Terms 1 and 2 and stops, so
   * this is the FIRST thing a principal sees on clicking Term 3.
   *
   * Placed after every hook, so the hook order never changes.
   */
  if (assessments.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="Nothing to enter yet"
          action={onGoSetup
            ? <button className="btn btn-sm btn-primary" onClick={onGoSetup}>Open Setup</button>
            : undefined}
        >
          {periodName ?? 'This period'} has no assessments yet, so there is
          nothing to score. Add the written works, performance tasks and
          examinations in Setup, and they appear here as columns.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="panel">
      {/* Weights are RENDERED FROM THE SCHEME, never a literal string.
          The handoff hard-codes "WW 30% · PT 50% · TE 20%", which are
          V0's weights and were superseded by DO 015 s.2026. */}
      <div className="gb-toolbar">
        <div className="seg" role="group" aria-label="Filter by component">
          <button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>
          {leaves
            .filter((l) => assessments.some((a) => a.componentId === l.id))
            .map((l) => (
              <button key={l.id} aria-pressed={category === l.id} onClick={() => setCategory(l.id)}>
                {l.name}
              </button>
            ))}
        </div>

        <div className="gb-weights">
          Weights: <b>{weightLabel}</b>
          <span style={{ color: 'var(--faint)' }}> · {scheme.name}</span>
        </div>

        <div className="spacer" />
        <SaveIndicator state={saveState} savedAt={savedAt} />
        {saveState === 'error' && (
          <button className="btn btn-sm" onClick={retrySave}>Retry</button>
        )}
        <button
          className="btn btn-sm"
          aria-pressed={onlyGaps}
          onClick={() => setOnlyGaps((v) => !v)}
        >
          {onlyGaps ? 'Show all' : `Gaps only${stats.missing ? ` (${stats.missing})` : ''}`}
        </button>
        <button className="btn btn-sm" aria-pressed={bulkMode} onClick={() => setBulkMode((v) => !v)}>
          Bulk entry
        </button>
      </div>

      {saveError && (
        <div className="err-banner" role="alert">
          <span>{saveError}</span>
          <span style={{ opacity: .8 }}>Your entries are still here — press Retry.</span>
        </div>
      )}

      {bulkMode && (
        <div className="gb-bulk">
          <b>Bulk entry active</b>
          <span>
            Type in the first row and press Enter to move down the column, or paste a column
            straight from a spreadsheet.
          </span>
          <div className="spacer" />
          <button
            className="btn btn-sm"
            onClick={() => {
              const first = visibleAssessments[0];
              if (first) fillColumn(first.id, null);
            }}
          >
            Clear first column
          </button>
        </div>
      )}

      {!editable && (
        <div className="gb-bulk" style={{ background: 'var(--panel-alt-2)' }}>
          <b>Locked</b>
          <span>
            This period has been submitted. Ask the registrar to return it if a correction is needed.
          </span>
        </div>
      )}

      <div className="gb-wrap">
        <table className="gb" ref={gridRef}>
          <thead>
            <tr>
              <th scope="col" className="gb-student-head">Student</th>
              {columns.map((group) =>
                group.items.map((item) => (
                  <th key={item.id} scope="col" title={item.title ?? undefined}>
                    {/* A component with a single assessment is labelled by
                        its code alone — "TE", not "TE1". */}
                    {group.items.length === 1 ? group.leaf.code : `${group.leaf.code}${item.ordinal}`}
                    <span className="max">/{item.highestPossibleScore}</span>
                  </th>
                )),
              )}
              <th scope="col" className="gb-calc-head">Initial</th>
              <th scope="col" className="gb-calc-head">Grade</th>
            </tr>
          </thead>

          <tbody>
            {visibleRoster.map((student, rowIdx) => {
              const result = results.get(student.classEnrollmentId);
              const gap = rowHasGap(student.classEnrollmentId);
              const grade = result?.periodGrade ?? null;
              const band = grade == null ? undefined : grade >= 90 ? 'high' : grade >= 75 ? 'mid' : 'low';

              return (
                <tr key={student.classEnrollmentId}>
                  <th scope="row" className="gb-student">
                    <span className="gb-name">
                      <span className="gb-dot" data-missing={gap} aria-hidden="true" />
                      {student.displayName}
                    </span>
                  </th>

                  {visibleAssessments.map((item, colIdx) => {
                    const cell = scores[student.classEnrollmentId]?.[item.id];
                    const raw = cell?.raw ?? null;
                    const excused = cell?.isExcused ?? false;
                    const over = raw != null && raw > item.highestPossibleScore;
                    const missing = raw == null && !excused;
                    const state = over ? 'over' : excused ? 'excused' : missing ? 'missing' : 'ok';

                    return (
                      <td key={item.id} data-state={state} data-locked={!editable}>
                        <input
                          className="gb-input"
                          type="text"
                          inputMode="decimal"
                          data-row={rowIdx}
                          data-col={colIdx}
                          readOnly={!editable}
                          aria-readonly={!editable}
                          aria-label={`${student.displayName} ${item.title ?? item.id}`}
                          aria-invalid={over}
                          title={over ? `${item.title ?? 'Score'} cannot exceed ${item.highestPossibleScore}.` : undefined}
                          value={excused ? 'EX' : raw ?? ''}
                          onKeyDown={(e) => onKeyDown(e, rowIdx, colIdx)}
                          onPaste={(e) => onPaste(e, rowIdx, colIdx)}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const text = e.target.value.trim();
                            // digits and a single decimal point only
                            if (text !== '' && !/^\d*\.?\d*$/.test(text)) return;
                            setScore(student.classEnrollmentId, item.id, text === '' ? null : Number(text));
                          }}
                        />
                      </td>
                    );
                  })}

                  <td className="gb-calc">{result?.initialGrade?.toFixed(2) ?? '—'}</td>
                  <td className="gb-calc">
                    {grade == null
                      ? <span style={{ color: 'var(--faint)' }}>—</span>
                      : (
                        <span
                          className="gb-chip"
                          data-band={band}
                          // key on the value so React remounts the node and
                          // the CSS animation re-runs on every change
                          key={grade}
                          data-changed={
                            prevGrades.current.has(student.classEnrollmentId) &&
                            prevGrades.current.get(student.classEnrollmentId) !== grade
                              ? 'true' : undefined
                          }
                        >
                          {grade}
                        </span>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: per-learner card entry. A 25-column grid on a 375px
          screen is worse than either option (handoff, "Responsive"). */}
      <div className="gb-cards">
        {visibleRoster.map((student) => (
          <div className="gb-card" key={student.classEnrollmentId}>
            <h4>{student.displayName}</h4>
            {visibleAssessments.map((item) => (
              <div className="gb-card-row" key={item.id}>
                <label htmlFor={`m-${student.classEnrollmentId}-${item.id}`}>
                  {item.title} <span className="mono" style={{ color: 'var(--faint)' }}>/{item.highestPossibleScore}</span>
                </label>
                <input
                  id={`m-${student.classEnrollmentId}-${item.id}`}
                  type="text" inputMode="decimal" className="mono"
                  readOnly={!editable}
                  value={scores[student.classEnrollmentId]?.[item.id]?.raw ?? ''}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    if (t !== '' && !/^\d*\.?\d*$/.test(t)) return;
                    setScore(student.classEnrollmentId, item.id, t === '' ? null : Number(t));
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="panel-foot">
        <div className="gb-legend">
          {([
            ['editable', 'Editable'], ['calculated', 'Calculated'],
            ['missing', 'Missing'], ['over', 'Over limit'], ['locked', 'Locked'],
          ] as const).map(([kind, label]) => (
            <span className="gb-legend-item" key={kind}>
              <span className="gb-sw" data-kind={kind} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
        <div className="spacer" />
        <span className="mono">
          {stats.missing} missing · {stats.over} over limit ·{' '}
          {visibleRoster.length} of {roster.length} learners shown · limits from each assessment
        </span>
      </div>
    </div>
  );
}
