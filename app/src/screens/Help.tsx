/**
 * Help — how to use the E-Class Record.
 *
 * Two audiences on one screen, in the order they need it.
 *
 * FIRST, the eleven steps of the teacher's term, in plain words. The
 * school told us this has to work for teachers who have never used
 * anything but a paper class record and Excel, so the guide names what
 * to click and what will happen, and uses no word a teacher would have
 * to look up: no "RPC", no "submission state", no "validation".
 *
 * SECOND, the keyboard reference and the status glossary — the detail a
 * teacher wants on their fifth day, not their first. Keeping it below
 * the steps rather than on another screen means one place to send
 * somebody who says "I don't know how to start".
 */

/**
 * The teacher's term, start to finish.
 *
 * Written as instructions, not descriptions: every step says what to
 * click. `note` carries the one thing that most often goes wrong at
 * that step — the questions a teacher actually asks.
 */
const STEPS: Array<{ title: string; body: string; note?: string }> = [
  {
    title: 'Open your class',
    body: 'Click My Classes in the menu on the left. Your classes are listed '
        + 'there. Click Open class on the one you want to work on.',
    note: 'If a class is missing, the registrar has not assigned it to you yet.',
  },
  {
    title: 'Choose the term',
    body: 'At the top of the page, choose Term 1, Term 2 or Term 3. '
        + 'Everything you do next belongs to the term you chose.',
    note: 'Choosing a different term never changes the work you did in another one.',
  },
  {
    title: 'Set up what you will grade',
    body: 'Open the Setup tab. List your Written Works and Performance Tasks, '
        + 'and the highest possible score for each one — the score a learner '
        + 'would get for a perfect paper.',
    note: 'Do this before entering scores. You can add more later.',
  },
  {
    title: 'Enter the scores',
    body: 'Open the Grade Entry tab. Type each learner\'s score. Press Enter '
        + 'to move down to the next learner in the same column.',
    note: 'Type the raw score, not the percentage. The system works out the rest.',
  },
  {
    title: 'Your work is saved as you go',
    body: 'You do not need to look for a Save button. Each score is saved a '
        + 'moment after you type it, and the dot beside the row tells you: '
        + 'orange while it is saving, green when it is safe.',
    note: 'If a score does not save, the screen says so and keeps your number '
        + 'on the page so nothing is lost.',
  },
  {
    title: 'Check the computed grades',
    body: 'Open the Summary tab to see each learner\'s grade for the term, '
        + 'worked out from the scores you entered.',
    note: 'You do not compute anything yourself. The weights come from the '
        + 'subject, so a Core subject and MAPEH are handled differently and '
        + 'correctly.',
  },
  {
    title: 'Find the missing scores',
    body: 'Blank cells in Grade Entry are scores nobody has entered yet. The '
        + 'Summary tab counts them for you, and the Submit page lists them '
        + 'by name before you send anything.',
    note: 'A blank is not a zero. Enter a zero only if the learner truly '
        + 'scored nothing.',
  },
  {
    title: 'Look at the class as a whole',
    body: 'Analytics shows how the class is doing — the average, the highest '
        + 'and lowest, and how many are passing. LOA Reports shows the '
        + 'learning-outcome report for the class and term you choose.',
    note: 'Both can be opened from the left menu without opening a class first.',
  },
  {
    title: 'Submit the term',
    body: 'When the scores are complete, open the Submission tab and click '
        + 'Submit. This hands the term\'s grades to your adviser.',
    note: 'The system warns you first if scores are missing. You can still '
        + 'submit, but you will be told exactly what is incomplete.',
  },
  {
    title: 'After you submit',
    body: 'Your adviser receives the grades and passes them to the registrar. '
        + 'The registrar checks them, finalizes them, and publishes them. '
        + 'Only then can learners see them.',
    note: 'While it is with somebody else you cannot edit it. If you spot a '
        + 'mistake before the adviser signs for it, use Take back.',
  },
  {
    title: 'If you need to fix something later',
    body: 'Once a term has been published, ask the registrar. Published '
        + 'grades are official records, so they are corrected on purpose '
        + 'rather than quietly changed.',
    note: 'Nothing you entered is ever lost — a correction is recorded '
        + 'alongside what it replaced.',
  },
];
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
          <h1 className="greeting">How to use the E-Class Record</h1>
          <p className="page-sub">
            The whole term, step by step. Start at Step 1 — you can do the rest
            another day.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Your term, step by step</h2>
            <p className="page-sub">
              Do these in order the first time. After that, most days are only
              Steps 1, 2 and 4.
            </p>
          </div>
        </div>
        <div className="panel-body">
          {/*
            The step number is REAL TEXT, not a CSS ::before counter.
            A counter is invisible to a screen reader and to anyone
            copying the guide into a handout — and "Step 4" is the part
            a teacher says out loud when asking a colleague for help.
          */}
          <ol className="guide-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <h3><span className="guide-step-n">Step {i + 1}</span>{s.title}</h3>
                <p>{s.body}</p>
                {s.note && <p className="guide-note">{s.note}</p>}
              </li>
            ))}
          </ol>
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
