/**
 * Fixture data source.
 *
 * Mirrors the seeded database exactly (supabase/seed.sql) so the UI can
 * be developed and demonstrated before a Supabase project exists. The
 * Supabase implementation in `./supabase.ts` returns the identical
 * shapes, so swapping is one import.
 *
 * These are FIXTURES, not defaults. Nothing here ships to a school.
 */
import type {
  AcademicYear, ClassSummary, CurrentUser, GradebookData, RosterStudent,
} from './types';
import { DO015_CORE, DO015_MAPEH } from '../lib/grading/fixtures';
import type { Assessment } from '../lib/grading';

export const YEAR_TRIMESTER: AcademicYear = {
  id: 'year-anhs',
  label: '2026-2027',
  periodStructure: 'trimester',
  periods: [
    { id: 'p1', ordinal: 1, name: 'Term 1', shortName: 'T1', startDate: '2026-06-08', endDate: '2026-09-15', status: 'closed' },
    { id: 'p2', ordinal: 2, name: 'Term 2', shortName: 'T2', startDate: '2026-09-16', endDate: '2026-12-18', status: 'active' },
    { id: 'p3', ordinal: 3, name: 'Term 3', shortName: 'T3', startDate: '2027-01-04', endDate: '2027-04-08', status: 'upcoming' },
  ],
};

/** The same code, a four-quarter school. Proves periods are data. */
export const YEAR_QUARTER: AcademicYear = {
  id: 'year-demo',
  label: '2026-2027',
  periodStructure: 'quarter',
  periods: [
    { id: 'q1', ordinal: 1, name: 'First Quarter', shortName: 'Q1', startDate: '2026-06-08', endDate: '2026-08-14', status: 'closed' },
    { id: 'q2', ordinal: 2, name: 'Second Quarter', shortName: 'Q2', startDate: '2026-08-17', endDate: '2026-10-30', status: 'active' },
    { id: 'q3', ordinal: 3, name: 'Third Quarter', shortName: 'Q3', startDate: '2026-11-03', endDate: '2027-01-29', status: 'upcoming' },
    { id: 'q4', ordinal: 4, name: 'Fourth Quarter', shortName: 'Q4', startDate: '2027-02-01', endDate: '2027-04-08', status: 'upcoming' },
  ],
};

export const CURRENT_USER: CurrentUser = {
  id: 'u-maria',
  name: 'Maria Santos',
  initials: 'MS',
  roles: ['teacher'],
  schoolId: 'school-anhs',
  schoolName: 'Angono National High School',
  schoolCode: 'ANHS',
};

const NAMES = [
  'Abad, Juan C.', 'Alvarez, Maria L.', 'Bautista, Pedro R.', 'Castillo, Ana M.',
  'Delos Santos, Andrea P.', 'Boyore, Joshua R.', 'Garcia, Liza M.', 'Hernandez, Mark A.',
  'Ignacio, Bea S.', 'Jimenez, Carlo D.', 'Lim, Patricia G.', 'Mendoza, Rafael T.',
  'Navarro, Sofia B.', 'Ocampo, Miguel V.', 'Pascual, Trisha N.', 'Quinto, Daniel E.',
  'Ramos, Isabel F.', 'Salazar, Nathan J.', 'Torres, Camille O.', 'Villanueva, Enzo K.',
];

export const ROSTER: RosterStudent[] = NAMES.map((displayName, i) => ({
  classEnrollmentId: `ce-${i + 1}`,
  studentId: `st-${i + 1}`,
  displayName,
}));

