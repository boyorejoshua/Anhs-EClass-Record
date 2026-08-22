import { useState } from 'react';
import type { DirectoryStudent } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  yearId: string;
  load: (yearId: string, search?: string) => Promise<DirectoryStudent[]>;
  onOpenRecord: (studentId: string) => void;
  /** Set when this screen is being used to pick a learner for SF10. */
  purpose?: string;
}

/**
 * The learner directory.
 *
 * Search runs on the server (`rds.students`), not against a
 * client-side array. A school with 1,500 learners cannot ship the whole
 * directory to the browser to filter it, and doing so would also hand
 * every learner's LRN to anyone who opens devtools — RLS would have
 * permitted the read, but there is no reason to make it.
 */
export function RegistrarStudents({ yearId, load, onOpenRecord, purpose }: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [state, retry] = useAsync(() => load(yearId, submitted), [yearId, submitted]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">{purpose ?? 'Students'}</h1>
          <p className="page-sub">
            {purpose
              ? 'Choose a learner to open their permanent record.'
              : 'Learners enrolled in the current school year.'}
          </p>
        </div>
      </div>

      <div className="panel">
        <form
          className="gb-toolbar"
          onSubmit={(e) => { e.preventDefault(); setSubmitted(query); }}
        >
          <label className="sr-only" htmlFor="dir-search">Search learners</label>
          <input
            id="dir-search"
            className="input"
            type="search"
            placeholder="Name, LRN or student number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-sm" type="submit">Search</button>
          {submitted && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => { setQuery(''); setSubmitted(''); }}
            >
              Clear
            </button>
          )}
          <div className="spacer" />
          {state.status === 'ready' && (
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {state.data.length} learner{state.data.length === 1 ? '' : 's'}
            </span>
          )}
        </form>

        <Async
          state={state}
          retry={retry}
          isEmpty={(d) => d.length === 0}
          empty={
            <EmptyState title={submitted ? 'No learner matches' : 'No learners enrolled'}>
              {submitted
                ? `Nothing matches “${submitted}” in this school year.`
                : 'Once learners are enrolled for this school year they appear here.'}
            </EmptyState>
          }
        >
          {(d) => (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">LRN</th>
                    <th scope="col">Grade &amp; section</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Gen. ave.</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {d.map((s) => (
                    <tr key={s.studentId}>
                      <th scope="row">
                        {s.displayName}
                        <span className="tbl-sub mono">{s.studentNumber ?? '—'}</span>
                      </th>
                      <td className="mono">{s.lrn ?? '—'}</td>
                      <td>{s.gradeLevel}{s.section ? ` – ${s.section}` : ''}</td>
                      <td>
                        <span className="pill" data-tone={s.enrollmentStatus === 'enrolled' ? 'ok' : 'muted'}>
                          {s.enrollmentStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="num mono">{s.generalAverage ?? '—'}</td>
                      <td>
                        <button className="btn btn-sm" onClick={() => onOpenRecord(s.studentId)}>
                          {purpose ? 'Open SF10' : 'Academic record'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}
