import { useMemo } from 'react';
import type { AcademicPeriod, ClassSummary, GradebookData } from '../data/types';
import type { SummaryRow } from '../lib/recordbook';
import { flattenComponents } from '../lib/grading';

interface Props {
  cls: ClassSummary;
  period: AcademicPeriod;
  yearLabel: string;
  data: GradebookData;
  row: SummaryRow;
  onBack: () => void;
  onGoGradebook: () => void;
}

/**
 * Student Detail — one learner's record for this class and period.
 *
 * The legacy equivalent (`renderStuDetail` / `pdfStudentDetail`) keys
 * everything off the learner's NAME, because that is its primary key:
 * `cd.grades[q][studentName]`. Two learners called Santos, Maria share
 * one record, and a corrected spelling orphans a term's marks.
 *
 * Here the identity is `classEnrollmentId` → `enrollment` → `student`,
 * so a rename is a display change and nothing else. No duplicate student
 * object is created for the period; the period is a dimension of the
 * grade, not of the person.
 */
export function StudentDetail({ cls, period, yearLabel, data, row, onBack, onGoGradebook }: Props) {
  const leaves = useMemo(() => flattenComponents(data.scheme.components), [data.scheme]);

  // Every assessment with this learner's mark against it, grouped by the
  // leaf component so an Exams tree shows ST1 / ST2 / TE separately.
  const breakdown = useMemo(() => {
    const cells = data.scores[row.classEnrollmentId] ?? {};
    return leaves.map((leaf) => {
      const items = data.assessments
        .filter((a) => a.componentId === leaf.id)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((a) => {
          const cell = cells[a.id];
          return {
            id: a.id,
            label: a.title ?? `${leaf.code}${a.ordinal}`,
            raw: cell?.raw ?? null,
            excused: cell?.isExcused ?? false,
            hps: a.highestPossibleScore,
            over: cell?.raw != null && cell.raw > a.highestPossibleScore,
          };
        });
      const counted = items.filter((i) => i.raw != null);
      return {
        leaf,
        items,
        totalRaw: counted.reduce((n, i) => n + (i.raw ?? 0), 0),
        totalPossible: items
          .filter((i) => !i.excused)
          .reduce((n, i) => n + i.hps, 0),
      };
    }).filter((g) => g.items.length > 0);
  }, [data, row.classEnrollmentId, leaves]);

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <button className="link-back" onClick={onBack}>← Summary</button>
            <h2>{row.displayName}</h2>
            <p className="page-sub">
              {cls.gradeLevel} – {cls.section} · {cls.subject} · {period.name} · SY {yearLabel}
            </p>
          </div>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={onGoGradebook}>Open in gradebook</button>
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
        </div>

        <div className="panel-body">
          <div className="stat-row">
            <div className="stat">
              <b>{row.initialGrade ?? '—'}</b><span>Initial grade</span>
            </div>
            <div className="stat">
              <b>{row.periodGrade ?? '—'}</b><span>{period.name} grade</span>
            </div>
            <div className="stat">
              <b style={{ fontSize: 15 }}>{row.descriptor ?? '—'}</b><span>Descriptor</span>
            </div>
            <div className="stat">
              <b data-warn={row.missingCount > 0}>{row.missingCount}</b><span>Missing scores</span>
            </div>
          </div>

          {row.periodGrade == null && (
            <p className="menu-note">
              No grade can be computed yet — nothing has been scored for this learner in{' '}
              {period.name}.
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Component breakdown</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col" className="num">Raw</th>
                <th scope="col" className="num">Possible</th>
                <th scope="col" className="num">PS %</th>
                <th scope="col" className="num">Weight</th>
                <th scope="col" className="num">Weighted</th>
              </tr>
            </thead>
            <tbody>
              {row.components.map((c) => (
                <tr key={c.componentId}>
                  <th scope="row">
                    {c.name}
                    <span className="tbl-sub">{c.scored} of {c.total} scored</span>
                  </th>
                  <td className="num mono">
                    {breakdown
                      .filter((g) => g.leaf.id === c.componentId
                        || data.scheme.components.find((x) => x.id === g.leaf.id)?.parentId === c.componentId)
                      .reduce((n, g) => n + g.totalRaw, 0) || <span className="faint">—</span>}
                  </td>
                  <td className="num mono">
                    {breakdown
                      .filter((g) => g.leaf.id === c.componentId
                        || data.scheme.components.find((x) => x.id === g.leaf.id)?.parentId === c.componentId)
                      .reduce((n, g) => n + g.totalPossible, 0) || <span className="faint">—</span>}
                  </td>
                  <td className="num mono">{c.percentageScore ?? <span className="faint">—</span>}</td>
                  <td className="num mono faint">{c.weight}%</td>
                  <td className="num mono">{c.weightedScore ?? <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Initial grade</th>
                <td colSpan={4} />
                <td className="num mono"><b>{row.initialGrade ?? '—'}</b></td>
              </tr>
              <tr>
                <th scope="row">
                  {period.name} grade
                  <span className="tbl-sub">
                    {data.scheme.transmutation ? 'after transmutation' : 'zero-based, no transmutation'}
                  </span>
                </th>
                <td colSpan={4} />
                <td className="num mono"><b>{row.periodGrade ?? '—'}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {breakdown.map((g) => (
        <div className="panel" key={g.leaf.id}>
          <div className="panel-head">
            <h2>{g.leaf.name} <span className="faint">{g.leaf.weight}%</span></h2>
            <div className="spacer" />
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {g.totalRaw} / {g.totalPossible}
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Assessment</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col" className="num">Out of</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">{i.label}</th>
                    <td className="num mono" data-warn={i.over}>
                      {i.excused ? 'EX' : i.raw ?? <span className="faint">—</span>}
                    </td>
                    <td className="num mono faint">{i.hps}</td>
                    <td>
                      {i.over ? <span className="pill">Over limit</span>
                        : i.excused ? <span className="pill">Excused</span>
                        : i.raw == null ? <span className="pill">Missing</span>
                        : <span className="pill" data-tone="ok">Recorded</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="panel">
        <div className="panel-body">
          <p className="menu-note" style={{ margin: 0 }}>
            Attendance and previous school years are on this learner's academic record, which the
            registrar opens from Students → Academic Records. A subject teacher sees this class
            and this period; the wider record is the registrar's to release.
          </p>
        </div>
      </div>
    </>
  );
}
