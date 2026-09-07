/**
 * Help — how to use the E-Class Record.
 *
 * Every role opens the same screen, and every role sees all of it. What
 * changes with the role is the ORDER: the part written for the signed-in
 * role comes first, under a heading that says so, and everybody else's
 * part is still there, below, labelled as somebody else's.
 *
 * That ordering is the whole of this screen's logic, and it is decided by
 * `helpPlan()` below rather than inline in the markup — the same reason
 * `resolveActiveRole` was lifted out of `App.tsx`: a rule about roles is
 * worth unit-testing, and this project has no browser in its test run.
 *
 * Why order rather than filter. Help sits in every role's menu, and a
 * guide that shows only one of five jobs misleads the other four — an
 * adviser genuinely benefits from reading what the registrar does with
 * the section after it leaves them. But the reverse was the real
 * complaint: a registrar used to land on the teacher's eleven steps and
 * had to scroll past all of them to reach their own four, which is the
 * "handed somebody else's job" failure this file's own notes warned
 * about. Ordering fixes that without hiding anything.
 *
 * The reference material — keyboard, pasting, the status glossary, what
 * a failed save means — sits between the two groups for every role. It
 * is not any one role's job description, and the status glossary in
 * particular is the shared vocabulary of the whole custody chain.
 */
import type { Role } from '../data/types';
import { ROLE_LABEL } from '../nav';

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

/**
 * What the OTHER roles do, in the same plain words.
 *
 * The eleven steps above are a subject teacher's term. Until Help was
 * added to every menu it was the only guide anybody could open, and it
 * was the only guide anybody needed — because only the teacher's menu
 * listed it. A registrar who opens "How to use the E-Class Record" and
 * reads "open your class and enter the scores" has been handed
 * somebody else's job, which is worse than no guide at all.
 *
 * Short on purpose. A registrar's work in this system is four moves,
 * and a learner's is one.
 */
const ROLE_GUIDES: Array<{ id: HelpBlock; for: Role[]; role: string; who: string; steps: string[] }> = [
  {
    id: 'adviser',
    for: ['adviser'],
    role: 'If you are the adviser',
    who: 'You look after one section, and every subject teacher sends that section\'s grades to you.',
    steps: [
      'Open Incoming Grades. Each subject teacher who has finished a term appears here. It shows how far along each hand-off is, not the marks — receiving is signing that a record arrived, not reviewing it.',
      'To see the marks, open Consolidated Grades: your whole section, every subject in one table. This is the view that replaces the adviser\'s summary sheet, and a dash there means that teacher has not filed a grade yet.',
      'Back on Incoming Grades, sign for each one. Signing tells the teacher you have them — after that they cannot change the term without asking you.',
      'When the section is complete, pass it to the registrar.',
    ],
  },
  {
    // Also the Administrator's guide: `school_admin` in `nav.ts` is
    // built as the whole registrar menu plus School Setup, Academic
    // Years and Users, so the registrar's four moves are an
    // administrator's four moves too.
    id: 'registrar',
    for: ['registrar', 'school_admin'],
    role: 'If you are the registrar',
    who: 'You set the school year up, and you are the last signature before a grade becomes part of a learner\'s record.',
    steps: [
      'Sections, classes and subjects are yours to create. Do this before a term starts — a teacher cannot enter grades for a class that does not exist.',
      'Students is where a learner is admitted, enrolled, transferred between sections, or withdrawn. Nothing is ever deleted; a withdrawal is recorded with the reason.',
      'Grade Submissions lists everything advisers have passed up. Receive it, then approve or return it. Returning it asks for a reason, and the teacher sees that reason.',
      'Publishing is the last step, and it is the only one learners can see. Until you publish, a learner sees nothing — not a draft, not an approved grade.',
    ],
  },
  {
    id: 'learner',
    for: ['student'],
    role: 'If you are a learner',
    who: 'You can see your own record, and only your own.',
    steps: [
      'My Grades shows each subject and each term your school has published. A term your teachers are still working on is blank — that is normal, not an error.',
      'My Schedule is your class list exactly as your school recorded it. If something is wrong there, tell your adviser; it cannot be changed from this screen.',
      'Academic History is your past school years.',
    ],
  },
];

