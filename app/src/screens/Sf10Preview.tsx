import type { Sf10Block, Sf10Payload } from '../data/sf10';

/**
 * SF10-JHS — Learner Permanent Record for Junior High School.
 *
 * Layout follows the school's real blank form (SFRT Revised 2017). This
 * is the TEMPLATE layer: it binds to the `rds.sf10_jhs` contract and
 * knows nothing about tables. A school with a variant gets a second
 * template, not a code change.
 *
 * ⚠️ The form provides FOUR quarterly rating columns. DO 009 s.2026
 * moves schools to THREE terms. Rather than silently stretching three
 * terms across four boxes, the template renders exactly the periods the
 * year declares and flags the mismatch. Which way DepEd wants this
 * reconciled is a policy question — see docs/20-assumptions-register.md.
 */
export function Sf10Preview({ data }: { data: Sf10Payload }) {
  const l = data.learner;
  const fullName = [l.last_name, l.first_name].filter(Boolean).join(', ');

  return (
    <div className="page">
      <div className="panel sf10-actions">
        <div className="panel-head">
          <h2>Learner Permanent Record (SF10-JHS)</h2>
          <span className="badge badge-draft" title="Not a numbered, issued document">
            <span aria-hidden="true">○</span> Draft preview
          </span>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
          <button className="btn btn-sm">Export XLSX</button>
          <button className="btn btn-primary btn-sm">Issue &amp; number</button>
        </div>
        <div className="panel-body" style={{ fontSize: 12, color: 'var(--muted)' }}>
          A draft is unnumbered and is not written to the issuance log. Only the registrar can
          issue, and issuance freezes the signatories and allocates a document number.
        </div>
      </div>

      <div className="sf10">
        <header className="sf10-head">
          <div className="sf10-formcode">SF 10-JHS</div>
          <div className="sf10-title">
            <div>Republic of the Philippines</div>
            <div><strong>Department of Education</strong></div>
            <div className="sf10-formname">
              Learner Permanent Record for Junior High School (SF10-JHS)
            </div>
            <div className="sf10-formerly">(Formerly Form 137)</div>
          </div>
        </header>

        {/* ---------------- LEARNER'S INFORMATION ---------------- */}
        <h3 className="sf10-band">Learner's Information</h3>
        <div className="sf10-grid-3">
          <Field label="LAST NAME" value={l.last_name} />
          <Field label="FIRST NAME" value={l.first_name} extra={l.name_extension ? `Name Extn.: ${l.name_extension}` : 'Name Extn. (Jr, I, II):'} />
          <Field label="MIDDLE NAME" value={l.middle_name} />
          <Field label="Learner Reference Number (LRN)" value={l.lrn} mono />
          <Field label="Birthdate (mm/dd/yyyy)" value={l.birthdate} mono />
          <Field label="Sex" value={l.sex} />
        </div>

        {/* ---------------- ELIGIBILITY ---------------- */}
        <h3 className="sf10-band">Eligibility for JHS Enrolment</h3>
        {data.eligibility ? (
          <div className="sf10-elig">
            <div className="sf10-checks">
              <Check on={data.eligibility.type === 'elem_completer'} label="Elementary School Completer" />
              <Check on={data.eligibility.type === 'other'} label="Other Credential Presented" />
              <Check on={data.eligibility.type === 'pept'} label="PEPT Passer" />
              <Check on={data.eligibility.type === 'als'} label="ALS" />
            </div>
            <div className="sf10-grid-3">
              <Field label="General Average" value={data.eligibility.general_average} mono />
              <Field label="Citation (if any)" value={data.eligibility.citation} />
              <Field label="Rating" value={data.eligibility.exam_rating} mono />
              <Field label="Name of Elementary School" value={data.eligibility.prev_school_name} />
              <Field label="School ID" value={data.eligibility.prev_school_govt_id} mono />
              <Field label="Address of School" value={data.eligibility.prev_school_address} />
              <Field label="Date of Examination / Assessment (mm/dd/yyyy)" value={data.eligibility.exam_date} mono />
            </div>
          </div>
        ) : (
          <p className="sf10-none">No eligibility record on file for this learner.</p>
        )}

        {/* ---------------- SCHOLASTIC RECORDS ---------------- */}
        <h3 className="sf10-band">Scholastic Record</h3>
        {data.scholastic_records.map((b) => <ScholasticBlock key={b.school_year} block={b} />)}

        {/* ---------------- CERTIFICATION ---------------- */}
        <h3 className="sf10-band">Certification</h3>
        <div className="sf10-cert">
          <p>
            I CERTIFY that this is a true record of <strong>{fullName}</strong> with
            Learner Reference Number <span className="mono">{l.lrn ?? '____________'}</span>.
          </p>
          <p>
            Name of School: <strong>{data.certification.school_name}</strong> &nbsp;·&nbsp;
            School ID: <span className="mono">{data.certification.school_govt_id ?? '______'}</span>
          </p>
          <div className="sf10-sign-row">
            <Sign line={data.certification.generated_on} caption="Date" />
            <Sign line={data.certification.principal_name ?? ''} caption="Name of Principal / School Head over Printed Name" />
            <div className="sf10-seal">(Affix School Seal here)</div>
          </div>
        </div>

        <footer className="sf10-foot">
          <span>{data.revision}</span>
          <span className="spacer" />
          <span>Generated {data.certification.generated_on} · unnumbered draft</span>
        </footer>
      </div>
    </div>
  );
}

