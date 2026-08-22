import { useCallback, useMemo, useState } from 'react';
import type { AcademicPeriod, ClassSummary, GradebookData } from '../data/types';
import type { AssessmentDraft } from '../data/source';
import { flattenComponents } from '../lib/grading';
import { isEditable } from '../lib/status';
import type { SubmissionStatus } from '../data/types';

interface Props {
  cls: ClassSummary;
  period: AcademicPeriod;
  yearLabel: string;
  data: GradebookData;
  status: SubmissionStatus;
  save: (items: AssessmentDraft[]) => Promise<{ written: number; removed: number }>;
  onSaved: () => void;
}

interface Draft extends AssessmentDraft {
  key: string;
  /** True when this row already exists in the database with scores against it. */
  hasScores: boolean;
}

/**
 * Record Book — Setup.
 *
 * The legacy equivalent (`renderSetup` / `doSaveSetup`) writes
 * `cd.hps[q] = { ww: [...10], pt: [...10], qa: number }`. This screen
 * carries over the business rule — *the teacher decides how many items
 * each component has and what each is out of* — and drops the shape:
 *
 *   • no ten-item cap; add as many as the subject needs
 *   • no fixed ww/pt/qa; components come from the grading scheme, so a
 *     MAPEH class shows 20/60/20 and a core class 20/50/30 without the
 *     screen knowing either number
 *   • the Exams component's ST1 / ST2 / Term Exam children each get
 *     their own row, which the legacy scalar `qa` could not express
 *
 * The header fields the legacy Setup collected — school, teacher,
 * subject, section, school year — are NOT editable here. They are
 * relationships in the new schema, not free text on a record book, and
 * letting a teacher retype the school year onto one class is how the
 * legacy file ended up with three spellings of the same section.
 */
