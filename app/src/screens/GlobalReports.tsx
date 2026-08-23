import type {
  AcademicYear, ClassSummary, GradebookData,
} from '../data/types';
import type { CohortSection } from '../lib/loa';
import { Async, useAsync } from '../components/Async';
import { ReportPicker } from './ReportPicker';
import { RecordBookAnalytics, RecordBookLoa } from './RecordBook';

/* ==================================================================== *
 * GLOBAL ANALYTICS AND GLOBAL LOA
 *
 * Reachable without opening a class first — which is the ONLY thing they
 * add. Both render the exact component the class workspace renders, so
 * there is no global calculation to drift from the contextual one. If
 * these numbers ever disagreed with the tab's, it would be because the
 * same function was handed different data, not because two functions
 * exist.
 *
 * The class-workspace tabs are untouched. A teacher already inside a
 * class should not have to come out here to see its analytics.
 * ==================================================================== */

interface Props {
  years: AcademicYear[];
  loadClasses: (yearId: string) => Promise<ClassSummary[]>;
  loadGradebook: (classId: string, periodId: string) => Promise<GradebookData>;
  onOpenClass: (classId: string, periodId: string) => void;
}

export function GlobalAnalytics({ years, loadClasses, loadGradebook, onOpenClass }: Props) {
  return (
    <ReportPicker
      title="Analytics"
      blurb={
        'Class performance for any class and any grading period. The same '
        + 'figures the Analytics tab shows inside a class — this is just a '
        + 'shorter way in.'
      }
      years={years}
      loadClasses={loadClasses}
    >
      {({ cls, period }) => (
        <AnalyticsFor
          cls={cls} periodId={period.id} period={period}
          loadGradebook={loadGradebook}
          onGoGradebook={() => onOpenClass(cls.id, period.id)}
        />
      )}
    </ReportPicker>
  );
}

function AnalyticsFor({ cls, periodId, period, loadGradebook, onGoGradebook }: {
  cls: ClassSummary;
  periodId: string;
  period: AcademicYear['periods'][number];
  loadGradebook: (classId: string, periodId: string) => Promise<GradebookData>;
  onGoGradebook: () => void;
}) {
  const [state, retry] = useAsync(
    () => loadGradebook(cls.id, periodId), [loadGradebook, cls.id, periodId],
  );
  return (
    <Async state={state} retry={retry} rows={6}>
      {/* The workspace tab's component, unchanged. */}
      {(data) => (
        <RecordBookAnalytics
          cls={cls} period={period} data={data} onGoGradebook={onGoGradebook}
        />
      )}
    </Async>
  );
}

interface LoaProps extends Props {
  loadCohort: (
    academicYearId: string, classId: string, periodId: string,
  ) => Promise<CohortSection[]>;
}

export function GlobalLoaReports({
  years, loadClasses, loadCohort, onOpenClass,
}: Omit<LoaProps, 'loadGradebook'>) {
  return (
    <ReportPicker
      title="LOA Reports"
      blurb={
        'Learning Outcomes Assessment. Pick any class and grading period; the '
        + 'report covers every section of that subject you teach, as the filed '
        + 'sheet does.'
      }
      years={years}
      loadClasses={loadClasses}
    >
      {({ cls, period, year }) => (
        <LoaFor
          cls={cls} period={period} year={year} loadCohort={loadCohort}
          onGoGradebook={() => onOpenClass(cls.id, period.id)}
        />
      )}
    </ReportPicker>
  );
}

function LoaFor({ cls, period, year, loadCohort, onGoGradebook }: {
  cls: ClassSummary;
  period: AcademicYear['periods'][number];
  year: AcademicYear;
  loadCohort: (y: string, c: string, p: string) => Promise<CohortSection[]>;
  onGoGradebook: () => void;
}) {
  const [state, retry] = useAsync(
    () => loadCohort(year.id, cls.id, period.id),
    [loadCohort, year.id, cls.id, period.id],
  );
  return (
    <Async state={state} retry={retry} rows={6}>
      {(cohort) => (
        <RecordBookLoa
          cls={cls} period={period} yearLabel={year.label} cohort={cohort}
          onGoGradebook={onGoGradebook}
        />
      )}
    </Async>
  );
}
