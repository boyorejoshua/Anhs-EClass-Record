import { useMemo, useState } from 'react';
import type { ParsedWorkbook } from '../lib/import/three-term';
import {
  assessmentCount, buildPlan, canCommit, defaultChoices, markCount, summarise,
} from '../lib/import/plan';
import type {
  Choices, ImportOverrides, ImportResolution, PlanSummary,
} from '../lib/import/plan';
import type { ImportRecord, ImportResult } from '../data/source';
import { Async, EmptyState, useAsync } from '../components/Async';

interface Props {
  resolveImport: (workbook: unknown) => Promise<ImportResolution>;
  commitImport: (plan: ReturnType<typeof buildPlan>) => Promise<ImportResult>;
  getImportHistory: (limit?: number) => Promise<ImportRecord[]>;
  onOpenClass: (classId: string, periodId: string) => void;
}

/* ==================================================================== *
 * THE IMPORT CENTER
 *
 * Upload → read → resolve → review → confirm. Nothing is written until
 * the last step, and that is not a promise about this screen — the
 * function that reads a workbook cannot write, and the function that
 * writes accepts only the ids shown below. A modified client cannot
 * skip the review, because there is nothing to skip TO: the commit has
 * no matching of its own to fall back on.
 *
 * The preview is deliberately unglamorous. It is a list of what will
 * change, in the order a person checks it, and the one thing it must
 * never do is round a doubt into a decision.
 * ==================================================================== */

type Stage =
  | { at: 'idle' }
  | { at: 'reading'; fileName: string }
  | { at: 'failed'; message: string }
  | { at: 'review'; parsed: ParsedWorkbook; resolution: ImportResolution }
  | { at: 'importing'; parsed: ParsedWorkbook; resolution: ImportResolution }
  // Re-resolving after a choice, with the last good view still on screen
  // so the panel does not blink out from under the person using it.
  | { at: 'rechecking'; parsed: ParsedWorkbook; resolution: ImportResolution }
  | { at: 'done'; result: ImportResult; parsed: ParsedWorkbook };

