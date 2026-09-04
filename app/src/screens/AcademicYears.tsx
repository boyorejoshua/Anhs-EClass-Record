import type { AcademicYear } from '../data/types';

interface Props {
  years: AcademicYear[];
}

/**
 * Academic Years — a viewer, not an editor.
 *
 * This route showed "Reports & Documents"-style NotAvailable since
 * Phase 2, with a note explaining that creating a year decides the
 * shape of everything downstream and is seeded during onboarding rather
 * than edited live. That reasoning still holds — this screen adds no
 * create, close, or archive action.
 *
 * What changed: every fact this screen shows was ALREADY being fetched
 * by `session_context()` on every sign-in — the school's `academicYears`,
 * each with its `status` and its ordered `periods` — and simply thrown
 * away before it reached a screen. So "the minimum foundation for
 * viewing academic years, identifying the active one, identifying
 * historical ones, and understanding their terms" turned out to need no
 * new query at all, only a place to render what was already on hand.
 *
 * `years` is already ordered most-recent-first by the server.
 */
export function AcademicYears({ years }: Props) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Academic Years</h1>
          <p className="page-sub">
            Every school year on record, most recent first. Creating a year and its
            terms happens during onboarding, not here — it decides the shape of
            everything that follows, and a year already in use cannot safely be
            reshaped. An archived year stays exactly as filed: still visible, no
            longer open to new work.
          </p>
        </div>
      </div>

      {years.length === 0 ? (
        <div className="panel">
          <div className="panel-body">
            <p className="page-sub">No academic year is set up for this school yet.</p>
          </div>
        </div>
      ) : (
        years.map((y) => (
          <div className="panel" key={y.id}>
            <div className="panel-head">
              <div>
                <h2>SY {y.label}</h2>
                <p className="page-sub">
                  {PERIOD_STRUCTURE_LABEL[y.periodStructure] ?? y.periodStructure}
                  {' · '}{y.periods.length} {y.periods.length === 1 ? 'period' : 'periods'}
                </p>
              </div>
              <span className="pill" data-tone={STATUS_TONE[y.status]}>{STATUS_LABEL[y.status]}</span>
            </div>
            <div className="panel-body">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Period</th>
                      <th scope="col">Starts</th>
                      <th scope="col">Ends</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {y.periods.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{p.name}</th>
                        <td className="mono">{p.startDate}</td>
                        <td className="mono">{p.endDate}</td>
                        <td>
                          <span className="pill" data-tone={p.status === 'active' ? 'ok' : 'muted'}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const PERIOD_STRUCTURE_LABEL: Record<string, string> = {
  three_term: 'Three terms',
  quarter: 'Four quarters',
  semester: 'Semesters',
  custom: 'Custom structure',
};

const STATUS_LABEL: Record<AcademicYear['status'], string> = {
  planning: 'Planning',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
};

/** Matches the pill tone convention already used for period status elsewhere. */
const STATUS_TONE: Record<AcademicYear['status'], 'ok' | 'muted' | 'info'> = {
  planning: 'info',
  active: 'ok',
  closed: 'muted',
  archived: 'muted',
};
