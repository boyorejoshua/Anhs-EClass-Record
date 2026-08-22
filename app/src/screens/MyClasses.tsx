import { useMemo, useState } from 'react';
import type { AcademicYear, ClassSummary, SubmissionStatus } from '../data/types';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/Async';
import { displayStatus, pct } from '../lib/status';

interface Props {
  classes: ClassSummary[];
  year: AcademicYear;
  periodId: string;
  onOpenClass: (classId: string, tab?: 'gradebook' | 'attendance' | 'submission') => void;
  /** Set when the screen is being used to pick a class for a specific task. */
  purpose?: { label: string; tab: 'gradebook' | 'attendance' | 'submission' };
}

type Filter = 'all' | SubmissionStatus;

const FILTERS: Array<[Filter, string]> = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['in_progress', 'In progress'],
  ['returned', 'Returned'],
  ['submitted', 'Submitted'],
  ['approved', 'Approved'],
  ['finalized', 'Finalized'],
  ['published', 'Published'],
];

/**
 * My Classes.
 *
 * Previously a menu entry with no screen — it rendered the dashboard.
 *
 * The filter set includes `in_progress`, which is NOT a database status:
 * migration 0007's CHECK allows draft/submitted/returned/approved/
 * finalized/published/reopened and nothing else. It is derived here from
 * "draft, but some scores are in", because that is the distinction a
 * teacher actually cares about — an untouched class and a half-finished
 * one are the same row to the database and very different to a person.
 */
export function MyClasses({ classes, year, periodId, onOpenClass, purpose }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const period = year.periods.find((p) => p.id === periodId);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      const shown = displayStatus(c, periodId);
      if (filter !== 'all' && shown !== filter) return false;
      if (!q) return true;
      return [c.subject, c.section, c.gradeLevel, c.subjectCode]
        .some((f) => f.toLowerCase().includes(q));
    });
  }, [classes, filter, query, periodId]);

  // Only offer filters that match something, so the control never leads
  // to a guaranteed-empty result.
  const available = useMemo(() => {
    const present = new Set(classes.map((c) => displayStatus(c, periodId)));
    return FILTERS.filter(([f]) => f === 'all' || present.has(f as SubmissionStatus));
  }, [classes, periodId]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">{purpose ? purpose.label : 'My classes'}</h1>
          <p className="page-sub">
            {period?.name} · SY {year.label} · {classes.length} class
            {classes.length === 1 ? '' : 'es'}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="gb-toolbar">
          <div className="seg" role="group" aria-label="Filter by status">
            {available.map(([f, label]) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="spacer" />
          <label className="sr-only" htmlFor="class-search">Search classes</label>
          <input
            id="class-search"
            className="input"
            type="search"
            placeholder="Search subject or section…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={classes.length === 0 ? 'No classes assigned' : 'Nothing matches'}
            action={
              classes.length > 0 && (
                <button className="btn btn-sm" onClick={() => { setFilter('all'); setQuery(''); }}>
                  Clear filters
                </button>
              )
            }
          >
            {classes.length === 0
              ? 'An administrator assigns teaching loads. Once a class is assigned to you it appears here.'
              : `No class matches this filter in ${period?.name}.`}
          </EmptyState>
        ) : (
          <div className="panel-body">
            <div className="grid-cards">
              {rows.map((c) => {
                const done = c.completeness[periodId];
                const p = pct(done);
                return (
                  <div className="class-card" key={c.id}>
                    <div className="row">
                      <h3>{c.gradeLevel} – {c.section}</h3>
                      <div className="spacer" />
                      <StatusBadge status={displayStatus(c, periodId)} />
                    </div>
                    <div className="meta">{c.subject}</div>

                    <div className="cc-meta">
                      <span>{c.studentCount} learners</span>
                      {c.scheduleNote && <span>{c.scheduleNote}</span>}
                      {c.room && <span>{c.room}</span>}
                    </div>

                    <div className="cc-progress" title={done ? `${done.scored} of ${done.total} scores entered` : undefined}>
                      <div className="cc-bar"><span style={{ width: `${p}%` }} data-full={p === 100} /></div>
                      <span className="mono cc-pct">{p}%</span>
                    </div>

                    <div className="cc-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onOpenClass(c.id, purpose?.tab ?? 'gradebook')}
                      >
                        {purpose ? purpose.label.replace(/^Pick a class.*/, 'Open') : 'Open class'}
                      </button>
                      {!purpose && (
                        <button className="btn btn-sm" onClick={() => onOpenClass(c.id, 'submission')}>
                          Submission
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
