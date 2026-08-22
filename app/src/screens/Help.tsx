/**
 * Help.
 *
 * A menu entry that rendered the dashboard. It is now the keyboard
 * reference for the gradebook, which is the one screen where knowing
 * the shortcuts is the difference between beating Excel and losing to
 * it — the grid is built so a teacher never reaches for the mouse, and
 * that is worth nothing if nobody is told.
 */
const KEYS: Array<[string, string]> = [
  ['Enter', 'Move down one learner, same assessment — the way a column is entered'],
  ['Shift + Enter', 'Move up one learner'],
  ['Tab', 'Move right; wraps to the next learner at the end of a row'],
  ['Shift + Tab', 'Move left; wraps to the previous learner'],
  ['↑ ↓', 'Move between learners'],
  ['← →', 'Move between assessments, once the caret reaches the end of the value'],
  ['Ctrl / ⌘ + D', 'Fill down — copy the value from the learner above'],
  ['Escape', 'Leave the cell'],
];

export function Help() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">Help</h1>
          <p className="page-sub">Entering grades quickly, and what the statuses mean.</p>
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h2>Gradebook keyboard</h2></div>
          <div className="panel-body">
            <dl className="facts">
              {KEYS.map(([k, v]) => (
                <div key={k}>
                  <dt><kbd>{k}</kbd></dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Pasting from a spreadsheet</h2></div>
          <div className="panel-body">
            <p className="page-sub">
              Copy a column or a block of cells in Excel and paste into the grid. The paste
              starts at the cell you are in and fills right and down, so a block of five
              learners by three assessments lands as five rows by three columns.
            </p>
            <p className="page-sub">
              Blank cells in the pasted block are left as missing rather than written as
              zero. A zero is a mark a learner earned; a blank is a mark not yet given, and
              the two must not be confused.
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>What the statuses mean</h2></div>
          <div className="panel-body">
            <dl className="facts">
              <div><dt>Draft</dt><dd>Nothing entered yet. Only you can see it.</dd></div>
              <div><dt>In progress</dt><dd>Partly entered. Still yours; not sent anywhere.</dd></div>
              <div><dt>Submitted</dt><dd>With the registrar. The gradebook locks.</dd></div>
              <div><dt>Returned</dt><dd>Sent back with a reason. Editing is open again.</dd></div>
              <div><dt>Approved</dt><dd>Accepted by the registrar, not yet final.</dd></div>
              <div><dt>Finalized</dt><dd>Closed for the period, not yet visible to learners.</dd></div>
              <div><dt>Published</dt><dd>Released. Learners can see these grades.</dd></div>
            </dl>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>If a save fails</h2></div>
          <div className="panel-body">
            <p className="page-sub">
              Your entries stay on screen and stay marked as unsaved. Press <b>Retry</b> in the
              gradebook toolbar. Nothing you typed is discarded because a request failed.
            </p>
            <p className="page-sub">
              If the message says only some scores were saved, the period was most likely
              submitted or locked in another tab. Reload to see its real state before
              entering more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
