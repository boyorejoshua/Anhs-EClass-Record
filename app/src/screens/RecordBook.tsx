import { Fragment, useMemo, useState } from 'react';
import type {
  AcademicPeriod, ClassSummary, GradebookData, PersistedGrade,
} from '../data/types';
import {
  analytics, loaReport, reconcileRecorded, summaryRows, type SummaryRow,
} from '../lib/recordbook';
import { EmptyState } from '../components/Async';
import { downloadCsv, slug, toCsv } from '../lib/export';

interface Props {
  cls: ClassSummary;
  period: AcademicPeriod;
  yearLabel: string;
  data: GradebookData;
  onOpenStudent: (row: SummaryRow) => void;
  onGoGradebook: () => void;
}

interface SummaryProps extends Props {
  /**
   * The grades the server recorded, keyed by class-enrolment id. Empty
   * until this period has been submitted at least once.
   */
  recorded: Record<string, PersistedGrade>;
}

/** "22 Aug 2026, 10:00" — a stamp a teacher can match to their own memory. */
function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* ================================================================== *
 * SUMMARY
 * ================================================================== */

export function RecordBookSummary({
  cls, period, yearLabel, data, recorded, onOpenStudent, onGoGradebook,
}: SummaryProps) {
  const rows = useMemo(() => summaryRows(data), [data]);
  const check = useMemo(() => reconcileRecorded(data, recorded), [data, recorded]);
  const byLearner = useMemo(
    () => new Map(check.rows.map((r) => [r.classEnrollmentId, r])),
    [check],
  );
  const [onlyIssues, setOnlyIssues] = useState(false);

  const shown = onlyIssues
    ? rows.filter((r) => r.missingCount > 0 || r.passed === false)
    : rows;

  const parents = rows[0]?.components ?? [];

  function exportCsv() {
    const header = [
      'Learner',
      ...parents.flatMap((c) => [`${c.code} PS%`, `${c.code} WS (${c.weight}%)`]),
      'Initial grade', 'Period grade', 'Descriptor', 'Remark', 'Missing',
    ];
    const body = rows.map((r) => [
      r.displayName,
      ...r.components.flatMap((c) => [c.percentageScore ?? '', c.weightedScore ?? '']),
      r.initialGrade ?? '', r.periodGrade ?? '', r.descriptor ?? '', r.remark ?? '', r.missingCount,
    ]);
    downloadCsv(
      `${slug(cls.gradeLevel, cls.section, cls.subjectCode, period.shortName, 'summary')}.csv`,
      toCsv([
        [`${cls.gradeLevel} – ${cls.section}`, cls.subject],
        [`SY ${yearLabel}`, period.name, `Scheme: ${data.scheme.name}`],
        [], header, ...body,
      ]),
    );
  }

  if (data.assessments.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="Nothing to summarise yet"
          action={<button className="btn btn-sm btn-primary" onClick={onGoGradebook}>Open Setup</button>}
        >
          {period.name} has no assessments configured, so there is nothing to compute.
          Set up the record book first.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="gb-toolbar">
        <div className="gb-weights">
          {parents.map((c) => `${c.code} ${c.weight}%`).join(' · ')}
          <span style={{ color: 'var(--faint)' }}> · {data.scheme.name}</span>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" aria-pressed={onlyIssues} onClick={() => setOnlyIssues((v) => !v)}>
          {onlyIssues ? 'Show all' : 'Needs attention only'}
        </button>
        <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>

      {/*
        Where the grade actually lives.

        Before this period is submitted, every number on this screen is a
        browser calculation — useful, but not a record. Saying so is the
        honest thing: a teacher who believes these are filed grades will
        not submit, and the term will pass with nothing on file.
      */}
      {check.recordedCount === 0 ? (
        <p className="callout" data-inline="true" data-tone="info">
          <b>No grades recorded yet.</b> The figures below are calculated in
          this browser from the current scores. They become part of the
          learner's record when you submit {period.name} — the server
          recomputes them and files the result.
        </p>
      ) : check.staleCount > 0 ? (
        <p className="callout" data-inline="true" data-tone="warn">
          <b>{check.staleCount} recorded {check.staleCount === 1 ? 'grade differs' : 'grades differ'} from
          the current scores.</b>{' '}
          {check.computedAt && <>The filed grades were computed {when(check.computedAt)}. </>}
          Scores have changed since. The filed grade is what the registrar
          sees; resubmit {period.name} to bring it up to date.
        </p>
      ) : (
        <p className="callout" data-inline="true" data-tone="ok">
          <b>Grades filed{check.computedAt ? ` ${when(check.computedAt)}` : ''}.</b>{' '}
          {check.complete
            ? 'Every learner has a recorded grade matching the current scores.'
            : `${check.recordedCount} of ${data.roster.length} learners have a recorded grade — `
              + 'the rest joined after the last submission.'}
          {check.runningDiffers && (
            <>
              {' '}The <b>Grade</b> column is the running total, which skips work
              not yet scored. <b>Filed</b> counts it as zero, because that is what
              a submitted grade means. Enter the missing marks and resubmit to
              close the gap.
            </>
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState title="Nothing needs attention">
          Every learner has a complete set of scores and is at or above the pass mark.
        </EmptyState>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>Learner</th>
                {parents.map((c) => (
                  <th scope="colgroup" colSpan={2} key={c.componentId} className="num">
                    {c.name} <span className="faint">{c.weight}%</span>
                  </th>
                ))}
                <th scope="col" rowSpan={2} className="num">Initial</th>
                <th scope="col" rowSpan={2} className="num">Grade</th>
                {check.recordedCount > 0 && (
                  <th scope="col" rowSpan={2} className="num" title="The grade the server recorded at submission">
                    Filed
                  </th>
                )}
                <th scope="col" rowSpan={2}>Remark</th>
              </tr>
              <tr>
                {parents.map((c) => (
                  // Keyed on the Fragment, which is what this map
                  // returns; a key on the children inside is invisible
                  // to React's list reconciliation.
                  <Fragment key={c.componentId}>
                    <th scope="col" className="num sub-th">PS</th>
                    <th scope="col" className="num sub-th">WS</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.classEnrollmentId}>
                  <th scope="row">
                    <button className="link" onClick={() => onOpenStudent(r)}>{r.displayName}</button>
                    {r.missingCount > 0 && (
                      <span className="tbl-sub" data-warn="true">{r.missingCount} missing</span>
                    )}
                  </th>
                  {r.components.map((c) => (
                    <Fragment key={c.componentId}>
                      <td className="num mono">
                        {c.percentageScore ?? <span className="faint">—</span>}
                      </td>
                      <td className="num mono">
                        {c.weightedScore ?? <span className="faint">—</span>}
                      </td>
                    </Fragment>
                  ))}
                  <td className="num mono">{r.initialGrade ?? <span className="faint">—</span>}</td>
                  <td className="num mono">
                    {r.periodGrade == null ? <span className="faint">—</span> : (
                      <span className="gb-chip" data-band={r.periodGrade >= 90 ? 'high' : r.periodGrade >= data.scheme.passMark ? 'mid' : 'low'}>
                        {r.periodGrade}
                      </span>
                    )}
                  </td>
                  {check.recordedCount > 0 && (() => {
                    const filed = byLearner.get(r.classEnrollmentId);
                    return (
                      <td className="num mono">
                        {filed?.recorded == null ? (
                          <span className="faint" title="No grade on file for this learner">—</span>
                        ) : (
                          <>
                            {filed.recorded.periodGrade}
                            {filed.stale && (
                              <span className="tbl-sub" data-warn="true">
                                now {filed.recomputed ?? '—'}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })()}
                  <td>
                    {r.descriptor ?? <span className="faint">—</span>}
                    {r.remark && <span className="tbl-sub">{r.remark}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * ANALYTICS
 * ================================================================== */

export function RecordBookAnalytics({ cls, period, data, onGoGradebook }: Omit<Props, 'onOpenStudent' | 'yearLabel'>) {
  const rows = useMemo(() => summaryRows(data), [data]);
  const a = useMemo(
    () => analytics(rows, data.scheme, data.assessments.length),
    [rows, data.scheme, data.assessments.length],
  );

  if (data.assessments.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="No data to analyse"
          action={<button className="btn btn-sm btn-primary" onClick={onGoGradebook}>Open Setup</button>}
        >
          {period.name} has no assessments configured yet.
        </EmptyState>
      </div>
    );
  }

  const peak = Math.max(...a.distribution.map((b) => b.count), 1);

  return (
    <>
      <div className="stat-row">
        <div className="stat"><b>{a.classSize}</b><span>Learners</span></div>
        <div className="stat"><b>{a.average ?? '—'}</b><span>Class average</span></div>
        <div className="stat"><b>{a.highest ?? '—'}</b><span>Highest</span></div>
        <div className="stat"><b>{a.lowest ?? '—'}</b><span>Lowest</span></div>
        <div className="stat"><b>{a.passing}</b><span>Passing</span></div>
        <div className="stat"><b data-warn={a.failing > 0}>{a.failing}</b><span>Failing</span></div>
        <div className="stat"><b data-warn={a.missingScores > 0}>{a.missingScores}</b><span>Missing scores</span></div>
        <div className="stat"><b>{a.completion}%</b><span>Complete</span></div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h2>Grade distribution</h2></div>
          <div className="panel-body">
            {a.graded === 0 ? (
              <EmptyState title="No computable grades yet">
                A grade appears once a learner has at least one score.
              </EmptyState>
            ) : (
              <div className="dist">
                {a.distribution.map((b) => (
                  <div className="dist-row" key={b.label}>
                    <span className="dist-label mono">{b.label}</span>
                    <div className="dist-track">
                      <span
                        style={{ width: `${(b.count / peak) * 100}%` }}
                        data-low={b.max < data.scheme.passMark}
                        title={b.names.join(', ')}
                      />
                    </div>
                    <span className="dist-count mono">{b.count}</span>
                  </div>
                ))}
                {a.ungraded > 0 && (
                  <p className="menu-note">
                    {a.ungraded} learner{a.ungraded === 1 ? ' is' : 's are'} not counted — no score
                    has been entered for them in {period.name}.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Component averages</h2></div>
          <div className="panel-body">
            <dl className="facts">
              {a.componentAverages.map((c) => (
                <div key={c.code}>
                  <dt>{c.name}</dt>
                  <dd className="mono">{c.average == null ? '—' : `${c.average}%`}</dd>
                </div>
              ))}
            </dl>
            <p className="menu-note">
              Mean percentage score per component, across learners who have one. This is the
              figure the Level of Achievement report bands.
            </p>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Needs attention</h2>
          <div className="spacer" />
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {a.needsAttention.length} of {a.classSize}
          </span>
        </div>
        {a.needsAttention.length === 0 ? (
          <EmptyState title="Nobody flagged">
            Every learner in {cls.section} is at or above the pass mark with a complete record.
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col" className="num">Grade</th>
                  <th scope="col" className="num">Missing</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {a.needsAttention.map((s) => (
                  <tr key={s.name}>
                    <th scope="row">{s.name}</th>
                    <td className="num mono" data-warn={s.grade != null && s.grade < data.scheme.passMark}>
                      {s.grade ?? '—'}
                    </td>
                    <td className="num mono">{s.missing || '—'}</td>
                    <td>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ================================================================== *
 * LOA — LEVEL OF ACHIEVEMENT
 * ================================================================== */

export function RecordBookLoa({ cls, period, yearLabel, data, onGoGradebook }: Omit<Props, 'onOpenStudent'>) {
  const rows = useMemo(() => summaryRows(data), [data]);
  const loa = useMemo(() => loaReport(rows, data.scheme), [rows, data.scheme]);

  if (data.assessments.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="No achievement data yet"
          action={<button className="btn btn-sm btn-primary" onClick={onGoGradebook}>Open Setup</button>}
        >
          The Level of Achievement report is computed from grade entries. {period.name} has no
          assessments configured yet.
        </EmptyState>
      </div>
    );
  }

  function exportCsv() {
    const out: unknown[][] = [
      [`LEVEL OF ACHIEVEMENT — ${cls.subject} · ${cls.gradeLevel} – ${cls.section}`],
      [`SY ${yearLabel}`, period.name, `${loa.learners} learners`],
      [],
    ];
    for (const s of loa.sections) {
      out.push([`${s.name.toUpperCase()} (${s.weight}%)`]);
      out.push(['Band', 'Range', 'Count', '% of class']);
      for (const b of s.bands) out.push([b.label, b.range, b.count, `${b.percent}%`]);
      out.push(['Mean percentage score', '', s.mean ?? '', '']);
      out.push(['Learners with no score', '', s.missing, '']);
      out.push([]);
    }
    out.push([`${period.name.toUpperCase()} GRADE DISTRIBUTION`]);
    out.push(['Descriptor', 'Range', 'Count', '% of class']);
    for (const b of loa.gradeBands) out.push([b.label, b.range, b.count, `${b.percent}%`]);
    out.push(['Mean period grade', '', loa.meanPeriodGrade ?? '', '']);
    downloadCsv(
      `${slug(cls.gradeLevel, cls.section, cls.subjectCode, period.shortName, 'loa')}.csv`,
      toCsv(out),
    );
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Level of Achievement</h2>
            <p className="page-sub">
              {cls.subject} · {cls.gradeLevel} – {cls.section} · {period.name} · SY {yearLabel} ·{' '}
              {loa.learners} learners
            </p>
          </div>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
        </div>
        <div className="panel-body">
          <p className="menu-note" style={{ margin: 0 }}>
            Computed from grade entries — this report has no attendance component. Proficiency
            thresholds are carried over from the previous system and have not been confirmed
            against a division-office issuance; see docs/20-assumptions-register.md before
            filing.
          </p>
        </div>
      </div>

      {loa.sections.map((s) => (
        <div className="panel" key={s.code}>
          <div className="panel-head">
            <h2>{s.name} <span className="faint">{s.weight}%</span></h2>
            <div className="spacer" />
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
              mean {s.mean ?? '—'}% · {s.scored} scored · {s.missing} without a score
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Proficiency level</th>
                  <th scope="col">Range</th>
                  <th scope="col" className="num">Learners</th>
                  <th scope="col" className="num">% of class</th>
                </tr>
              </thead>
              <tbody>
                {s.bands.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{b.label}</th>
                    <td className="mono">{b.range}</td>
                    <td className="num mono">{b.count}</td>
                    <td className="num mono">{b.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="panel">
        <div className="panel-head">
          <h2>{period.name} grade distribution</h2>
          <div className="spacer" />
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            mean {loa.meanPeriodGrade ?? '—'}
          </span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Descriptor</th>
                <th scope="col">Range</th>
                <th scope="col" className="num">Learners</th>
                <th scope="col" className="num">% of class</th>
              </tr>
            </thead>
            <tbody>
              {loa.gradeBands.map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.label}</th>
                  <td className="mono">{b.range}</td>
                  <td className="num mono">{b.count}</td>
                  <td className="num mono">{b.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-foot">
          <span className="menu-note" style={{ margin: 0, border: 0, padding: 0 }}>
            Descriptor bands come from this class's grading scheme, so a school that configures
            them differently sees its own bands here.
          </span>
        </div>
      </div>
    </>
  );
}