export function RecordBookSetup({ cls, period, yearLabel, data, status, save, onSaved }: Props) {
  const editable = isEditable(status);

  const leaves = useMemo(() => flattenComponents(data.scheme.components), [data.scheme]);

  const scoredAssessmentIds = useMemo(() => {
    const s = new Set<string>();
    for (const row of Object.values(data.scores)) {
      for (const [assessmentId, cell] of Object.entries(row)) {
        if (cell.raw != null || cell.isExcused) s.add(assessmentId);
      }
    }
    return s;
  }, [data.scores]);

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    data.assessments
      .slice()
      .sort((a, b) => a.componentId.localeCompare(b.componentId) || a.ordinal - b.ordinal)
      .map((a) => ({
        key: a.id,
        id: a.id,
        componentId: a.componentId,
        ordinal: a.ordinal,
        title: a.title,
        highestPossibleScore: a.highestPossibleScore,
        hasScores: scoredAssessmentIds.has(a.id),
      })),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const byComponent = useCallback(
    (componentId: string) => drafts.filter((d) => d.componentId === componentId)
      .sort((a, b) => a.ordinal - b.ordinal),
    [drafts],
  );

  const addItem = useCallback((componentId: string) => {
    setDrafts((prev) => {
      const next = Math.max(0, ...prev.filter((d) => d.componentId === componentId).map((d) => d.ordinal)) + 1;
      return [...prev, {
        key: `new-${componentId}-${next}-${Date.now()}`,
        componentId,
        ordinal: next,
        title: null,
        highestPossibleScore: 10,
        hasScores: false,
      }];
    });
    setSaved(false);
  }, []);

  const patch = useCallback((key: string, change: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));
    setSaved(false);
  }, []);

  const remove = useCallback((key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setSaved(false);
  }, []);

  // Validation runs on the draft, before anything is sent. The database
  // enforces highest_possible_score > 0 too; catching it here means the
  // teacher sees which row is wrong rather than a constraint name.
  const problems = useMemo(() => {
    const out: string[] = [];
    for (const d of drafts) {
      const label = `${leaves.find((l) => l.id === d.componentId)?.code ?? '?'}${d.ordinal}`;
      if (!(d.highestPossibleScore > 0)) {
        out.push(`${label}: the highest possible score must be greater than zero.`);
      }
      if (d.highestPossibleScore > 1000) {
        out.push(`${label}: ${d.highestPossibleScore} looks wrong for a single assessment.`);
      }
    }
    if (drafts.length === 0) out.push('Add at least one assessment before saving.');
    return out;
  }, [drafts, leaves]);

  const removedWithScores = useMemo(
    () => data.assessments
      .filter((a) => scoredAssessmentIds.has(a.id) && !drafts.some((d) => d.id === a.id))
      .map((a) => a.title ?? a.id),
    [data.assessments, drafts, scoredAssessmentIds],
  );

  const totals = useMemo(() =>
    leaves.map((l) => ({
      code: l.code,
      name: l.name,
      items: drafts.filter((d) => d.componentId === l.id).length,
      points: drafts.filter((d) => d.componentId === l.id)
        .reduce((n, d) => n + (Number(d.highestPossibleScore) || 0), 0),
    })), [leaves, drafts]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await save(drafts.map(({ key: _key, hasScores: _h, ...rest }) => rest));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the setup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head"><h2>Record book</h2></div>
        <div className="panel-body">
          <dl className="facts">
            <div><dt>Class</dt><dd>{cls.gradeLevel} – {cls.section}</dd></div>
            <div><dt>Subject</dt><dd>{cls.subject} <span className="faint mono">{cls.subjectCode}</span></dd></div>
            <div><dt>School year</dt><dd>{yearLabel}</dd></div>
            <div><dt>Grading period</dt><dd>{period.name} <span className="faint">({period.startDate} – {period.endDate})</span></dd></div>
            <div><dt>Learners</dt><dd>{cls.studentCount}</dd></div>
            <div><dt>Grading scheme</dt><dd>{data.scheme.name}</dd></div>
            <div><dt>Pass mark</dt><dd className="mono">{data.scheme.passMark}</dd></div>
            <div>
              <dt>Transmutation</dt>
              <dd>
                {data.scheme.transmutation
                  ? `${data.scheme.transmutation.length}-band table`
                  : 'None — zero-based grading'}
              </dd>
            </div>
          </dl>
          <p className="menu-note">
            These come from the school's configuration, not from this record book. A change to
            the scheme, the calendar or the teaching load is made once by an administrator and
            applies everywhere — which is what stops the same section existing under three
            spellings.
          </p>
        </div>
      </div>

      {!editable && (
        <div className="panel">
          <div className="sub-locked" style={{ margin: 16 }}>
            <b>Locked</b>
            <span>
              {period.name} has been submitted, so its assessments can no longer be changed.
              Reshaping a record book after submission would silently change grades the
              registrar has already reviewed. Ask for it to be returned if a correction is
              needed.
            </span>
          </div>
        </div>
      )}

      {leaves.map((leaf) => {
        const items = byComponent(leaf.id);
        return (
          <div className="panel" key={leaf.id}>
            <div className="panel-head">
              <h2>{leaf.name} <span className="faint">{leaf.weight}%</span></h2>
              <div className="spacer" />
              <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {items.length} item{items.length === 1 ? '' : 's'} ·{' '}
                {items.reduce((n, d) => n + (Number(d.highestPossibleScore) || 0), 0)} points
              </span>
              {editable && (
                <button className="btn btn-sm" onClick={() => addItem(leaf.id)}>Add item</button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="empty" style={{ padding: '20px 24px' }}>
                <strong>No {leaf.name.toLowerCase()} yet</strong>
                {editable
                  ? 'Add the items you plan to give this period. You can add more later.'
                  : 'Nothing was configured for this component.'}
              </div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 70 }}>Item</th>
                      <th scope="col">Title</th>
                      <th scope="col" className="num" style={{ width: 140 }}>Highest score</th>
                      {editable && <th scope="col" style={{ width: 90 }}><span className="sr-only">Remove</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => (
                      <tr key={d.key}>
                        <th scope="row" className="mono">{leaf.code}{d.ordinal}</th>
                        <td>
                          <label className="sr-only" htmlFor={`t-${d.key}`}>Title for {leaf.code}{d.ordinal}</label>
                          <input
                            id={`t-${d.key}`}
                            className="input"
                            style={{ width: '100%' }}
                            readOnly={!editable}
                            placeholder={`${leaf.name} ${d.ordinal}`}
                            value={d.title ?? ''}
                            onChange={(e) => patch(d.key, { title: e.target.value || null })}
                          />
                        </td>
                        <td className="num">
                          <label className="sr-only" htmlFor={`h-${d.key}`}>Highest score for {leaf.code}{d.ordinal}</label>
                          <input
                            id={`h-${d.key}`}
                            className="input mono"
                            style={{ width: 100, textAlign: 'right' }}
                            type="text"
                            inputMode="decimal"
                            readOnly={!editable}
                            aria-invalid={!(d.highestPossibleScore > 0)}
                            value={d.highestPossibleScore}
                            onChange={(e) => {
                              const t = e.target.value.trim();
                              if (t !== '' && !/^\d*\.?\d*$/.test(t)) return;
                              patch(d.key, { highestPossibleScore: t === '' ? 0 : Number(t) });
                            }}
                          />
                        </td>
                        {editable && (
                          <td>
                            <button
                              className="btn btn-sm"
                              disabled={d.hasScores}
                              title={d.hasScores
                                ? 'This item already has marks against it. Clear them in the gradebook first.'
                                : 'Remove this item'}
                              onClick={() => remove(d.key)}
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {editable && (
        <div className="panel">
          <div className="panel-body">
            <div className="setup-totals">
              {totals.map((t) => (
                <span key={t.code} className="mono">
                  {t.code}: {t.items} item{t.items === 1 ? '' : 's'} / {t.points} pts
                </span>
              ))}
            </div>

            {problems.length > 0 && (
              <div className="sub-block" data-kind="error" style={{ marginTop: 12 }}>
                <b>Fix these before saving</b>
                <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}

            {removedWithScores.length > 0 && (
              <div className="sub-block" data-kind="warn" style={{ marginTop: 12 }}>
                <b>These items have marks and cannot be removed</b>
                <ul>{removedWithScores.map((t) => <li key={t}>{t}</li>)}</ul>
                <span className="sub-block-note">
                  Clear their scores in the gradebook first. Deleting an assessment deletes its
                  marks, and that cannot be undone.
                </span>
              </div>
            )}

            {error && (
              <div className="err-banner" role="alert" style={{ marginTop: 12 }}>
                <span>{error}</span>
                <button className="btn btn-sm" onClick={() => setError(null)}>Dismiss</button>
              </div>
            )}

            <div className="sub-confirm-actions" style={{ marginTop: 14 }}>
              <button
                className="btn btn-primary"
                disabled={busy || problems.length > 0 || removedWithScores.length > 0}
                onClick={() => void submit()}
              >
                {busy ? 'Saving…' : 'Save setup'}
              </button>
              {saved && <span className="save-ok" role="status">✓ Saved</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