function ScholasticBlock({ block }: { block: Sf10Block }) {
  const cols = block.periods;
  // The form is drawn for four columns; a three-term year fills three.
  const shortfall = 4 - cols.length;

  return (
    <section className="sf10-block">
      <div className="sf10-blockhead">
        <Field label="School" value={block.school_name} />
        <Field label="School ID" value={block.school_govt_id} mono />
        <Field label="District" value={block.district} />
        <Field label="Division" value={block.division} />
        <Field label="Region" value={block.region} />
        <Field label="Classified as Grade" value={block.grade_level} />
        <Field label="Section" value={block.section} />
        <Field label="School Year" value={block.school_year} mono />
        <Field label="Name of Adviser / Teacher" value={block.adviser} />
      </div>

      {shortfall > 0 && (
        <p className="sf10-warn">
          This school year has {cols.length} grading {cols.length === 1 ? 'period' : 'periods'} (
          {cols.map((c) => c.name).join(', ')}), but SF10-JHS is printed with four quarterly
          rating columns. The unused columns are left blank pending DepEd guidance — they are
          not back-filled or averaged.
        </p>
      )}

      <div className="tscroll">
        <table className="sf10-table">
          <thead>
            <tr>
              <th rowSpan={2} className="sf10-area">Learning Areas</th>
              <th colSpan={4}>Quarterly Rating</th>
              <th rowSpan={2}>Final<br />Rating</th>
              <th rowSpan={2}>Remarks</th>
            </tr>
            <tr>
              {cols.map((c) => <th key={c.ordinal} title={c.name}>{c.ordinal}</th>)}
              {Array.from({ length: shortfall }).map((_, i) => (
                <th key={`x${i}`} className="sf10-unused" title="No such grading period this year">
                  {cols.length + i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.learning_areas.map((a) => (
              <tr key={a.subject_id} className={a.is_child ? 'sf10-child' : undefined}>
                <th scope="row" className="sf10-area">{a.title}</th>
                {cols.map((c) => {
                  const r = a.period_ratings.find((x) => x.ordinal === c.ordinal);
                  return <td key={c.ordinal} className="mono">{r?.rating ?? ''}</td>;
                })}
                {Array.from({ length: shortfall }).map((_, i) => (
                  <td key={`x${i}`} className="sf10-unused" />
                ))}
                <td className="mono sf10-final">{a.final_rating ?? ''}</td>
                <td>{a.remarks ?? ''}</td>
              </tr>
            ))}
            <tr className="sf10-genave">
              <th scope="row" className="sf10-area" />
              <td colSpan={4} style={{ textAlign: 'right', paddingRight: 10 }}>General Average</td>
              <td className="mono sf10-final">{block.general_average ?? ''}</td>
              <td>{block.promotion_status}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="sf10-remedial">
        <div className="sf10-remedial-head">
          <strong>Remedial Classes</strong>
          <span>
            Conducted from (mm/dd/yyyy) <u>{block.remedial?.conducted_from ?? ' '.repeat(14)}</u>
            {' '}to <u>{block.remedial?.conducted_to ?? ' '.repeat(14)}</u>
          </span>
        </div>
        <table className="sf10-table">
          <thead>
            <tr>
              <th className="sf10-area">Learning Areas</th>
              <th>Final Rating</th><th>Remedial Class Mark</th>
              <th>Recomputed Final Grade</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {(block.remedial?.marks ?? []).map((m) => (
              <tr key={m.subject}>
                <th scope="row" className="sf10-area">{m.subject}</th>
                <td className="mono">{m.final_rating ?? ''}</td>
                <td className="mono">{m.remedial_class_mark ?? ''}</td>
                <td className="mono sf10-final">{m.recomputed_final_grade ?? ''}</td>
                <td>{m.remarks ?? ''}</td>
              </tr>
            ))}
            {(block.remedial?.marks.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="sf10-none">No remedial classes recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({ label, value, mono, extra }: {
  label: string; value: string | number | null | undefined; mono?: boolean; extra?: string;
}) {
  return (
    <div className="sf10-field">
      <span className="sf10-label">{label}</span>
      <span className={`sf10-value${mono ? ' mono' : ''}`}>
        {value === null || value === undefined || value === '' ? ' ' : value}
      </span>
      {extra && <span className="sf10-extra">{extra}</span>}
    </div>
  );
}

function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="sf10-check">
      <span className="sf10-box" aria-hidden="true">{on ? '/' : ' '}</span>
      <span>{label}</span>
    </span>
  );
}

function Sign({ line, caption }: { line: string; caption: string }) {
  return (
    <div className="sf10-sign">
      <div className="sf10-signline">{line || ' '}</div>
      <div className="sf10-signcap">{caption}</div>
    </div>
  );
}