export function ImportCenter({
  resolveImport, commitImport, getImportHistory, onOpenClass,
}: Props) {
  const [stage, setStage] = useState<Stage>({ at: 'idle' });
  const [choices, setChoices] = useState<Choices>({});
  /**
   * What the person chose when the workbook could not be resolved on its
   * own. Sent back with the file on every re-check, so the server
   * resolves against the choice rather than against the spreadsheet.
   */
  const [overrides, setOverrides] = useState<ImportOverrides>({});
  const [history, retryHistory] = useAsync(
    () => getImportHistory(20),
    // Reloaded whenever an import finishes, so the list below is not a
    // stale copy of the moment the page opened.
    [stage.at === 'done' ? stage.result.batchId : 'none'],
  );

  async function onFile(file: File) {
    setStage({ at: 'reading', fileName: file.name });
    try {
      // Loaded here, not at the top of the file. The parser imports
      // SheetJS — 363 kB, 123 kB gzipped — and this is the only screen
      // that needs it. A teacher opening their gradebook should not
      // download a spreadsheet parser to do it.
      const { parseThreeTermWorkbook } = await import('../lib/import/three-term');
      const parsed = parseThreeTermWorkbook(await file.arrayBuffer(), file.name);
      const resolution = await resolveImport(parsed);
      setOverrides({});
      setChoices(defaultChoices(resolution));
      setStage({ at: 'review', parsed, resolution });
    } catch (err) {
      setStage({
        at: 'failed',
        // WorkbookShapeError extends Error and its message is written
        // for a teacher — "This workbook has no INPUT sheet…" — so pass
        // it through rather than replacing it with a generic line.
        message: err instanceof Error ? err.message : 'That file could not be read.',
      });
    }
  }

  /**
   * Ask the server again, with the choices made so far.
   *
   * A full re-resolution rather than a local patch: choosing a grade
   * level changes which sections are relevant, choosing a subject
   * decides the grading scheme and therefore which components exist,
   * and choosing a section changes which learners are candidates for
   * matching. Working any of that out in the browser would be a second
   * implementation of the resolver, and the two would drift.
   */
  async function recheck(next: ImportOverrides) {
    if (stage.at !== 'review' && stage.at !== 'rechecking') return;
    const { parsed } = stage;
    setOverrides(next);
    setStage({ at: 'rechecking', parsed, resolution: stage.resolution });
    try {
      const resolution = await resolveImport({ ...parsed, overrides: next });
      setChoices(defaultChoices(resolution));
      setStage({ at: 'review', parsed, resolution });
    } catch (err) {
      setStage({
        at: 'failed',
        message: err instanceof Error ? err.message : 'That choice could not be checked.',
      });
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Import</h1>
          <p className="page-sub">
            Read a three-term class record workbook into the system. Marks and
            structure are imported; every grade is recomputed here, so nothing
            the workbook calculated is carried over.
          </p>
        </div>
      </div>

      {stage.at === 'idle' || stage.at === 'failed' || stage.at === 'reading' ? (
        <Upload stage={stage} onFile={onFile} onReset={() => setStage({ at: 'idle' })} />
      ) : null}

      {(stage.at === 'review' || stage.at === 'importing' || stage.at === 'rechecking') && (
        <Review
          parsed={stage.parsed}
          resolution={stage.resolution}
          choices={choices}
          setChoices={setChoices}
          overrides={overrides}
          onChoose={recheck}
          rechecking={stage.at === 'rechecking'}
          busy={stage.at === 'importing'}
          onCancel={() => setStage({ at: 'idle' })}
          onConfirm={async () => {
            const plan = buildPlan(stage.parsed, stage.resolution, choices);
            setStage({ at: 'importing', parsed: stage.parsed, resolution: stage.resolution });
            try {
              const result = await commitImport(plan);
              setStage({ at: 'done', result, parsed: stage.parsed });
            } catch (err) {
              setStage({
                at: 'failed',
                message: err instanceof Error ? err.message : 'The import did not run.',
              });
            }
          }}
        />
      )}

      {stage.at === 'done' && (
        <Done
          result={stage.result}
          fileName={stage.parsed.fileName}
          onOpenClass={onOpenClass}
          onAgain={() => setStage({ at: 'idle' })}
        />
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Recent imports</h2>
            <p className="page-sub">
              What has been imported, by whom. A preview leaves no trace here,
              because a preview changed nothing.
            </p>
          </div>
        </div>
        <Async state={history} retry={retryHistory} rows={3}>
          {(rows) => (rows.length === 0 ? (
            <EmptyState title="Nothing imported yet">
              Import a workbook above and it will be listed here.
            </EmptyState>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Class</th>
                    <th scope="col">By</th>
                    <th scope="col" className="num">Learners</th>
                    <th scope="col" className="num">Marks</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="mono">{r.fileName}</th>
                      <td>{r.className ?? <span className="faint">class deleted</span>}</td>
                      <td>{r.importedBy ?? <span className="faint">—</span>}</td>
                      <td className="num mono">{r.summary.learnersOnRoster ?? 0}</td>
                      <td className="num mono">{r.summary.marks ?? 0}</td>
                      <td className="faint">{new Date(r.at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Async>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Upload({ stage, onFile, onReset }: {
  stage: Stage; onFile: (f: File) => void; onReset: () => void;
}) {
  return (
    <div className="panel">
      <div className="panel-body">
        {stage.at === 'failed' && (
          <div className="err-banner" role="alert">
            <span>{stage.message}</span>
            <button className="btn btn-sm" type="button" onClick={onReset}>Dismiss</button>
          </div>
        )}
        <label className="field">
          <span className="field-label">Workbook</span>
          <input
            className="input" type="file" accept=".xlsx,.xlsm"
            aria-label="Choose a workbook to import"
            disabled={stage.at === 'reading'}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input so choosing the SAME file again still
              // fires a change event — otherwise a teacher who fixes
              // their workbook and re-picks it sees nothing happen.
              e.target.value = '';
              if (file) onFile(file);
            }}
          />
          <span className="field-hint">
            A three-term class record: INPUT, TERM1, TERM2, TERM3. The file is
            read in your browser — nothing is uploaded and nothing is written
            until you confirm.
          </span>
        </label>
        {stage.at === 'reading' && (
          <p className="faint">Reading {stage.fileName}…</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Review({
  parsed, resolution, choices, setChoices, overrides, onChoose, rechecking,
  busy, onCancel, onConfirm,
}: {
  parsed: ParsedWorkbook;
  resolution: ImportResolution;
  choices: Choices;
  setChoices: (c: Choices) => void;
  overrides: ImportOverrides;
  onChoose: (next: ImportOverrides) => void;
  rechecking: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const plan = useMemo(
    () => buildPlan(parsed, resolution, choices), [parsed, resolution, choices]);
  const summary = useMemo(
    () => summarise(parsed, resolution, choices, plan), [parsed, resolution, choices, plan]);
  const ready = canCommit(summary) && !busy;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>{summary.classLabel}</h2>
            <p className="page-sub">
              {parsed.fileName} · this import will {summary.classAction}.
            </p>
          </div>
        </div>

        <div className="panel-body">
          <dl className="detail-grid">
            <Stat label="Learners in the workbook" value={String(parsed.roster.length)} />
            <Stat label="Assessments" value={String(assessmentCount(parsed))} />
            <Stat label="Marks" value={String(markCount(parsed))} />
            <Stat
              label="Blank scores"
              value={String(
                parsed.terms.reduce(
                  (n, t) => n + t.marks.filter((m) => m.score === null).length, 0))}
              hint="left blank, never imported as zero"
            />
          </dl>
        </div>
      </div>

      <WhichClass
        parsed={parsed} resolution={resolution}
        overrides={overrides} onChoose={onChoose}
        busy={busy || rechecking}
      />

      <Issues summary={summary} />

      <div className="panel">
        <div className="panel-head"><h2>Terms</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Will be imported</th>
                <th scope="col" className="num">Assessments</th>
                <th scope="col" className="num">Marks</th>
              </tr>
            </thead>
            <tbody>
              {summary.periods.map((p) => {
                const inPlan = plan.periods.find((x) => x.name === p.name);
                return (
                  <tr key={p.name}>
                    <th scope="row">{p.name}</th>
                    <td>
                      {p.included
                        ? <span className="pill" data-tone="ok">yes</span>
                        : <span className="pill">no — {p.reason ?? 'not in this workbook'}</span>}
                    </td>
                    <td className="num mono">{inPlan?.assessments.length ?? 0}</td>
                    <td className="num mono">{inPlan?.marks.length ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Learners
        resolution={resolution} choices={choices} setChoices={setChoices}
        counts={summary.learners}
      />

      <div className="form-actions">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={!ready}>
          {busy ? 'Importing…' : `Import ${summary.marks.total} marks`}
        </button>
      </div>
    </>
  );
}

/* ==================================================================== *
 * WHICH CLASS IS THIS?
 *
 * The panel that was missing. Every "Choose one." the resolver emits
 * used to be addressed at somebody with nothing to choose with: the
 * server has always accepted `overrides`, and the client never sent
 * any. A teacher importing their real GMRC 9 workbook got six red
 * errors and no control anywhere on the page — the screen was telling
 * the truth and offering no way to act on it.
 *
 * Shown whenever the class is not matched, and ALSO once it is, because
 * a workbook that resolved to the wrong class is the more dangerous
 * case and the person needs to see what it picked.
 * ==================================================================== */

function WhichClass({ parsed, resolution, overrides, onChoose, busy }: {
  parsed: ParsedWorkbook;
  resolution: ImportResolution;
  overrides: ImportOverrides;
  onChoose: (next: ImportOverrides) => void;
  busy: boolean;
}) {
  const { options, class: cls } = resolution;
  const gradeLevelId = overrides.gradeLevelId ?? cls.gradeLevelId ?? '';
  const subjectId = overrides.subjectId ?? cls.subjectId ?? '';
  const sectionId = overrides.sectionId ?? cls.sectionId ?? '';

  // Only this grade's sections. Offering the whole year's would invite
  // dropping Grade 9 marks into a Grade 7 register.
  const sections = options.sections.filter(
    (x) => !gradeLevelId || x.gradeLevelId === gradeLevelId);

  const set = (patch: ImportOverrides) => {
    const next: ImportOverrides = { ...overrides, ...patch };
    // A new grade level invalidates the section chosen under the old one.
    if (patch.gradeLevelId !== undefined) delete next.sectionId;
    for (const k of Object.keys(next) as (keyof ImportOverrides)[]) {
      if (!next[k]) delete next[k];
    }
    onChoose(next);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Which class is this?</h2>
          <p className="page-sub">
            {cls.status === 'matched'
              ? 'Matched from the workbook. Change any of these if it picked the wrong one.'
              : 'The workbook could not be matched on its own. Choose below and it '
                + 'will be checked again.'}
          </p>
        </div>
        <div className="spacer" />
        {busy && <span className="faint" role="status">Checking…</span>}
      </div>

      <div className="panel-body form-grid">
        <Choose
          label="Grade level" value={gradeLevelId} disabled={busy}
          said={parsed.identity.gradeLevelText}
          onChange={(v) => set({ gradeLevelId: v })}
          options={options.gradeLevels.map((g) => ({ id: g.id, label: g.name }))}
        />
        <Choose
          label="Section" value={sectionId} disabled={busy || !gradeLevelId}
          said={parsed.identity.sectionText}
          hint={gradeLevelId ? undefined : 'Choose a grade level first'}
          onChange={(v) => set({ sectionId: v })}
          options={sections.map((x) => ({ id: x.id, label: x.name }))}
        />
        <Choose
          label="Subject" value={subjectId} disabled={busy}
          said={parsed.identity.subjectText}
          onChange={(v) => set({ subjectId: v })}
          options={options.subjects.map((x) => ({ id: x.id, label: `${x.title} · ${x.code}` }))}
        />
      </div>
    </div>
  );
}

/**
 * One picker, with what the WORKBOOK said underneath it.
 *
 * Showing the file's own word matters: a teacher choosing "Mathematics
 * 10" for a workbook that says "GMRC" should see that is what they are
 * doing, rather than discover it after the marks have landed.
 */
function Choose({ label, value, said, hint, options, disabled, onChange }: {
  label: string;
  value: string;
  said: string | null;
  hint?: string;
  options: { id: string; label: string }[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const chosen = options.find((o) => o.id === value);
  const flat = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const differs = !!chosen && !!said && !flat(chosen.label).includes(flat(said));
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className="input" value={value} disabled={disabled}
        // Named explicitly rather than by the wrapping label: the hint
        // below carries a whole sentence about what the workbook said,
        // and a screen reader would otherwise read all of it as the
        // control's name.
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <span className="field-hint">
        {hint ?? (said
          ? <>The workbook says <b>{said}</b>{differs && ' — you have chosen something else'}</>
          : 'The workbook does not say')}
      </span>
    </label>
  );
}

function Issues({ summary }: { summary: PlanSummary }) {
  if (summary.blockers.length === 0 && summary.warnings.length === 0) return null;
  return (
    <div className="panel">
      <div className="panel-head"><h2>Before you import</h2></div>
      <div className="panel-body">
        {summary.blockers.length > 0 && (
          <div className="err-banner" role="alert">
            <ul className="plain-list">
              {summary.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        )}
        {summary.warnings.length > 0 && (
          <ul className="plain-list faint">
            {summary.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The learner list, and the only place a human decision is required.
 *
 * A workbook carries no LRN and no student number — nothing but a name
 * and a row. So every match here is a match BY NAME, shown as such, and
 * a name matching two learners is left unresolved rather than guessed.
 * Choosing "skip" leaves that row's marks out too; they are never
 * shifted onto the row below.
 */
function Learners({ resolution, choices, setChoices, counts }: {
  resolution: ImportResolution;
  choices: Choices;
  setChoices: (c: Choices) => void;
  counts: PlanSummary['learners'];
}) {
  const set = (row: number, value: string) => {
    const next: Choices = { ...choices };
    if (value === 'create') next[row] = { action: 'create' };
    else if (value === 'skip') next[row] = { action: 'skip' };
    else next[row] = { action: 'link', enrollmentId: value };
    setChoices(next);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Learners</h2>
          <p className="page-sub">
            {counts.matched} matched by name · {counts.created} new ·{' '}
            {counts.ambiguous} need a choice
          </p>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col" className="num">Row</th>
              <th scope="col">In the workbook</th>
              <th scope="col">Match</th>
              <th scope="col">What will happen</th>
            </tr>
          </thead>
          <tbody>
            {resolution.learners.map((l) => {
              const choice = choices[l.row] ?? { action: 'skip' as const };
              const value = choice.action === 'link' ? choice.enrollmentId : choice.action;
              return (
                <tr key={l.row}>
                  <td className="num mono">{l.row}</td>
                  <th scope="row">{l.raw}</th>
                  <td>
                    <span className="pill" data-tone={l.status === 'matched' ? 'ok' : undefined}>
                      {l.status === 'matched' ? 'matched by name'
                        : l.status === 'ambiguous' ? `${l.candidates.length} possible` : 'not on record'}
                    </span>
                  </td>
                  <td>
                    <select
                      className="input" value={value}
                      aria-label={`What to do with ${l.raw}`}
                      onChange={(e) => set(l.row, e.target.value)}
                    >
                      {l.candidates.map((c) => (
                        <option key={c.enrollmentId} value={c.enrollmentId}>
                          Use {c.displayName}
                          {c.lrn ? ` · LRN ${c.lrn}` : ''}
                          {c.studentNumber ? ` · ${c.studentNumber}` : ''}
                        </option>
                      ))}
                      {resolution.permissions.createStudent && (
                        <option value="create">Add as a new learner</option>
                      )}
                      <option value="skip">Leave out — marks too</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Done({ result, fileName, onOpenClass, onAgain }: {
  result: ImportResult;
  fileName: string;
  onOpenClass: (classId: string, periodId: string) => void;
  onAgain: () => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Imported</h2>
          <p className="page-sub">{fileName}</p>
        </div>
      </div>
      <div className="panel-body">
        <dl className="detail-grid">
          {result.createdClass && <Stat label="Class" value="created" />}
          <Stat label="Learners on the roster" value={String(result.learnersOnRoster)} />
          <Stat label="Learners created" value={String(result.studentsCreated)} />
          <Stat label="Assessments" value={String(result.assessments)} />
          <Stat label="Marks" value={String(result.marks)} />
        </dl>
        <p className="faint">
          No grades were imported. Open the class and submit a term to have the
          server compute them.
        </p>
      </div>
      <div className="form-actions">
        <button className="btn" type="button" onClick={onAgain}>Import another</button>
        <button
          className="btn btn-primary" type="button"
          onClick={() => onOpenClass(result.classId, '')}
        >
          Open the class
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd className="mono">{value}{hint && <span className="field-hint"> {hint}</span>}</dd>
    </div>
  );
}
