import { useMemo } from 'react';
import type { EnrollmentRow, StudentRecord } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  studentId: string;
  load: (studentId: string) => Promise<StudentRecord | null>;
  onBack: () => void;
}

/**
 * One learner, whole.
 *
 * The shape of this screen is the shape of the schema, and that is the
 * point: identity at the top because there is one of it, then a row per
 * school year because there are many, then the grades those years
 * produced. A reader who has never seen the database should come away
 * knowing that moving section did not make a second learner.
 *
 * What is visible is decided by RLS, not here. A registrar opens anyone;
 * a teacher opens learners in their own classes; a learner opens
 * themselves. Anyone else gets the same answer as for a learner who does
 * not exist, which is the correct answer to give.
 */
export function StudentRecordScreen({ studentId, load, onBack }: Props) {
  const [state, retry] = useAsync(() => load(studentId), [studentId]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button className="link link-back" onClick={onBack}>← Students</button>
        </div>
      </div>

      <Async state={state} retry={retry} rows={8}>
        {(record) => (record === null ? (
          <div className="panel">
            <EmptyState title="Learner not found">
              This learner does not exist, or your account does not have access
              to their record.
            </EmptyState>
          </div>
        ) : <Record record={record} />)}
      </Async>
    </div>
  );
}

function Record({ record }: { record: StudentRecord }) {
  const { student, history, grades } = record;

  // The most recent year is the current one; the rest is history. The
  // list is already ordered newest-first by the contract.
  const current = history[0];
  const earlier = history.slice(1);

  /** Grades grouped by year and subject, so a row reads like a report card. */
  const byYear = useMemo(() => {
    const out = new Map<string, Map<string, typeof grades>>();
    for (const g of grades) {
      const year = out.get(g.academicYear) ?? new Map();
      year.set(g.subject, [...(year.get(g.subject) ?? []), g]);
      out.set(g.academicYear, year);
    }
    return out;
  }, [grades]);

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h1 className="greeting">{student.displayName}</h1>
            <p className="page-sub">
              {student.studentNumber ?? 'no student number'}
              {' · '}
              {student.lrn ? `LRN ${student.lrn}` : 'LRN not yet issued'}
              {student.hasPortalAccount && ' · has a portal account'}
            </p>
          </div>
          <div className="spacer" />
          <span className="pill" data-tone={student.status === 'active' ? 'ok' : undefined}>
            {student.status}
          </span>
        </div>

        <div className="panel-body">
          <dl className="detail-grid">
            <Detail label="Sex" value={student.sex} />
            <Detail label="Date of birth" value={student.birthDate} />
            <Detail label="Place of birth" value={student.birthPlace} />
            <Detail label="Mother tongue" value={student.motherTongue} />
            <Detail label="Contact" value={student.contactNumber} />
            <Detail label="Email" value={student.email} />
            <Detail
              label="Address"
              value={[student.addressLine, student.barangay, student.municipality, student.province]
                .filter(Boolean).join(', ') || null}
            />
          </dl>
        </div>
      </div>

      {/*
        CURRENT ENROLMENT — where this learner is now. Separated from the
        identity above because it is a different row with a different
        lifetime, and separated from the history below because it is the
        one a registrar acts on.
      */}
      <div className="panel">
        <div className="panel-head"><h2>Current enrolment</h2></div>
        {current ? (
          <div className="panel-body">
            <dl className="detail-grid">
              <Detail label="School year" value={current.academicYear} />
              <Detail label="Grade level" value={current.gradeLevel} />
              <Detail label="Section" value={current.section ?? 'Unassigned'} />
              <Detail label="Status" value={current.status} />
              <Detail label="Date enrolled" value={current.dateEnrolled} />
              <Detail label="General average" value={
                current.generalAverage == null ? null : String(current.generalAverage)} />
            </dl>
          </div>
        ) : (
          <EmptyState title="Not currently enrolled">
            This learner has an identity record but no enrolment in any school year.
          </EmptyState>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Academic history</h2>
            <p className="page-sub">
              One row per school year, all against this one learner.
            </p>
          </div>
        </div>
        {earlier.length === 0 ? (
          <EmptyState title="No earlier years">
            {current
              ? `${current.academicYear} is this learner's first year on record here.`
              : 'Nothing on record yet.'}
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">School year</th>
                  <th scope="col">Grade level</th>
                  <th scope="col">Section</th>
                  <th scope="col">Status</th>
                  <th scope="col">Promotion</th>
                  <th scope="col" className="num">General average</th>
                </tr>
              </thead>
              <tbody>
                {earlier.map((e: EnrollmentRow) => (
                  <tr key={e.enrollmentId}>
                    <th scope="row">{e.academicYear}</th>
                    <td>{e.gradeLevel}</td>
                    <td>{e.section ?? <span className="faint">—</span>}</td>
                    <td>{e.status}</td>
                    <td>{e.promotionStatus ?? <span className="faint">—</span>}</td>
                    <td className="num mono">
                      {e.generalAverage ?? <span className="faint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Grades</h2>
            <p className="page-sub">
              Recorded period grades, as the server computed them. What appears
              here is what your account is permitted to see.
            </p>
          </div>
        </div>
        {grades.length === 0 ? (
          <EmptyState title="No grades recorded">
            Nothing has been computed and filed for this learner yet, or none of
            it is visible to your account.
          </EmptyState>
        ) : (
          [...byYear.entries()].map(([year, subjects]) => (
            <div key={year} className="tbl-wrap">
              <h3 className="loa-title">SY {year}</h3>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col" className="num">Grade</th>
                    <th scope="col">Period</th>
                    <th scope="col">Descriptor</th>
                  </tr>
                </thead>
                <tbody>
                  {[...subjects.entries()].map(([subject, entries]) =>
                    entries
                      .sort((a, b) => a.periodOrdinal - b.periodOrdinal)
                      .map((g, i) => (
                        <tr key={`${subject}-${g.period}`}>
                          {i === 0
                            ? <th scope="row" rowSpan={entries.length}>{subject}</th>
                            : null}
                          <td className="num mono">
                            {g.grade == null ? <span className="faint">—</span> : (
                              <span className="gb-chip" data-band={
                                g.passed === false ? 'low' : g.grade >= 90 ? 'high' : 'mid'
                              }>{g.grade}</span>
                            )}
                          </td>
                          <td>{g.period}</td>
                          <td>{g.descriptor ?? <span className="faint">—</span>}</td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{value ?? <span className="faint">—</span>}</dd>
    </div>
  );
}
