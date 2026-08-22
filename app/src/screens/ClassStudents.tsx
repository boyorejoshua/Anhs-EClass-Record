import { useMemo, useState } from 'react';
import type { ClassStudent } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  classId: string;
  load: (classId: string) => Promise<ClassStudent[]>;
  onOpenRecord?: (studentId: string) => void;
}

/**
 * The class list.
 *
 * LRN is shown because RLS has already decided whether this caller may
 * read the learner row at all — a teacher of the class can, which is the
 * same rule SF1 relies on. There is no separate frontend check, because
 * a frontend check would be the only one and therefore no check.
 */
export function ClassStudents({ classId, load, onOpenRecord }: Props) {
  const [state, retry] = useAsync(() => load(classId), [classId]);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    if (!q) return state.data;
    return state.data.filter((s) =>
      s.displayName.toLowerCase().includes(q)
      || (s.lrn ?? '').includes(q)
      || (s.studentNumber ?? '').toLowerCase().includes(q));
  }, [state, query]);

  return (
    <div className="panel">
      <div className="gb-toolbar">
        <label className="sr-only" htmlFor="student-search">Search learners</label>
        <input
          id="student-search"
          className="input"
          type="search"
          placeholder="Search name, LRN or student number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="spacer" />
        {state.status === 'ready' && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {filtered.length} of {state.data.length}
          </span>
        )}
      </div>

      <Async
        state={state}
        retry={retry}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState title="No learners in this class">
            A registrar enrols learners into a section, and the class roster follows from
            that. Once they are enrolled they appear here.
          </EmptyState>
        }
      >
        {() =>
          filtered.length === 0 ? (
            <EmptyState title="Nothing matches">
              No learner in this class matches “{query}”.
            </EmptyState>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Learner</th>
                    <th scope="col">Student no.</th>
                    <th scope="col">LRN</th>
                    <th scope="col">Enrolment</th>
                    <th scope="col" className="num">Final</th>
                    {onOpenRecord && <th scope="col"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.classEnrollmentId}>
                      <th scope="row">{s.displayName}</th>
                      <td className="mono">{s.studentNumber ?? '—'}</td>
                      <td className="mono">{s.lrn ?? <span title="No LRN on record">—</span>}</td>
                      <td>
                        <span className="pill" data-tone={s.enrollmentStatus === 'enrolled' ? 'ok' : 'muted'}>
                          {s.enrollmentStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="num mono">{s.finalGrade ?? '—'}</td>
                      {onOpenRecord && (
                        <td>
                          <button className="btn btn-sm" onClick={() => onOpenRecord(s.studentId)}>
                            View record
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Async>
    </div>
  );
}
