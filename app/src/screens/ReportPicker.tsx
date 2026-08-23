import { useEffect, useMemo, useState } from 'react';
import type { AcademicPeriod, AcademicYear, ClassSummary } from '../data/types';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  title: string;
  blurb: string;
  years: AcademicYear[];
  loadClasses: (yearId: string) => Promise<ClassSummary[]>;
  /** Rendered once a year, period and class have been chosen. */
  children: (chosen: {
    cls: ClassSummary; period: AcademicPeriod; year: AcademicYear;
  }) => React.ReactNode;
}

/**
 * Year → Term → Class, then hand over.
 *
 * Analytics and LOA already exist inside the class workspace, where the
 * class is implied by where you are. Reaching them the other way round —
 * "show me Term 2 for Grade 10 Pearl" without opening a class first — is
 * the only thing the global entry points add.
 *
 * So this is a PICKER, not a second implementation. It resolves a class
 * and a period and then renders the very same component the workspace
 * tab renders. There is no global Analytics calculation and no global
 * LOA calculation, because there is no second calculation at all.
 *
 * The period list comes from the chosen year's configuration. Nothing
 * here knows how many periods a year has or what they are called: a
 * three-term year offers three, a four-quarter year offers four, and
 * neither is written down in this file.
 */
export function ReportPicker({ title, blurb, years, loadClasses, children }: Props) {
  const [yearId, setYearId] = useState(years[0]?.id ?? '');
  const year = years.find((y) => y.id === yearId) ?? years[0];

  const [periodId, setPeriodId] = useState('');
  const [classId, setClassId] = useState('');

  const [classesState, retryClasses] = useAsync(
    () => (year ? loadClasses(year.id) : Promise.resolve([])),
    [loadClasses, year?.id],
  );
  const classes = classesState.status === 'ready' ? classesState.data : [];

  // Default to the first period of the chosen year, and clear a class
  // that does not belong to it. Switching year must never leave a
  // period or class from the previous one selected — the report would
  // render for a combination the user never picked.
  useEffect(() => {
    if (!year) return;
    if (!year.periods.some((p) => p.id === periodId)) {
      setPeriodId(year.periods[0]?.id ?? '');
    }
  }, [year, periodId]);

  useEffect(() => {
    if (classId && !classes.some((c) => c.id === classId)) setClassId('');
  }, [classes, classId]);

  const period = year?.periods.find((p) => p.id === periodId);
  const cls = classes.find((c) => c.id === classId);

  /**
   * One flat list, each option naming its section AND its subject.
   *
   * Grouping by section reads better when the list is open, but a native
   * select shows only the chosen OPTION when closed — and a teacher with
   * "Mathematics 10" in two sections then cannot tell which one they
   * picked. The ambiguity is not hypothetical: it made two of these
   * reports disagree during testing, and the reports were right.
   */
  const options = useMemo(
    () => classes
      .map((c) => ({ id: c.id, label: `${c.gradeLevel} – ${c.section} · ${c.subject}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [classes],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">{title}</h1>
          <p className="page-sub">{blurb}</p>
        </div>
      </div>

      <div className="panel">
        <div className="gb-toolbar">
          <label className="picker">
            <span className="field-label">School year</span>
            <select
              className="input" value={year?.id ?? ''}
              onChange={(e) => setYearId(e.target.value)}
            >
              {years.map((y) => <option key={y.id} value={y.id}>SY {y.label}</option>)}
            </select>
          </label>

          <label className="picker">
            <span className="field-label">Grading period</span>
            <select
              className="input" value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {(year?.periods ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="picker">
            <span className="field-label">Class</span>
            <select
              className="input" value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Choose a class…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <Async state={classesState} retry={retryClasses} rows={2}>
          {() => (classes.length === 0 ? (
            <EmptyState title="No classes for this school year">
              You do not teach anything in SY {year?.label}, or nothing has been
              set up yet.
            </EmptyState>
          ) : !cls || !period ? (
            <EmptyState title="Choose a class">
              Pick a class above to see {title.toLowerCase()} for {period?.name ?? 'the period'}.
            </EmptyState>
          ) : null)}
        </Async>
      </div>

      {cls && period && year && children({ cls, period, year })}
    </div>
  );
}
