import { useCallback, useMemo, useState } from 'react';
import type { AttendanceDay, AttendanceMark } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';
import { SaveIndicator, type SaveState } from '../components/SaveIndicator';

interface Props {
  classId: string;
  load: (classId: string, date: string) => Promise<AttendanceDay>;
  save: (classId: string, date: string, marks: AttendanceMark[]) => Promise<{ written: number }>;
}

/** Today, in the browser's timezone, as YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Daily attendance for one class.
 *
 * Uses the existing model exactly — `calendar_days` decides what is a
 * class day, `attendance_statuses` is per-school configuration, and the
 * one-mark-per-learner-per-day unique index is the conflict target. No
 * second attendance model, which docs/10 and the brief both rule out.
 *
 * The statuses are NOT hard-coded to P/A/L/E. They come from the
 * school's own rows, so a school that adds "Tardy — excused" gets it
 * without a code change, and the present/absent/neutral counting comes
 * from `counts_as` rather than from matching on a letter.
 *
 * A non-class day is a first-class state. Marking attendance on a
 * Saturday would corrupt the expected-days denominator that SF2 and SF4
 * divide by, so the server refuses it and this screen explains why
 * rather than showing an empty roster.
 */
export function ClassAttendance({ classId, load, save }: Props) {
  const [date, setDate] = useState(today());
  const [state, retry, patch] = useAsync(() => load(classId, date), [classId, date]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (marks: AttendanceMark[]) => {
    setSaveState('saving');
    setError(null);
    try {
      await save(classId, date, marks);
      setSaveState('saved');
      setSavedAt(new Date());
    } catch (e) {
      setSaveState('error');
      setError(e instanceof Error ? e.message : 'Could not save attendance.');
    }
  }, [save, classId, date]);

  const mark = useCallback((enrollmentId: string, statusId: string) => {
    patch((d) => ({
      ...d,
      roster: d.roster.map((r) => (r.enrollmentId === enrollmentId ? { ...r, statusId } : r)),
    }));
    void persist([{ enrollmentId, statusId }]);
  }, [patch, persist]);

  const markAll = useCallback((statusId: string) => {
    if (state.status !== 'ready') return;
    const marks = state.data.roster.map((r) => ({ enrollmentId: r.enrollmentId, statusId }));
    patch((d) => ({ ...d, roster: d.roster.map((r) => ({ ...r, statusId })) }));
    void persist(marks);
  }, [state, patch, persist]);

  const summary = useMemo(() => {
    if (state.status !== 'ready') return null;
    const by = new Map<string, number>();
    let unmarked = 0;
    for (const r of state.data.roster) {
      if (!r.statusId) { unmarked += 1; continue; }
      by.set(r.statusId, (by.get(r.statusId) ?? 0) + 1);
    }
    return { by, unmarked };
  }, [state]);

  return (
    <div className="panel">
      <div className="gb-toolbar">
        <label htmlFor="att-date" className="topbar-label">Date</label>
        <input
          id="att-date"
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="spacer" />
        <SaveIndicator state={saveState} savedAt={savedAt} />
      </div>

      {error && (
        <div className="err-banner" role="alert">
          <span>{error}</span>
          <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <Async
        state={state}
        retry={retry}
        isEmpty={(d) => !d.isClassDay || d.roster.length === 0}
        empty={
          state.status === 'ready' && !state.data.isClassDay ? (
            <EmptyState title="Not a class day">
              {state.data.dayType === 'not_in_calendar'
                ? 'This date is outside the school calendar for this year, so attendance cannot be recorded against it.'
                : `The school calendar marks this as a ${state.data.dayType.replace('_', ' ')} day${state.data.dayNote ? ` (${state.data.dayNote})` : ''}. Attendance is only recorded on class days — the expected-days figure on SF2 and SF4 depends on it.`}
            </EmptyState>
          ) : (
            <EmptyState title="No learners in this class">
              Once learners are enrolled in this class they appear here.
            </EmptyState>
          )
        }
      >
        {(d) => (
          <>
            <div className="att-bulk">
              <span>Mark everyone</span>
              {d.statuses.map((s) => (
                <button key={s.id} className="btn btn-sm" onClick={() => markAll(s.id)}>
                  {s.label}
                </button>
              ))}
              <div className="spacer" />
              {summary && (
                <span className="mono att-summary">
                  {d.statuses.map((s) => `${s.code} ${summary.by.get(s.id) ?? 0}`).join(' · ')}
                  {summary.unmarked > 0 && ` · ${summary.unmarked} unmarked`}
                </span>
              )}
            </div>

            <div className="att-list" role="group" aria-label={`Attendance for ${d.date}`}>
              {d.roster.map((r) => (
                <div className="att-row" key={r.enrollmentId}>
                  <span className="att-name">
                    <span className="gb-dot" data-missing={!r.statusId} aria-hidden="true" />
                    {r.displayName}
                  </span>
                  <div className="att-choices" role="radiogroup" aria-label={r.displayName}>
                    {d.statuses.map((s) => (
                      <button
                        key={s.id}
                        role="radio"
                        aria-checked={r.statusId === s.id}
                        data-counts={s.countsAs}
                        title={s.label}
                        onClick={() => mark(r.enrollmentId, s.id)}
                      >
                        {s.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