/** DO 015 s.2026 assessment shape: WW, PT, then ST1 / ST2 / TE. */
export const ASSESSMENTS: Assessment[] = [
  { id: 'a-ww1', componentId: 'WW', ordinal: 1, title: 'Quiz 1', highestPossibleScore: 20 },
  { id: 'a-ww2', componentId: 'WW', ordinal: 2, title: 'Quiz 2', highestPossibleScore: 20 },
  { id: 'a-ww3', componentId: 'WW', ordinal: 3, title: 'Seatwork 1', highestPossibleScore: 15 },
  { id: 'a-ww4', componentId: 'WW', ordinal: 4, title: 'Quiz 3', highestPossibleScore: 25 },
  { id: 'a-pt1', componentId: 'PT', ordinal: 1, title: 'Problem Set', highestPossibleScore: 40 },
  { id: 'a-pt2', componentId: 'PT', ordinal: 2, title: 'Group Task', highestPossibleScore: 30 },
  { id: 'a-pt3', componentId: 'PT', ordinal: 3, title: 'Project', highestPossibleScore: 50 },
  { id: 'a-st1', componentId: 'ST1', ordinal: 1, title: 'Summative Test 1', highestPossibleScore: 40 },
  { id: 'a-st2', componentId: 'ST2', ordinal: 1, title: 'Summative Test 2', highestPossibleScore: 40 },
  { id: 'a-te',  componentId: 'TE',  ordinal: 1, title: 'Term Examination', highestPossibleScore: 60 },
];

/** Deterministic pseudo-random so the demo is stable across reloads. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 1000) / 1000;
}

function buildScores(periodId: string) {
  const scores: GradebookData['scores'] = {};
  for (const student of ROSTER) {
    const row: Record<string, { raw: number | null; isExcused: boolean }> = {};
    for (const item of ASSESSMENTS) {
      const r = seeded(student.classEnrollmentId + item.id + periodId);
      // Term 2 is deliberately partial: real gaps for the missing-score
      // flag, the gaps filter, and the submission warnings.
      const skip = periodId === 'p2' && (item.componentId === 'TE' || r > 0.86);
      row[item.id] = skip
        ? { raw: null, isExcused: false }
        : { raw: Math.round(item.highestPossibleScore * (0.58 + r * 0.4)), isExcused: false };
    }
    scores[student.classEnrollmentId] = row;
  }
  // One excused learner, so the excused-vs-missing distinction is visible.
  const excused = scores['ce-3'];
  if (excused) excused['a-pt2'] = { raw: null, isExcused: true };
  return scores;
}

export const CLASSES: ClassSummary[] = [
  {
    id: 'c-math10-pearl', gradeLevel: 'Grade 10', section: 'Pearl',
    subject: 'Mathematics 10', subjectCode: 'MATH10', studentCount: ROSTER.length,
    scheduleNote: 'MWF 8:00-9:00', room: 'Room 204',
    status: { p1: 'published', p2: 'in_progress', p3: 'draft' },
    completeness: { p1: { scored: 200, total: 200 }, p2: { scored: 142, total: 200 }, p3: { scored: 0, total: 200 } },
  },
  {
    id: 'c-math10-diamond', gradeLevel: 'Grade 10', section: 'Diamond',
    subject: 'Mathematics 10', subjectCode: 'MATH10', studentCount: 18,
    scheduleNote: 'MWF 9:00-10:00', room: 'Room 204',
    status: { p1: 'published', p2: 'submitted', p3: 'draft' },
    completeness: { p1: { scored: 180, total: 180 }, p2: { scored: 180, total: 180 }, p3: { scored: 0, total: 180 } },
  },
  {
    id: 'c-math9-ruby', gradeLevel: 'Grade 9', section: 'Ruby',
    subject: 'Mathematics 9', subjectCode: 'MATH9', studentCount: 19,
    scheduleNote: 'TTh 10:00-11:30', room: 'Room 201',
    status: { p1: 'published', p2: 'returned', p3: 'draft' },
    completeness: { p1: { scored: 190, total: 190 }, p2: { scored: 165, total: 190 }, p3: { scored: 0, total: 190 } },
  },
  {
    id: 'c-mapeh10-pearl', gradeLevel: 'Grade 10', section: 'Pearl',
    subject: 'MAPEH 10', subjectCode: 'MAPEH10', studentCount: ROSTER.length,
    scheduleNote: 'TTh 13:00-14:00', room: 'Gym',
    status: { p1: 'published', p2: 'draft', p3: 'draft' },
    completeness: { p1: { scored: 200, total: 200 }, p2: { scored: 0, total: 200 }, p3: { scored: 0, total: 200 } },
  },
];

export function getGradebook(classId: string, periodId: string): GradebookData {
  const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
  const status = cls.status[periodId] ?? 'draft';
  return {
    classId,
    periodId,
    // MAPEH carries 20/60/20; everything else 20/50/30. Scheme comes
    // from the subject category, never from a constant in the screen.
    scheme: cls.subjectCode.startsWith('MAPEH') ? DO015_MAPEH : DO015_CORE,
    assessments: ASSESSMENTS,
    roster: ROSTER.slice(0, cls.studentCount),
    scores: buildScores(periodId),
    status,
    editable: status === 'draft' || status === 'in_progress' || status === 'returned' || status === 'reopened',
  };
}


/* ------------------------------------------------------------------ *
 * DataSource implementation
 *
 * Async throughout, deliberately. A synchronous fixture path would let
 * loading and error states go unwritten, and they would then be
 * discovered by a school on a bad connection rather than by us.
 * ------------------------------------------------------------------ */
