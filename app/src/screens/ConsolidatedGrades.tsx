import { useEffect, useState } from 'react';
import type { AcademicYear, AdvisorySection, ConsolidatedGrades as ConsolidatedGradesData } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  years: AcademicYear[];
  loadSections: (yearId: string) => Promise<AdvisorySection[]>;
  loadGrades: (sectionId: string, periodId: string) => Promise<ConsolidatedGradesData>;
}

/**
 * The adviser's one-screen view of their whole section: every subject,
 * every learner, the grade each subject teacher has filed for the chosen
 * period — read straight from `period_grades`, the same row the subject
 * teacher's own Summary tab reads, never recomputed here. This is the
 * legacy Record Book's "class record at a glance" for the ONE role who
 * legitimately needs to see across subjects: the adviser, who signs for
 * the whole section, not just one class.
 *
 * A blank cell means that subject's teacher has not filed a grade for
 * this period yet — not zero, not an error. Distinguishing the two is
 * the entire point of a consolidated view: it is a checklist for "who
 * still owes me a grade," not a finished report card.
 */
export function ConsolidatedGrades({ years, loadSections, loadGrades }: Props) {
  // The ACTIVE year, not merely the first one. `years` is ordered by
  // start date, most recent first, so a school that prepares next
  // year's terms ahead of time — entirely normal — would otherwise open
  // this screen on a future year with no sections filed in it yet.
  const [yearId, setYearId] = useState(
    (years.find((y) => y.status === 'active') ?? years[0])?.id ?? '',
  );
  const year = years.find((y) => y.id === yearId) ?? years[0];

  const [periodId, setPeriodId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const [sectionsState, retrySections] = useAsync(
    () => (year ? loadSections(year.id) : Promise.resolve([])),
    [loadSections, year?.id],
  );
  const sections = sectionsState.status === 'ready' ? sectionsState.data : [];

  useEffect(() => {
    if (!year) return;
    if (!year.periods.some((p) => p.id === periodId)) {
      setPeriodId(year.periods[0]?.id ?? '');
    }
  }, [year, periodId]);

  useEffect(() => {
    if (!sectionId && sections.length > 0) setSectionId(sections[0]!.id);
    if (sectionId && !sections.some((s) => s.id === sectionId)) setSectionId(sections[0]?.id ?? '');
  }, [sections, sectionId]);

  const period = year?.periods.find((p) => p.id === periodId);
  const section = sections.find((s) => s.id === sectionId);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Consolidated Grades</h1>
          <p className="page-sub">
            Every subject in one of your advisory sections, side by side, for the
            grading period you choose.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="gb-toolbar">
          <label className="picker">
            <span className="field-label">School year</span>
            <select className="input" value={year?.id ?? ''} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  SY {y.label}{y.status !== 'active' ? ` (${y.status})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="picker">
            <span className="field-label">Grading period</span>
            <select className="input" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {(year?.periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="picker">
            <span className="field-label">Section</span>
            <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Choose a section…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.gradeLevel} – {s.name}</option>
              ))}
            </select>
          </label>
        </div>

        <Async state={sectionsState} retry={retrySections} rows={2}>
          {() => (sections.length === 0 ? (
            <EmptyState title="You are not the adviser of any section">
              Consolidated Grades shows every subject for a section you advise.
              Ask the registrar to set you as adviser under Classes &amp; Sections.
            </EmptyState>
          ) : !section || !period ? (
            <EmptyState title="Choose a section">
              Pick a section above to see its consolidated grades for {period?.name ?? 'the period'}.
            </EmptyState>
          ) : null)}
        </Async>
      </div>

      {section && period && (
        <ConsolidatedTable sectionId={section.id} periodId={period.id} loadGrades={loadGrades} />
      )}
    </div>
  );
}

function ConsolidatedTable({ sectionId, periodId, loadGrades }: {
  sectionId: string;
  periodId: string;
  loadGrades: Props['loadGrades'];
}) {
  const [state, retry] = useAsync(() => loadGrades(sectionId, periodId), [loadGrades, sectionId, periodId]);

  return (
    <div className="panel">
      <Async state={state} retry={retry} rows={8}>
        {(data) => (data.subjects.length === 0 ? (
          <EmptyState title="No active classes in this section">
            Nothing is set up to teach this section yet. Check Classes &amp; Sections.
          </EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  {data.subjects.map((sub) => <th key={sub.id} scope="col">{sub.title}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.studentId}>
                    <th scope="row">{row.displayName}</th>
                    {data.subjects.map((sub) => {
                      const cell = row.grades[sub.id];
                      const grade = cell?.grade ?? null;
                      return (
                        <td key={sub.id} className="num mono">
                          {grade == null ? (
                            <span className="faint" title="Not yet filed for this period">—</span>
                          ) : (
                            <span
                              className="gb-chip"
                              data-band={grade >= 90 ? 'high' : cell?.passed === false ? 'low' : 'mid'}
                              title={cell?.descriptor ?? undefined}
                            >
                              {grade}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Async>
    </div>
  );
}