/**
 * An orderable piece of the page. `steps` is the eleven-step teacher's
 * term; the rest are the short per-role guides above.
 */
export type HelpBlock = 'steps' | 'adviser' | 'registrar' | 'learner';

/**
 * Which roles own the eleven steps.
 *
 * Both teaching roles, and that is not a guess: `ROLE_LABEL.adviser` is
 * "Advisory Teacher", `nav.ts` builds the adviser menu as the entire
 * TEACHING menu with Incoming and Consolidated Grades inserted into it,
 * and `App.tsx` gates Add class and roster editing on
 * `role === 'teacher' || role === 'adviser'` alike. An adviser teaches
 * their own subjects and advises a section on top of that, so they need
 * the teacher's term as well as their own four moves — their own first,
 * because that is the part they cannot read anywhere else.
 */
const STEPS_FOR: Role[] = ['teacher', 'adviser'];

export interface HelpPlan {
  /** Belongs to the signed-in role. Rendered first, marked as theirs. */
  yours: HelpBlock[];
  /** Everybody else's, still on the page, rendered after `yours`. */
  others: HelpBlock[];
}

/**
 * Decide what this role reads first.
 *
 * Ordering only — nothing is dropped, and `yours` + `others` always
 * together contain every block exactly once.
 */
export function helpPlan(role: Role): HelpPlan {
  const yours: HelpBlock[] = [];
  const others: HelpBlock[] = [];

  // A role's own short guide leads, ahead of the eleven steps even for
  // an adviser who needs both: it is the shorter read and the part that
  // is theirs alone.
  for (const g of ROLE_GUIDES) {
    if (g.for.includes(role)) yours.push(g.id);
  }
  if (STEPS_FOR.includes(role)) yours.push('steps');

  // `others` keeps the page's original order — the eleven steps, then
  // the guides as listed — so demoting a block never reshuffles the
  // ones around it.
  if (!STEPS_FOR.includes(role)) others.push('steps');
  for (const g of ROLE_GUIDES) {
    if (!g.for.includes(role)) others.push(g.id);
  }

  return { yours, others };
}

export function Help({ role }: { role: Role }) {
  const plan = helpPlan(role);
  const stepsAreYours = plan.yours.includes('steps');

  const steps = (
    <div className="panel" key="steps">
      <div className="panel-head">
        <div>
          {/*
            "Your term" only when it IS your term. Shown to a registrar
            under "What the other roles do", the same words would
            contradict the heading above them.
          */}
          <h2>{stepsAreYours ? 'Your term, step by step' : 'The subject teacher\'s term, step by step'}</h2>
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
  );

  const reference = (
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
  );

  const guide = (id: HelpBlock) => {
    if (id === 'steps') return steps;
    const g = ROLE_GUIDES.find((x) => x.id === id)!;
    return (
      <div className="panel" key={g.id}>
        <div className="panel-head">
          <div>
            <h2>{g.role}</h2>
            <p className="page-sub">{g.who}</p>
          </div>
        </div>
        <div className="panel-body">
          <ol className="guide-steps">
            {g.steps.map((step, i) => (
              <li key={step}>
                <h3><span className="guide-step-n">Step {i + 1}</span></h3>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="greeting">How to use the E-Class Record</h1>
          <p className="page-sub">
            {stepsAreYours
              ? 'The whole term, step by step. Start at Step 1 — you can do the rest another day.'
              : 'Your part first, then what everybody else does with the same record.'}
          </p>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h2>Your guide</h2>
          <p className="page-sub">
            You are signed in as {ROLE_LABEL[role]}.
            {role === 'school_admin'
              ? ' You reach everything the registrar does, so their guide is yours too.'
              : ' This is the part written for you.'}
          </p>
        </div>
      </div>
      {plan.yours.map(guide)}

      {reference}

      <div className="page-head">
        <div>
          <h2>What the other roles do</h2>
          <p className="page-sub">
            Not yours to do, but worth knowing — the same record passes through
            every one of these.
          </p>
        </div>
      </div>
      {plan.others.map(guide)}
    </div>
  );
}
