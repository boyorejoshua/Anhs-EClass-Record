import { useEffect, useMemo, useState } from 'react';
import type { AcademicPeriod, ClassSummary, GradebookData } from '../data/types';
import type { SummaryRow } from '../lib/recordbook';
import { summaryRows } from '../lib/recordbook';
import { flattenComponents } from '../lib/grading';

interface Props {
  cls: ClassSummary;
  period: AcademicPeriod;
  yearLabel: string;
  data: GradebookData;
  row: SummaryRow;
  onBack: () => void;
  onGoGradebook: () => void;
  /** Every period in the year, for the across-the-year strip. */
  periods?: AcademicPeriod[];
  /** Switches period without leaving the learner. */
  onSelectPeriod?: (periodId: string) => void;
  /** Switches learner without leaving the period. */
  onSelectStudent?: (row: SummaryRow) => void;
  /** Reads another period's gradebook for the across-the-year strip. */
  loadGradebook?: (classId: string, periodId: string) => Promise<GradebookData>;
}

/**
 * This learner's grade in every period of the year.
 *
 * The legacy screen's Q1/Q2/Q3/Q4/FINAL strip. It needs a read per
 * period, which is why it is its own hook rather than something the
 * parent pre-loads: a teacher who never opens a learner's detail should
 * not pay four gradebook reads on every visit to Summary.
 *
 * The CURRENT period is taken from the gradebook already on screen
 * rather than re-fetched, so the number in the strip and the number in
 * the breakdown below it cannot disagree.
 */
function useYearGrades(
  cls: ClassSummary,
  periods: AcademicPeriod[],
  current: AcademicPeriod,
  currentData: GradebookData,
  classEnrollmentId: string,
  loadGradebook?: (classId: string, periodId: string) => Promise<GradebookData>,
) {
  const currentGrade = useMemo(() => {
    const r = summaryRows(currentData).find((x) => x.classEnrollmentId === classEnrollmentId);
    return r?.periodGrade ?? null;
  }, [currentData, classEnrollmentId]);

  const [grades, setGrades] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!loadGradebook) return;
    let live = true;
    setLoading(true);
    const others = periods.filter((p) => p.id !== current.id);
    Promise.all(others.map(async (p) => {
      try {
        const g = await loadGradebook(cls.id, p.id);
        const r = summaryRows(g).find((x) => x.classEnrollmentId === classEnrollmentId);
        return [p.id, r?.periodGrade ?? null] as const;
      } catch {
        // A period the caller may not read (archived, or not yet
        // opened) is a BLANK, not an error — the strip is context, and
        // failing the whole detail screen over it would be absurd.
        return [p.id, null] as const;
      }
    })).then((pairs) => {
      if (!live) return;
      setGrades(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => { live = false; };
  }, [cls.id, periods, current.id, classEnrollmentId, loadGradebook]);

  const all = useMemo(() => {
    const merged: Record<string, number | null> = { ...grades, [current.id]: currentGrade };
    return periods.map((p) => ({ period: p, grade: merged[p.id] ?? null }));
  }, [grades, currentGrade, periods, current.id]);

  const recorded = all.filter((x) => x.grade != null);
  // A5 in the assumptions register: the final grade is the simple mean
  // of the period grades, and that is NOT yet confirmed with the
  // school. It is also only meaningful once every period is in, so the
  // strip labels how many are counted rather than presenting a partial
  // mean as if it were final.
  const final = recorded.length > 0
    ? Math.round(recorded.reduce((n, x) => n + (x.grade ?? 0), 0) / recorded.length)
    : null;

  return { all, final, recordedCount: recorded.length, loading };
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
export function StudentDetail({
  cls, period, yearLabel, data, row, onBack, onGoGradebook,
  periods, onSelectPeriod, onSelectStudent, loadGradebook,
}: Props) {
  const leaves = useMemo(() => flattenComponents(data.scheme.components), [data.scheme]);

  // Every learner in the class, so the picker can switch without going
  // back to Summary first — the legacy screen's student dropdown.
  const allRows = useMemo(() => summaryRows(data), [data]);

  const year = useYearGrades(
    cls, periods ?? [period], period, data, row.classEnrollmentId, loadGradebook,
  );

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
      {/*
        The legacy screen's picker bar. Its whole value is that checking
        a second learner does not mean going back to Summary and finding
        them in a table again — a teacher chasing missing marks moves
        through the class one name at a time.
      */}
      {(onSelectPeriod || onSelectStudent) && (
        <div className="panel detail-picker">
          <div className="gb-toolbar">
            {onSelectPeriod && periods && periods.length > 1 && (
              <label className="picker">
                <span className="field-label">Grading period</span>
                <select
                  className="input" value={period.id}
                  onChange={(e) => onSelectPeriod(e.target.value)}
                >
                  {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            {onSelectStudent && (
              <label className="picker">
                <span className="field-label">Learner</span>
                <select
                  className="input" value={row.classEnrollmentId}
                  onChange={(e) => {
                    const next = allRows.find((r) => r.classEnrollmentId === e.target.value);
                    if (next) onSelectStudent(next);
                  }}
                >
                  {allRows.map((r) => (
                    <option key={r.classEnrollmentId} value={r.classEnrollmentId}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="spacer" />
            <button className="btn btn-sm" onClick={onGoGradebook}>Go to row</button>
            <button className="btn btn-sm" onClick={() => window.print()}>Print / PDF</button>
          </div>
        </div>
      )}

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

        {/*
          Every period of the year, side by side. The legacy
          Q1/Q2/Q3/Q4/FINAL strip — and the reason a teacher opens this
          screen at all, since it is the only place the year reads as
          one story rather than as one term.
        */}
        {periods && periods.length > 1 && (
          <div className="panel-body">
            <div className="stat-row year-strip">
              {year.all.map(({ period: p, grade }) => (
                <button
                  key={p.id}
                  type="button"
                  className="stat stat-btn"
                  aria-current={p.id === period.id}
                  disabled={!onSelectPeriod}
                  onClick={() => onSelectPeriod?.(p.id)}
                >
                  <b>{grade ?? (year.loading ? '·' : '—')}</b>
                  <span>{p.shortName ?? p.name}</span>
                </button>
              ))}
              <div className="stat" data-final="true">
                <b>{year.final ?? '—'}</b>
                <span>
                  Final
                  {/*
                    Say what the number is made of. A mean over one term
                    out of three is not a final grade, and presenting it
                    as one is how a learner gets told the wrong thing.
                  */}
                  {year.recordedCount > 0 && year.recordedCount < year.all.length
                    && ` (${year.recordedCount} of ${year.all.length})`}
                </span>
              </div>
            </div>
            {year.recordedCount > 0 && year.recordedCount < year.all.length && (
              <p className="menu-note">
                Provisional — the mean of the {year.recordedCount} period
                {year.recordedCount === 1 ? '' : 's'} graded so far, not the final grade.
              </p>
            )}
          </div>
        )}

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