import type { DataSource, ScoreEdit, SessionContext } from './source';
import { SF10_FIXTURE } from './sf10';

const FIXTURE_SESSION: SessionContext = {
  user: {
    id: CURRENT_USER.id,
    name: CURRENT_USER.name,
    initials: CURRENT_USER.initials,
    email: 'maria@anhs.test',
    employeeId: 'EMP-003',
    schoolId: CURRENT_USER.schoolId,
    roles: ['teacher'],
  },
  school: {
    id: CURRENT_USER.schoolId,
    code: CURRENT_USER.schoolCode,
    name: CURRENT_USER.schoolName,
    govtSchoolId: '301417',
    region: 'IV-A CALABARZON',
    division: 'Rizal',
    district: 'Angono',
  },
  academicYears: [YEAR_TRIMESTER, YEAR_QUARTER].map((y) => ({
    id: y.id,
    label: y.label,
    periodStructure: y.periodStructure,
    status: 'active',
    periods: y.periods.map((p) => ({
      id: p.id, ordinal: p.ordinal, name: p.name, shortName: p.shortName,
      startDate: p.startDate, endDate: p.endDate, status: p.status,
    })),
  })),
  settings: {},
};

/** Mutable in-memory scores, so edits persist for the length of a session. */
const editedScores = new Map<string, { raw: number | null; isExcused: boolean }>();

export function createFixtureSource(): DataSource {
  return {
    kind: 'fixtures',

    async getSession() { return FIXTURE_SESSION; },
    async signIn() { /* no auth against fixtures */ },
    async signOut() { /* no-op */ },
    onAuthChange() { return () => {}; },

    async getClasses() { return CLASSES; },

    async getGradebook(classId, periodId) {
      const base = getGradebook(classId, periodId);
      // Replay edits made this session so the grid does not appear to
      // discard work when a period is switched and switched back.
      for (const [key, value] of editedScores) {
        const [ceId, aId] = key.split('|');
        if (!ceId || !aId) continue;
        const row = base.scores[ceId];
        if (row) row[aId] = value;
      }
      return base;
    },

    async saveScores(edits: ScoreEdit[]) {
      for (const e of edits) {
        editedScores.set(`${e.classEnrollmentId}|${e.assessmentId}`,
          { raw: e.raw, isExcused: e.isExcused });
      }
      return { written: edits.length };
    },

    async getSf10() {
      // Static import, not dynamic: a dynamic one emits a second chunk,
      // which the single-file staging build cannot inline and which then
      // 404s at runtime. The fixture is a couple of kilobytes.
      return SF10_FIXTURE;
    },
  };
}
