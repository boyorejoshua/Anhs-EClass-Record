import { Fragment, useMemo, useState } from 'react';
import type {
  AcademicPeriod, ClassSummary, GradebookData, PersistedGrade,
} from '../data/types';
import { analytics, reconcileRecorded, summaryRows, type SummaryRow } from '../lib/recordbook';
import { loaReport, type CohortSection, type LoaTable } from '../lib/loa';
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
                  <th scope="col" colSpan={2} key={c.componentId} className="num">
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
        <div className="stat"><b>{a.average ?? '—'}</b><span>Class average</span></div>
        <div className="stat"><b>{a.highest ?? '—'}</b><span>Highest</span></div>
        <div className="stat"><b>{a.lowest ?? '—'}</b><span>Lowest</span></div>
        {/*
          Graded OVER class size, not two separate tiles. The legacy
          shows "15/30" because the question a teacher asks first is
          "how much of this is even marked yet" — and an average over
          half a class means something different from an average over
          all of it.
        */}
        <div className="stat">
          <b data-warn={a.ungraded > 0}>{a.graded}/{a.classSize}</b><span>Graded</span>
        </div>
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
                {/*
                  Missing is its own row, below the bands and visually
                  apart from them. A learner with no grade is not a low
                  score, and folding them into "Below 75" would report a
                  teacher's unfinished marking as failing children.
                */}
                {a.ungraded > 0 && (
                  <div className="dist-row dist-missing">
                    <span className="dist-label mono">Missing</span>
                    <div className="dist-track">
                      <span
                        style={{ width: `${(a.ungraded / peak) * 100}%` }}
                        data-missing="true"
                        title={a.ungradedNames.join(', ')}
                      />
                    </div>
                    <span className="dist-count mono">{a.ungraded}</span>
                  </div>
                )}
                {a.ungraded > 0 && (
                  <p className="menu-note">
                    {a.ungraded} learner{a.ungraded === 1 ? ' is' : 's are'} not counted in the
                    bands above — no score has been entered for them in {period.name}.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Pass / Fail</h2></div>
          <div className="panel-body">
            {a.graded === 0 ? (
              <EmptyState title="Nothing graded yet">
                A pass rate needs at least one computable grade.
              </EmptyState>
            ) : (
              <>
                <div className="rate">
                  <div className="rate-row">
                    <span className="rate-label" data-tone="ok">
                      Passing (≥{data.scheme.passMark})
                    </span>
                    <span className="mono rate-n">{a.passing}/{a.graded}</span>
                  </div>
                  <div className="rate-track">
                    <span style={{ width: `${a.passRate ?? 0}%` }} data-tone="ok" />
                  </div>
                  <span className="rate-pct mono">{a.passRate}%</span>

                  <div className="rate-row">
                    <span className="rate-label" data-tone="bad">
                      Below {data.scheme.passMark}
                    </span>
                    <span className="mono rate-n">{a.failing}/{a.graded}</span>
                  </div>
                  <div className="rate-track">
                    <span style={{ width: `${100 - (a.passRate ?? 0)}%` }} data-tone="bad" />
                  </div>
                  <span className="rate-pct mono">{100 - (a.passRate ?? 0)}%</span>
                </div>

                <div className="stat-row" style={{ marginTop: 14 }}>
                  <div className="stat"><b>{a.topPerformers}</b><span>Top (90+)</span></div>
                  <div className="stat">
                    <b data-warn={a.ungraded > 0}>{a.ungraded}</b><span>Missing</span>
                  </div>
                </div>

                <p className="menu-note">
                  Both rates are shares of the {a.graded} learner{a.graded === 1 ? '' : 's'}
                  {' '}with a grade, not of the whole class — otherwise unfinished marking
                  would read as a collapsing pass rate.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/*
        Students per Performance Band — the legacy's most-used panel, and
        the one the bar chart cannot replace. A bar says seven learners
        are in 86–90; this says WHICH seven, and by how much, which is
        what a teacher acts on.
      */}
      <div className="panel">
        <div className="panel-head">
          <h2>Students per performance band</h2>
          <div className="spacer" />
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {a.graded} graded
          </span>
        </div>
        <div className="panel-body">
          <div className="band-grid">
            {a.distribution.map((b) => (
              <div className="band" key={b.label} data-low={b.max < data.scheme.passMark}>
                <div className="band-head">
                  <span className="band-label mono">{b.label}</span>
                  <span className="band-count">
                    {b.count} student{b.count === 1 ? '' : 's'}
                  </span>
                </div>
                {b.members.length === 0 ? (
                  <p className="faint band-empty">No students in this range</p>
                ) : (
                  <ul className="band-list">
                    {b.members.map((m) => (
                      <li key={m.name}>
                        <span>{m.name}</span>
                        <b className="mono">{m.grade}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {a.ungradedNames.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h2>Students with missing grades</h2>
            <div className="spacer" />
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {a.ungradedNames.length} student{a.ungradedNames.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="panel-body">
            <ul className="name-chips">
              {a.ungradedNames.map((n) => <li key={n}>{n}</li>)}
            </ul>
            <p className="menu-note">
              Nothing has been scored for these learners in {period.name}, so no grade can be
              computed. They are excluded from the average and the pass rate rather than
              counted as zero.
            </p>
          </div>
        </div>
      )}

      <div className="two-col">
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
              figure the LOA report bands.
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
 * LOA — LEARNING OUTCOMES ASSESSMENT
 *
 * Laid out to CLASSRECORD_Template.xlsx, sheet "LOA Summary Reports":
 * one table per component plus the period-grade table, each with one row
 * PER SECTION and a Total row beneath.
 * ================================================================== */

interface LoaProps {
  cls: ClassSummary;
  period: AcademicPeriod;
  yearLabel: string;
  cohort: CohortSection[];
  onGoGradebook: () => void;
}

function LoaTableView({ table }: { table: LoaTable }) {
  const stats = table.scale === 'proficiency';
  return (
    <div className="loa-table">
      <h3 className="loa-title">{table.title}</h3>
      <div className="tbl-wrap">
        <table className="tbl loa">
          <thead>
            <tr>
              <th scope="col" rowSpan={3}>Sections</th>
              <th scope="col" rowSpan={3} className="num">Number of Learners</th>
              {stats && (
                <>
                  <th scope="col" rowSpan={3} className="num">{table.measureLabel}</th>
                  <th scope="col" rowSpan={3} className="num" title="Highest Score Obtained">HSO</th>
                  <th scope="col" rowSpan={3} className="num" title="Lowest Score Obtained">LSO</th>
                  <th scope="col" rowSpan={3} className="num">Mean</th>
                  <th scope="col" rowSpan={3} className="num" title="Mean Percentage Score">MPS</th>
                </>
              )}
              {/* Outstanding spans three ranges in the workbook and keeps
                  one heading; group by label so it does here too. */}
              {table.bands.reduce<Array<{ label: string; span: number }>>((groups, b) => {
                const last = groups[groups.length - 1];
                if (last && last.label === b.label) last.span += 1;
                else groups.push({ label: b.label, span: 1 });
                return groups;
              }, []).map((g) => (
                <th scope="col" key={g.label} colSpan={g.span * 2} className="num">{g.label}</th>
              ))}
              <th scope="col" rowSpan={3} className="num" title="Banded learners as a percentage — should read 100">
                Total
              </th>
            </tr>
            <tr>
              {table.bands.map((b) => (
                <th scope="col" key={b.key} colSpan={2} className="num sub-th">{b.range}</th>
              ))}
            </tr>
            <tr>
              {table.bands.map((b) => (
                <Fragment key={b.key}>
                  <th scope="col" className="num sub-th">No.</th>
                  <th scope="col" className="num sub-th">%</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...table.rows, table.totals].map((r, i) => (
              <tr key={r.classId || 'total'} data-total={i === table.rows.length || undefined}>
                <th scope="row">{r.label}</th>
                <td className="num mono">{r.learners}</td>
                {stats && (
                  <>
                    <td className="num mono">{r.highestPossible ?? <span className="faint">—</span>}</td>
                    <td className="num mono">{r.hso ?? <span className="faint">—</span>}</td>
                    <td className="num mono">{r.lso ?? <span className="faint">—</span>}</td>
                    <td className="num mono">{r.mean ?? <span className="faint">—</span>}</td>
                    <td className="num mono">{r.mps ?? <span className="faint">—</span>}</td>
                  </>
                )}
                {r.counts.map((c) => (
                  <Fragment key={c.band.key}>
                    {/*
                      Not `faint`. This is a learner count and the share
                      of the section it represents — the substance of the
                      whole report — and it was being rendered in a grey
                      that measured 2.37:1 against the row behind it. A
                      teacher who cannot read a number has not been shown
                      it. Zeros dim; everything else reads.
                    */}
                    <td className="num mono" data-zero={c.count === 0 || undefined}>
                      {c.count}
                    </td>
                    <td className="num mono pct" data-zero={c.count === 0 || undefined}>
                      {c.percent}
                    </td>
                  </Fragment>
                ))}
                <td className="num mono" data-warn={r.total !== 100 && r.learners > 0 ? 'true' : undefined}>
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RecordBookLoa({ cls, period, yearLabel, cohort, onGoGradebook }: LoaProps) {
  const report = useMemo(() => loaReport(cohort, period.name), [cohort, period.name]);

  const configured = cohort.some((s) => s.data.assessments.length > 0);
  if (!configured) {
    return (
      <div className="panel">
        <EmptyState
          title="No achievement data yet"
          action={<button className="btn btn-sm btn-primary" onClick={onGoGradebook}>Open Setup</button>}
        >
          The Learning Outcomes Assessment report is computed from grade entries.
          {' '}{period.name} has no assessments configured yet.
        </EmptyState>
      </div>
    );
  }

  function exportCsv() {
    const out: unknown[][] = [
      [`LEARNING OUTCOMES ASSESSMENT (LOA) SUMMARY REPORTS`],
      [`${cls.subject} · ${cls.gradeLevel}`, `SY ${yearLabel}`, period.name],
      [`${report.sections} section(s)`, `${report.learners} learners`],
      [],
    ];
    for (const t of report.tables) {
      const stats = t.scale === 'proficiency';
      out.push([t.title]);
      out.push([
        'Sections', 'Number of Learners',
        ...(stats ? [t.measureLabel ?? 'HPS', 'HSO', 'LSO', 'Mean', 'MPS'] : []),
        ...t.bands.flatMap((b) => [`${b.label} ${b.range} No.`, `${b.label} ${b.range} %`]),
        'Total (to check entries)',
      ]);
      for (const r of [...t.rows, t.totals]) {
        out.push([
          r.label, r.learners,
          ...(stats ? [r.highestPossible ?? '', r.hso ?? '', r.lso ?? '', r.mean ?? '', r.mps ?? ''] : []),
          ...r.counts.flatMap((c) => [c.count, c.percent]),
          r.total,
        ]);
      }
      out.push([]);
    }
    out.push(['KINDLY CHECK THE NUMBER OF LEARNERS PER SECTION, IF THEY TALLY.']);
    downloadCsv(
      `${slug(cls.gradeLevel, cls.subjectCode, period.shortName, 'loa')}.csv`,
      toCsv(out),
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Learning Outcomes Assessment</h2>
          <p className="page-sub">
            {cls.subject} · {cls.gradeLevel} · {period.name} · SY {yearLabel} ·{' '}
            {report.sections} section{report.sections === 1 ? '' : 's'} · {report.learners} learners
          </p>
        </div>
        <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>

      {/*
        Say where the numbers come from. This report is filed with the
        department, so a teacher needs to know whether it covers the one
        section in front of them or all of theirs — and that the figures
        are live, not the submitted ones.
      */}
      <p className="callout" data-inline="true" data-tone="info">
        <b>Covers every section of {cls.subject} {cls.gradeLevel} you teach.</b>{' '}
        {report.sections === 1
          ? 'You carry one section of this subject, so the report has one row.'
          : `${report.sections} sections, listed in order.`}
        {' '}Computed from the scores currently entered — a learner with no
        score at all is left out of the bands, which is what the Total
        column is there to reveal.
      </p>

      {report.tables.map((t) => <LoaTableView key={t.key} table={t} />)}

      <p className="loa-foot">
        Kindly check the number of learners per section, if they tally.
        If a Total column does not read 100, a learner has no score in
        that component.
      </p>
    </div>
  );
}
