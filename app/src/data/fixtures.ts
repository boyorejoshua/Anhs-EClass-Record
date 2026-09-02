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
  AcademicYear, AttendanceDay, AttendanceMark, ClassStudent, ClassSummary, ConsolidatedGradeCell,
  CurrentUser, DirectoryStudent, GradebookData, GradeLevelCensus, PersistedGrade,
  RosterStudent, StaffAccount, StudentQuery,
  StudentGradeRow,
  EnrollmentRow, StudentHistoryRow, StudentIdentity, StudentProfile, SubmissionRow,
  SubmissionStatus, ValidationReport,
} from './types';
import { DO015_CORE, DO015_MAPEH } from '../lib/grading/fixtures';
import type { Assessment } from '../lib/grading';
import { compute } from '../lib/grading';
import { TRANSITIONS } from '../lib/status';

export const YEAR_TRIMESTER: AcademicYear = {
  id: 'year-anhs',
  label: '2026-2027',
  periodStructure: 'three_term',
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
  // Nothing has been set up in Term 3, so there is nothing to score.
  if (periodId === UNSTARTED_PERIOD) return scores;
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

  // ONE learner with nothing scored at all in Term 2 — a late
  // transfer-in, which every class has. Without this the fixtures gave
  // every learner a computable grade in every period, so `ungraded` was
  // permanently 0 and the whole "missing grades" half of Analytics
  // never rendered: not because it was broken, but because the demo
  // data could not produce the state it exists for.
  if (periodId === 'p2') {
    const late = scores['ce-5'];
    if (late) for (const item of ASSESSMENTS) late[item.id] = { raw: null, isExcused: false };
  }
  return scores;
}

export const CLASSES: ClassSummary[] = [
  {
    id: 'c-math10-pearl', gradeLevel: 'Grade 10', section: 'Pearl',
    subject: 'Mathematics 10', subjectCode: 'MATH10', studentCount: ROSTER.length,
    scheduleNote: 'MWF 8:00-9:00', room: 'Room 204',
    status: { p1: 'published', p2: 'draft', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 200, total: 200 }, p2: { scored: 142, total: 200 }, p3: { scored: 0, total: 200 } },
  },
  {
    id: 'c-math10-diamond', gradeLevel: 'Grade 10', section: 'Diamond',
    subject: 'Mathematics 10', subjectCode: 'MATH10', studentCount: 18,
    scheduleNote: 'MWF 9:00-10:00', room: 'Room 204',
    status: { p1: 'published', p2: 'submitted', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 180, total: 180 }, p2: { scored: 180, total: 180 }, p3: { scored: 0, total: 180 } },
  },
  {
    id: 'c-math9-ruby', gradeLevel: 'Grade 9', section: 'Ruby',
    subject: 'Mathematics 9', subjectCode: 'MATH9', studentCount: 19,
    scheduleNote: 'TTh 10:00-11:30', room: 'Room 201',
    status: { p1: 'published', p2: 'returned', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 190, total: 190 }, p2: { scored: 165, total: 190 }, p3: { scored: 0, total: 190 } },
  },
  {
    id: 'c-mapeh10-pearl', gradeLevel: 'Grade 10', section: 'Pearl',
    subject: 'MAPEH 10', subjectCode: 'MAPEH10', studentCount: ROSTER.length,
    scheduleNote: 'TTh 13:00-14:00', room: 'Gym',
    status: { p1: 'published', p2: 'draft', p3: 'draft' },
    receipts: {},
    completeness: { p1: { scored: 200, total: 200 }, p2: { scored: 0, total: 200 }, p3: { scored: 0, total: 200 } },
  },
];

/**
 * Assessments an import created, keyed by `classId|periodId`.
 *
 * Held apart from ASSESSMENTS, which is the shape every fixture class
 * ships with. An import into Term 3 of one class must not grow a column
 * in every other class's Term 1 — which is exactly what appending to
 * the shared list would do, and the demo would then show a teacher
 * columns they never created.
 *
 * `buildScores` does not know about these, so an imported assessment
 * has no seeded mark. Its only values are the ones the import wrote.
 */
const importedAssessments = new Map<string, Assessment[]>();

/**
 * Term 3 has not been set up yet — no assessments, in any class.
 *
 * This is the shape the production demonstration dataset actually has
 * (`supabase/demo-seed.sql` seeds Terms 1 and 2 and stops), and until
 * the fixtures matched it, demo mode gave every term a full set of
 * marks. That made the one state most likely to embarrass a
 * demonstration — a term nobody has started — the only state that was
 * never once rendered. An empty period is not an error; it has to say
 * so on screen.
 */
const UNSTARTED_PERIOD = 'p3';

function assessmentsFor(classId: string, periodId: string): Assessment[] {
  const base = periodId === UNSTARTED_PERIOD ? [] : ASSESSMENTS;
  return [...base, ...(importedAssessments.get(`${classId}|${periodId}`) ?? [])];
}

export function getGradebook(classId: string, periodId: string): GradebookData {
  const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
  const status = cls.status[periodId] ?? 'draft';
  return {
    classId,
    periodId,
    // MAPEH carries 20/60/20; everything else 20/50/30. Scheme comes
    // from the subject category, never from a constant in the screen.
    scheme: cls.subjectCode.startsWith('MAPEH') ? DO015_MAPEH : DO015_CORE,
    assessments: assessmentsFor(classId, periodId),
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
import type {
  DataSource, ImportRecord, ImportResult, ScoreEdit, SessionContext,
} from './source';
import type {
  ImportPlan, ImportResolution, ResolvedComponent, ResolvedLearner,
} from '../lib/import/plan';
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

/* ==================================================================== *
 * THE STUDENT STORE
 *
 * Two arrays, deliberately, mirroring the two tables. A section transfer
 * edits an ENROLMENT row; the STUDENT row is untouched. Holding them as
 * one object here would let a demo do the thing the schema exists to
 * prevent.
 * ==================================================================== */

const GRADE_LEVELS = [
  { id: 'gl-7',  name: 'Grade 7',  ordinal: 7,  keyStage: 'KS3' },
  { id: 'gl-8',  name: 'Grade 8',  ordinal: 8,  keyStage: 'KS3' },
  { id: 'gl-9',  name: 'Grade 9',  ordinal: 9,  keyStage: 'KS3' },
  { id: 'gl-10', name: 'Grade 10', ordinal: 10, keyStage: 'KS3' },
  // Senior High. Empty on purpose: a school that has just been given
  // Grades 11 and 12 has nobody in them yet, and the directory has to
  // render that honestly — an empty grade level is a state, not a bug.
  { id: 'gl-11', name: 'Grade 11', ordinal: 11, keyStage: 'SHS' },
  { id: 'gl-12', name: 'Grade 12', ordinal: 12, keyStage: 'SHS' },
];

interface FixtureSection {
  id: string; name: string; gradeLevelId: string; gradeLevel: string;
  adviserUserId: string | null; room: string | null; capacity: number | null;
  academicYearId: string;
}
const SECTIONS: FixtureSection[] = [
  // Pearl's adviser is the fixture's own signed-in identity, the same
  // way Juan Dela Cruz advises Pearl on the real ANHS data — otherwise
  // Consolidated Grades would have no section to demonstrate against.
  { id: 'sec-pearl',   name: 'Pearl',   gradeLevelId: 'gl-10', gradeLevel: 'Grade 10', adviserUserId: CURRENT_USER.id, room: 'Room 204', capacity: 40, academicYearId: 'year-anhs' },
  { id: 'sec-diamond', name: 'Diamond', gradeLevelId: 'gl-10', gradeLevel: 'Grade 10', adviserUserId: null, room: 'Room 205', capacity: 40, academicYearId: 'year-anhs' },
  { id: 'sec-ruby',    name: 'Ruby',    gradeLevelId: 'gl-9',  gradeLevel: 'Grade 9',  adviserUserId: null, room: 'Room 201', capacity: 40, academicYearId: 'year-anhs' },
];

/** The subjects a "create class" form offers. */
/**
 * The school's subject categories.
 *
 * Each carries a grading scheme, which is the whole reason the category
 * is a required choice when adding a subject rather than a defaulted
 * one: filing GMRC under Core grades it 20/50/30, under MAPEH/TLE it is
 * 20/60/20, and nobody would notice the difference until the term
 * grades came out wrong.
 */
const FIXTURE_CATEGORIES = [
  { id: 'cat-core',  code: 'CORE',  name: 'Core Subject',      scheme: DO015_CORE },
  { id: 'cat-mapeh', code: 'MAPEH', name: 'MAPEH / EPP-TLE',   scheme: DO015_MAPEH },
];

interface FixtureSubject {
  id: string; code: string; title: string;
  categoryId: string; units: number | null; isActive: boolean;
}

/** Mutable: the administrator can add to this from School Setup. */
const FIXTURE_SUBJECTS: FixtureSubject[] = [
  { id: 'sub-math10', code: 'MATH10', title: 'Mathematics 10', categoryId: 'cat-core',  units: 1, isActive: true },
  { id: 'sub-math9',  code: 'MATH9',  title: 'Mathematics 9',  categoryId: 'cat-core',  units: 1, isActive: true },
  { id: 'sub-mapeh10', code: 'MAPEH10', title: 'MAPEH 10',     categoryId: 'cat-mapeh', units: 1, isActive: true },
  { id: 'sub-eng10',  code: 'ENG10',  title: 'English 10',     categoryId: 'cat-core',  units: 1, isActive: true },
  { id: 'sub-sci10',  code: 'SCI10',  title: 'Science 10',     categoryId: 'cat-core',  units: 1, isActive: true },
  // Two subjects that are NOT Grade 10, because a demo where every
  // subject belongs to one grade cannot show what the curriculum map is
  // for. Filipino is deliberately left unmapped below — it is the
  // "offered at every grade" state, which the screens have to render as
  // a state rather than as missing data.
  { id: 'sub-ap7',    code: 'AP7',    title: 'Araling Panlipunan 7', categoryId: 'cat-core', units: 1, isActive: true },
  { id: 'sub-fil',    code: 'FIL',    title: 'Filipino',       categoryId: 'cat-core',  units: 1, isActive: true },
];
const INITIAL_SUBJECT_COUNT = FIXTURE_SUBJECTS.length;

/**
 * The curriculum map — which subjects are taught at which grade.
 *
 * Mirrors `grade_level_subjects`, keyed by subject. The seeded subjects
 * all carry their grade in the name (MATH10, SCI10), so they map to
 * Grade 10; anything unmapped is offered at every grade, exactly as the
 * server reads an empty set.
 */
const CURRICULUM = new Map<string, string[]>([
  ['sub-math10', ['gl-10']],
  ['sub-math9', ['gl-9']],
  ['sub-mapeh10', ['gl-10']],
  ['sub-eng10', ['gl-10']],
  ['sub-sci10', ['gl-10']],
  ['sub-ap7', ['gl-7']],
  // 'sub-fil' is absent on purpose — unmapped means every grade.
]);
const INITIAL_CURRICULUM = new Map(
  [...CURRICULUM].map(([k, v]) => [k, [...v]] as const));

/** Distinct, and in grade order — the server returns the map sorted. */
const dedupeLevels = (ids: string[]) =>
  GRADE_LEVELS.filter((g) => ids.includes(g.id)).map((g) => g.id);

/** The shape both class-setup forms read: what grades offer this subject. */
const offeredSubjects = () => FIXTURE_SUBJECTS
  .filter((x) => x.isActive)
  .map((x) => ({
    id: x.id, code: x.code, title: x.title,
    gradeLevelIds: [...(CURRICULUM.get(x.id) ?? [])],
  }))
  .sort((a, b) => a.title.localeCompare(b.title));

/* ==================================================================== *
 * THE STAFF STORE
 *
 * Mirrors the four seeded ANHS accounts (supabase/seed.sql), so the
 * accounts screens demonstrate against a directory rather than against
 * a single signed-in person.
 *
 * `roles` is an ARRAY on purpose. Juan holds teacher AND adviser — the
 * arrangement V0's mutually exclusive role CHECK could not express at
 * all, and the most common one in a Philippine high school.
 * ==================================================================== */
const STAFF: StaffAccount[] = [
  {
    id: CURRENT_USER.id, email: 'maria@anhs.test', employeeId: 'EMP-003',
    firstName: 'Maria', middleName: null, lastName: 'Santos', suffix: null,
    status: 'active', mustChangePassword: false, lastLoginAt: '2026-08-26T23:12:00Z',
    position: 'Teacher III', isSelf: true, roles: ['teacher'],
  },
  {
    id: 'u-juan', email: 'juan@anhs.test', employeeId: 'EMP-004',
    firstName: 'Juan', middleName: null, lastName: 'Dela Cruz', suffix: null,
    status: 'active', mustChangePassword: false, lastLoginAt: '2026-08-27T01:40:00Z',
    position: 'Teacher II', isSelf: false, roles: ['adviser', 'teacher'],
  },
  {
    id: 'u-ana', email: 'registrar@anhs.test', employeeId: 'EMP-002',
    firstName: 'Ana', middleName: null, lastName: 'Reyes', suffix: null,
    status: 'active', mustChangePassword: false, lastLoginAt: '2026-08-26T08:05:00Z',
    position: 'Registrar II', isSelf: false, roles: ['registrar'],
  },
  {
    id: 'u-elena', email: 'admin@anhs.test', employeeId: 'EMP-001',
    firstName: 'Elena', middleName: null, lastName: 'Cruz', suffix: null,
    status: 'active', mustChangePassword: false, lastLoginAt: '2026-08-27T02:20:00Z',
    position: 'School Principal IV', isSelf: false, roles: ['school_admin'],
  },
];
const INITIAL_STAFF_COUNT = STAFF.length;
/** Deep enough: `roles` is the only nested value, and it is a string[]. */
const INITIAL_STAFF = STAFF.map((u) => ({ ...u, roles: [...u.roles] }));

/** The school's role catalogue, as seeded. */
const FIXTURE_ROLES = [
  { code: 'adviser',      name: 'Class Adviser' },
  { code: 'principal',    name: 'Principal' },
  { code: 'registrar',    name: 'Registrar' },
  { code: 'school_admin', name: 'School Administrator' },
  { code: 'student',      name: 'Student' },
  { code: 'teacher',      name: 'Subject Teacher' },
];

/**
 * Derived from STAFF rather than listed separately, so "who works here"
 * has ONE definition. A second hand-written list would drift the moment
 * an account was added through the Users screen — and the new teacher
 * would be missing from the very dropdown that assigns them a class.
 */
const teachingStaff = () => STAFF
  .filter((u) => u.status === 'active'
    && (u.roles.includes('teacher') || u.roles.includes('adviser')))
  .map((u) => ({ id: u.id, displayName: `${u.lastName}, ${u.firstName}` }));

const STUDENTS: StudentIdentity[] = ROSTER.map((r, i) => ({
  studentId: r.studentId,
  displayName: r.displayName,
  firstName: r.displayName.split(', ')[1] ?? r.displayName,
  middleName: null,
  lastName: r.displayName.split(', ')[0] ?? r.displayName,
  suffix: null,
  studentNumber: `2026-${String(i + 1).padStart(4, '0')}`,
  lrn: `1367890100${String(i + 1).padStart(2, '0')}`,
  sex: i % 2 === 0 ? 'male' : 'female',
  birthDate: null, birthPlace: null, motherTongue: null, religion: null,
  addressLine: null, barangay: null, municipality: null, province: null,
  contactNumber: null, email: null,
  status: 'active', hasPortalAccount: false,
}));

type StoredEnrolment = EnrollmentRow & { studentId: string };

const ENROLMENTS: StoredEnrolment[] = ROSTER.map((r, i) => ({
  studentId: r.studentId,
  enrollmentId: `en-${i}`,
  academicYearId: 'year-anhs',
  academicYear: '2026-2027',
  yearStatus: 'active',
  gradeLevel: 'Grade 10', gradeLevelId: 'gl-10',
  section: 'Pearl', sectionId: 'sec-pearl',
  status: 'enrolled', promotionStatus: null, generalAverage: null,
  dateEnrolled: '2026-06-08',
}));

/*
 * Learners who are NOT in the Grade 10 Pearl class the rest of these
 * fixtures are built around.
 *
 * Without them every learner in the demo sits in one grade level, and a
 * screen whose whole job is "choose a grade level" has exactly one
 * button that does nothing observable. That is the shape of fixture
 * that has now hidden five separate real features in this codebase, so:
 * two in Grade 9 Ruby, and one in Grade 7 with no section at all —
 * because a learner admitted before sectioning is a real state the
 * registrar sees, and it should not be the one case nobody tried.
 */
const OFF_ROSTER: Array<{
  studentId: string; displayName: string; studentNumber: string; lrn: string | null;
  sex: string; gradeLevelId: string; gradeLevel: string;
  sectionId: string | null; section: string | null;
}> = [
  { studentId: 'st-r1', displayName: 'Ilagan, Marife Uy', studentNumber: '2026-0101',
    lrn: '136789010101', sex: 'female',
    gradeLevelId: 'gl-9', gradeLevel: 'Grade 9', sectionId: 'sec-ruby', section: 'Ruby' },
  { studentId: 'st-r2', displayName: 'Sarmiento, Elias Tan', studentNumber: '2026-0102',
    lrn: '136789010102', sex: 'male',
    gradeLevelId: 'gl-9', gradeLevel: 'Grade 9', sectionId: 'sec-ruby', section: 'Ruby' },
  { studentId: 'st-g7', displayName: 'Domingez, Philip G', studentNumber: '2026-0103',
    lrn: null, sex: 'male',
    gradeLevelId: 'gl-7', gradeLevel: 'Grade 7', sectionId: null, section: null },
];

for (const o of OFF_ROSTER) {
  STUDENTS.push({
    studentId: o.studentId, displayName: o.displayName,
    firstName: o.displayName.split(', ')[1] ?? o.displayName,
    middleName: null,
    lastName: o.displayName.split(', ')[0] ?? o.displayName,
    suffix: null,
    studentNumber: o.studentNumber, lrn: o.lrn, sex: o.sex,
    birthDate: null, birthPlace: null, motherTongue: null, religion: null,
    addressLine: null, barangay: null, municipality: null, province: null,
    contactNumber: null, email: null,
    status: 'active', hasPortalAccount: false,
  });
  ENROLMENTS.push({
    studentId: o.studentId, enrollmentId: `en-${o.studentId}`,
    academicYearId: 'year-anhs', academicYear: '2026-2027', yearStatus: 'active',
    gradeLevel: o.gradeLevel, gradeLevelId: o.gradeLevelId,
    section: o.section, sectionId: o.sectionId,
    status: 'enrolled', promotionStatus: null, generalAverage: null,
    dateEnrolled: '2026-06-08',
  });
}

/**
 * The directory view: one row per ENROLMENT in the chosen year.
 *
 * The filtering happens HERE rather than in the screen, because against
 * the real database it happens in Postgres — and a fixture that hands
 * back everything and lets the caller narrow it would let a broken
 * filter pass every test.
 */
function directory(yearId: string, query?: StudentQuery): DirectoryStudent[] {
  const needle = query?.search?.trim().toLowerCase() ?? '';
  return ENROLMENTS
    .filter((e) => e.academicYearId === yearId)
    .filter((e) => !query?.gradeLevelId || e.gradeLevelId === query.gradeLevelId)
    .filter((e) => !query?.sectionId || e.sectionId === query.sectionId)
    .map((e) => {
      const st = STUDENTS.find((x) => x.studentId === e.studentId)!;
      return {
        studentId: st.studentId, displayName: st.displayName,
        studentNumber: st.studentNumber, lrn: st.lrn, sex: st.sex,
        gradeLevelId: e.gradeLevelId ?? '', gradeLevel: e.gradeLevel,
        sectionId: e.sectionId ?? null, section: e.section,
        enrollmentStatus: e.status, generalAverage: e.generalAverage,
      };
    })
    .filter((r) => !needle
      || r.displayName.toLowerCase().includes(needle)
      || (r.lrn ?? '').toLowerCase().includes(needle)
      || (r.studentNumber ?? '').toLowerCase().includes(needle))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, query?.limit ?? 500);
}

/** Grade levels with a live count, matching rds.grade_level_census. */
function gradeLevelCensus(yearId: string): GradeLevelCensus[] {
  return GRADE_LEVELS.map((g) => ({
    id: g.id, code: `G${g.ordinal}`, name: g.name, ordinal: g.ordinal,
    keyStage: g.keyStage,
    enrolled: ENROLMENTS.filter((e) => e.academicYearId === yearId
      && e.gradeLevelId === g.id
      && (e.status === 'enrolled' || e.status === 'transferred_in')).length,
    sections: SECTIONS.filter((sec) => sec.academicYearId === yearId
      && sec.gradeLevelId === g.id).length,
  })).sort((a, b) => a.ordinal - b.ordinal);
}

/** Mutable in-memory scores, so edits persist for the length of a session. */
const editedScores = new Map<string, { raw: number | null; isExcused: boolean }>();

/**
 * The chain of custody, per `classId|periodId`.
 *
 * Kept beside the status rather than derived from it, because a receipt
 * is a fact about the past: once the adviser has signed for a record,
 * that stays true through a later return and resubmission. The status
 * says where the record IS; these say where it has BEEN.
 */
const receipts = new Map<string, {
  receivedAt: string | null;
  forwardedAt: string | null;
  registrarReceivedAt: string | null;
}>();

function receiptsFor(classId: string, periodId: string) {
  const key = `${classId}|${periodId}`;
  let r = receipts.get(key);
  if (!r) { r = { receivedAt: null, forwardedAt: null, registrarReceivedAt: null }; receipts.set(key, r); }
  return r;
}

/**
 * Per-class rosters, so a class can genuinely be EMPTY.
 *
 * The fixtures used to hand every class the same shared ROSTER sliced
 * to `studentCount`, which made it impossible to reproduce the one
 * state that matters here: a class created in a brand-new section has
 * nobody in it. That is exactly the dead end migration 0033 exists to
 * close, so the fixture has to be able to express it or the e2e test
 * proves nothing.
 *
 * Seeded classes fall back to the shared ROSTER lazily; a class created
 * in a NEW section is registered with an empty list up front.
 */
const classRosters = new Map<string, RosterStudent[]>();

function rosterFor(classId: string): RosterStudent[] {
  let list = classRosters.get(classId);
  if (!list) {
    const cls = CLASSES.find((c) => c.id === classId);
    list = ROSTER.slice(0, cls?.studentCount ?? 0);
    classRosters.set(classId, list);
  }
  return list;
}

/** `classId|periodId` -> classEnrollmentId -> the grade as recorded at submission. */
const persistedGrades = new Map<string, Record<string, PersistedGrade>>();

/**
 * The fixtures' stand-in for `record_period_grades`.
 *
 * It calls the SAME engine the server's Edge Function calls, in the same
 * FINAL mode, for the same reason: at submission an unscored assessment
 * is a zero, because that is what the teacher is certifying. If this
 * used the running mode the gradebook displays, a demo would show one
 * number on screen and store another.
 */
function recordPeriodGrades(gb: GradebookData): void {
  const rows: Record<string, PersistedGrade> = {};
  // ONE stamp for the whole run. Postgres `now()` is transaction-stable,
  // so a real batch shares a single computed_at and the Summary tab can
  // say "filed at 10:04". Stamping each learner separately here would
  // produce twenty timestamps a millisecond apart and suppress it.
  const computedAt = new Date().toISOString();
  for (const learner of gb.roster) {
    const cells = gb.scores[learner.classEnrollmentId] ?? {};
    const result = compute(
      gb.scheme,
      gb.assessments,
      gb.assessments.map((a) => ({
        assessmentId: a.id,
        raw: cells[a.id]?.raw ?? null,
        isExcused: cells[a.id]?.isExcused ?? false,
      })),
      { includeUnscored: true },
    );
    const previous = persistedGrades.get(`${gb.classId}|${gb.periodId}`)
      ?.[learner.classEnrollmentId];
    rows[learner.classEnrollmentId] = {
      initialGrade: result.initialGrade,
      periodGrade: result.periodGrade,
      descriptor: result.descriptor,
      remark: result.remark,
      passed: result.passed,
      computedAt,
      computedMode: 'final',
      version: (previous?.version ?? 0) + 1,
      componentBreakdown: result.components,
    };
  }
  persistedGrades.set(`${gb.classId}|${gb.periodId}`, rows);
}

const INITIAL_STUDENT_COUNT = STUDENTS.length;
const INITIAL_ENROLMENT_COUNT = ENROLMENTS.length;
const INITIAL_ROSTER_COUNT = ROSTER.length;
const INITIAL_SECTION_COUNT = SECTIONS.length;
const INITIAL_CLASSES_COUNT = CLASSES.length;

/** Import history, newest last. Reset with everything else. */
const importBatches: ImportRecord[] = [];

/**
 * The shape the Import Center hands to `resolveImport`. It is the
 * parser's output, so the fixture reads the same payload the server
 * does — a fixture that accepted a friendlier shape would let a real
 * mismatch go unnoticed until the school hit it.
 */
interface ImportWorkbookInput {
  identity?: {
    gradeLevelText?: string | null;
    sectionText?: string | null;
    subjectText?: string | null;
  };
  /** What the person chose when the workbook could not resolve itself. */
  overrides?: {
    gradeLevelId?: string;
    sectionId?: string;
    subjectId?: string;
  };
  roster?: { row: number; raw: string; sex?: 'male' | 'female' }[];
  terms?: {
    ordinal: number;
    components?: {
      key: 'WW' | 'PT' | 'EX';
      items?: {
        code: string; highestPossibleScore: number; childComponentCode: string | null;
      }[];
    }[];
  }[];
}

/** Comparison only. The stored name keeps its original form. */
function normaliseName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
}

/**
 * Match a workbook to one of the seeded classes on grade, section and
 * subject — the same tuple the database is unique on, so the demo and
 * the server agree about what "the same class" means.
 */
/**
 * Which class this workbook is for.
 *
 * A CHOICE BEATS THE FILE. Everything the resolver reports as
 * unresolved is meant to be answerable from the preview, and if the
 * fixture ignored `overrides` the picker would appear to do nothing in
 * demo mode — the fifth kind of lying fixture in this codebase.
 */
function resolveFixtureClass(wb: ImportWorkbookInput) {
  const want = (v: string | null | undefined) => normaliseName(v ?? '');
  // The official DepEd workbook writes the grade level as a bare 9.
  const num = (v: string | null | undefined) => {
    const d = String(v ?? '').replace(/\D/g, '');
    return d ? Number(d) : null;
  };

  const ov = wb.overrides ?? {};
  const chosenGrade = ov.gradeLevelId
    ? GRADE_LEVELS.find((g) => g.id === ov.gradeLevelId)?.name : null;
  const chosenSection = ov.sectionId
    ? SECTIONS.find((x) => x.id === ov.sectionId)?.name : null;
  const chosenSubject = ov.subjectId
    ? FIXTURE_SUBJECTS.find((x) => x.id === ov.subjectId) : null;

  const gradeText = chosenGrade ?? wb.identity?.gradeLevelText;
  const sectionText = chosenSection ?? wb.identity?.sectionText;
  const gnum = num(gradeText);

  return CLASSES.find((c) =>
    (want(c.gradeLevel) === want(gradeText)
      || (gnum !== null && num(c.gradeLevel) === gnum))
    && want(c.section) === want(sectionText)
    && (chosenSubject
      ? (want(c.subject) === want(chosenSubject.title)
         || want(c.subjectCode) === want(chosenSubject.code))
      : (want(c.subject) === want(wb.identity?.subjectText)
         || want(c.subjectCode) === want(wb.identity?.subjectText))));
}

/** Every period's status as the fixture ships, so a reset is exact. */
const INITIAL_STATUS: Array<Record<string, SubmissionStatus>> =
  CLASSES.map((c) => ({ ...c.status }));

/**
 * Put the mutable fixture state back where it started.
 *
 * CLASSES, `receipts`, `editedScores` and `persistedGrades` are all
 * module-level, so without this a test that submits a period leaves it
 * submitted for every test after it — which is exactly what happened:
 * `beforeEach(() => source = createFixtureSource())` looked like
 * isolation and provided none. The app builds the source once
 * (data/index.ts memoises it), so resetting here costs nothing there.
 */
/**
 * The enrolment event log.
 *
 * Mirrors `public.enrollment_events`. Kept separate from the audit trail
 * for the same reason the database keeps them apart: this is the
 * academic record of where a learner was, and SF10 is built from it.
 */
interface StoredEvent {
  id: string;
  seq: number;
  enrollmentId: string;
  studentId: string;
  academicYear: string;
  eventType: string;
  eventDate: string;
  from: string | null;
  to: string | null;
  notes: string | null;
  recordedAt: string;
  recordedBy: string | null;
}
const EVENTS: StoredEvent[] = [];
/**
 * A strict insertion order, because two events written together share a
 * date and a timestamp. Mirrors the `seq` identity column 0041 adds for
 * exactly the same reason: `now()` is transaction time, so enrolling a
 * learner into a section stamps both of its events identically.
 */
let eventSeq = 0;

const today = () => new Date().toISOString().slice(0, 10);

function recordEvent(
  enrollmentId: string, eventType: string,
  from: string | null, to: string | null,
  notes: string | null, eventDate?: string | null,
): void {
  const en = ENROLMENTS.find((e) => e.enrollmentId === enrollmentId);
  if (!en) return;
  eventSeq += 1;
  EVENTS.push({
    id: `ev-${Date.now()}-${EVENTS.length}`,
    seq: eventSeq,
    enrollmentId, studentId: en.studentId,
    academicYear: en.academicYear,
    eventType, eventDate: eventDate || today(),
    from, to, notes: notes?.trim() || null,
    recordedAt: new Date().toISOString(),
    recordedBy: CURRENT_USER.name,
  });
}

function resetFixtureState(): void {
  CLASSES.forEach((c, i) => { c.status = { ...INITIAL_STATUS[i]! }; });
  FIXTURE_SUBJECTS.length = INITIAL_SUBJECT_COUNT;
  CURRICULUM.clear();
  for (const [k, v] of INITIAL_CURRICULUM) CURRICULUM.set(k, [...v]);
  FIXTURE_SUBJECTS.forEach((x) => { x.isActive = true; });
  STUDENTS.length = INITIAL_STUDENT_COUNT;
  ENROLMENTS.length = INITIAL_ENROLMENT_COUNT;
  EVENTS.length = 0;
  eventSeq = 0;
  receipts.clear();
  editedScores.clear();
  persistedGrades.clear();
  classRosters.clear();
  importedAssessments.clear();
  importBatches.length = 0;
  ROSTER.length = INITIAL_ROSTER_COUNT;
  SECTIONS.length = INITIAL_SECTION_COUNT;
  CLASSES.length = INITIAL_CLASSES_COUNT;
  STAFF.length = INITIAL_STAFF_COUNT;
  // Truncating the array puts the added accounts back, but the seeded
  // four are mutated in place by role, status and profile edits — so
  // those have to be restored field by field.
  STAFF.forEach((u, i) => Object.assign(u, INITIAL_STAFF[i]!));
}

export function createFixtureSource(): DataSource {
  resetFixtureState();

  // Named, not returned inline, so the methods below can call each other
  // by name. They used to use `this` — which broke the moment App passed
  // a method to a screen as a bare reference (`submitGrades={source.submitGrades}`),
  // because a detached method has no receiver. Submitting a period in
  // demo mode failed with "Cannot read properties of undefined" and the
  // teacher saw an error where a submission should have been.
  const src: DataSource = {
    kind: 'fixtures',

    /**
     * A FRESH object each call, like any real remote source.
     *
     * It used to return the shared FIXTURE_SESSION reference. Anything
     * that re-read the session to pick up a change — the school name
     * after School Setup saves it — got back an object React considered
     * identical, bailed out of the render, and showed the old value
     * with no error. Against Supabase this never happened, because a
     * network read cannot return the same object twice; so the bug
     * existed only in the fixture, which is exactly the kind that ships.
     */
    async getSession() { return structuredClone(FIXTURE_SESSION); },
    async signIn() { /* no auth against fixtures */ },
    async signOut() { /* no-op */ },
    onAuthChange() { return () => {}; },

    /**
     * Receipts are stamped into their own map by the transitions below,
     * then merged in here — the same shape `rds.classes` returns. If they
     * were only stored on CLASSES the demo would show a chain of custody
     * that never moved.
     */
    async getClasses() {
      // A DEEP copy, deliberately. A shallow spread leaves `status`
      // pointing at the same mutable object every caller shares, so a
      // stale cached list appears to track live status changes while its
      // other fields quietly do not — which is exactly the bug that hid
      // a stale receipts map behind a correct-looking badge. A real
      // fetch returns a snapshot; so does this.
      return CLASSES.map((c) => ({
        ...c,
        status: { ...c.status },
        completeness: { ...c.completeness },
        receipts: Object.fromEntries(
          Object.keys(c.status)
            .filter((pid) => receipts.has(`${c.id}|${pid}`))
            .map((pid) => [pid, { ...receiptsFor(c.id, pid), recalledAt: null }]),
        ),
      }));
    },

    async getGradebook(classId, periodId) {
      const base = getGradebook(classId, periodId);
      // Replay edits made this session so the grid does not appear to
      // discard work when a period is switched and switched back.
      for (const [key, value] of editedScores) {
        const [ceId, aId] = key.split('|');
        if (!ceId || !aId) continue;
        // A period that began with NO scores has no row to write into,
        // and `if (row)` then dropped the edit on the floor: every mark
        // an import or a teacher entered into an unstarted term
        // vanished, silently, because the grid just rendered blank.
        //
        // The guard's real job is to ignore an edit for somebody who is
        // not on THIS period's roster, so that is what it now checks.
        let row = base.scores[ceId];
        if (!row) {
          if (!base.roster.some((r) => r.classEnrollmentId === ceId)) continue;
          row = base.scores[ceId] = {};
        }
        row[aId] = value;
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

    async getClassStudents(classId) {
      const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      return ROSTER.slice(0, cls.studentCount).map((r, i) => ({
        classEnrollmentId: r.classEnrollmentId,
        enrollmentId: `en-${i + 1}`,
        studentId: r.studentId,
        displayName: r.displayName,
        studentNumber: `2026-${String(i + 1).padStart(4, '0')}`,
        lrn: `1367890100${String(i + 1).padStart(2, '0')}`,
        sex: i % 2 === 0 ? 'male' : 'female',
        enrollmentStatus: 'enrolled',
        classStatus: 'active',
        finalGrade: null,
      })) satisfies ClassStudent[];
    },

    async getStudents(yearId, query) {
      return directory(yearId, query);
    },

    /* ---- the subject catalogue ------------------------------------ *
     * `canWrite` is true here because the fixture source has no notion
     * of the signed-in role — the demo switcher changes the MENU and
     * never what the data layer returns, exactly as the sidebar note
     * says. The refusal path (registrar reads, cannot write) is tested
     * against real Postgres, where the permission actually lives.
     * ---------------------------------------------------------------- */
    async getSubjectCatalogue() {
      return {
        categories: FIXTURE_CATEGORIES.map((c) => ({
          id: c.id, code: c.code, name: c.name,
          weights: c.scheme.components
            .filter((x) => !x.parentId)
            .map((x) => `${x.code} ${Math.round(x.weight)}%`)
            .join(' · '),
        })),
        gradeLevels: GRADE_LEVELS.map(
          (g) => ({ id: g.id, name: g.name, ordinal: g.ordinal })),
        subjects: FIXTURE_SUBJECTS.map((x) => {
          const ids = CURRICULUM.get(x.id) ?? [];
          return {
            id: x.id, code: x.code, title: x.title,
            categoryId: x.categoryId,
            category: FIXTURE_CATEGORIES.find((c) => c.id === x.categoryId)?.name ?? '',
            units: x.units,
            isActive: x.isActive,
            classCount: CLASSES.filter((c) => c.subjectCode === x.code).length,
            gradeLevelIds: [...ids],
            // Null, not "", when unmapped: the screen says "every grade"
            // there, and an empty string would read as missing data.
            gradeLevels: ids.length === 0 ? null
              : GRADE_LEVELS.filter((g) => ids.includes(g.id))
                  .map((g) => g.name).join(', '),
          };
        }).sort((a, b) => a.title.localeCompare(b.title)),
        permissions: { canWrite: true },
      };
    },

    async createSubject(_yearId, draft) {
      const code = draft.code.trim().toUpperCase();
      const title = draft.title.trim();
      if (!code) throw new Error('A subject needs a code.');
      if (!title) throw new Error('A subject needs a title.');
      if (!FIXTURE_CATEGORIES.some((c) => c.id === draft.categoryId)) {
        throw new Error('That subject category does not belong to this school.');
      }
      // Case-insensitively, the way the server does it — otherwise the
      // demo would accept "gmrc" beside "GMRC" and the duplicate guard
      // would look broken the first time it mattered.
      const clash = FIXTURE_SUBJECTS.find(
        (x) => normaliseName(x.code) === normaliseName(code)
            || normaliseName(x.title) === normaliseName(title));
      if (clash) {
        throw new Error(`This school already has that subject (${clash.code} — ${clash.title}).`);
      }
      const id = `sub-${Date.now()}-${FIXTURE_SUBJECTS.length}`;
      FIXTURE_SUBJECTS.push({
        id, code, title, categoryId: draft.categoryId,
        units: draft.units ?? null, isActive: true,
      });
      const levels = draft.gradeLevelIds ?? [];
      if (levels.length) CURRICULUM.set(id, dedupeLevels(levels));
      return id;
    },

    async setSubjectActive(subjectId, isActive) {
      const found = FIXTURE_SUBJECTS.find((x) => x.id === subjectId);
      if (!found) throw new Error('No such subject in this school.');
      found.isActive = isActive;
    },

    // The whole set, not a delta: ticking Grade 7 and unticking Grade 9
    // is one call carrying what the subject is taught at afterwards.
    async setSubjectGradeLevels(subjectId, _yearId, gradeLevelIds) {
      if (!FIXTURE_SUBJECTS.some((x) => x.id === subjectId)) {
        throw new Error('No such subject in this school.');
      }
      const unknown = gradeLevelIds.find(
        (id) => !GRADE_LEVELS.some((g) => g.id === id));
      if (unknown) {
        throw new Error('One of those grade levels does not belong to this school.');
      }
      if (gradeLevelIds.length === 0) CURRICULUM.delete(subjectId);
      else CURRICULUM.set(subjectId, dedupeLevels(gradeLevelIds));
    },

    async getGradeLevelCensus(yearId) {
      return gradeLevelCensus(yearId);
    },

    async getStudentRecord(studentId) {
      const st = STUDENTS.find((x) => x.studentId === studentId);
      if (!st) return null;
      return {
        student: st,
        history: ENROLMENTS
          .filter((e) => e.studentId === studentId)
          .map(({ studentId: _s, ...row }) => row)
          .sort((a, b) => b.academicYear.localeCompare(a.academicYear)),
        grades: [],
      };
    },

    async getEnrollmentOptions(yearId) {
      return {
        gradeLevels: GRADE_LEVELS,
        sections: SECTIONS.filter((sec) => sec.academicYearId === yearId)
          .map(({ academicYearId: _y, ...rest }) => rest),
      };
    },

    /* ---- class and section setup -------------------------------------- */

    async getSectionSetupOptions(yearId) {
      const sections = SECTIONS.filter((sec) => sec.academicYearId === yearId);
      return {
        gradeLevels: GRADE_LEVELS,
        subjects: offeredSubjects(),
        teachers: teachingStaff(),
        sections: sections.map((sec) => ({
          id: sec.id, name: sec.name, gradeLevelId: sec.gradeLevelId,
          gradeLevel: sec.gradeLevel, adviserUserId: sec.adviserUserId,
          adviserName: sec.adviserUserId === CURRENT_USER.id ? CURRENT_USER.name : null,
          room: sec.room, capacity: sec.capacity,
          // Fixture-only match on names, since fixture classes never
          // carried a sectionId — the real contract joins on the id.
          classCount: CLASSES.filter(
            (c) => c.gradeLevel === sec.gradeLevel && c.section === sec.name).length,
        })),
        classes: CLASSES.filter((c) => {
          const sec = sections.find((s) => s.gradeLevel === c.gradeLevel && s.name === c.section);
          return sec !== undefined;
        }).map((c) => {
          const sec = sections.find((s) => s.gradeLevel === c.gradeLevel && s.name === c.section)!;
          const subject = FIXTURE_SUBJECTS.find((s) => s.code === c.subjectCode);
          return {
            id: c.id, sectionId: sec.id,
            subjectId: subject?.id ?? c.subjectCode, subject: c.subject,
            teacherId: CURRENT_USER.id, teacherName: CURRENT_USER.name,
          };
        }),
        permissions: { canAssign: true },
      };
    },

    async createSection(draft) {
      const name = draft.name.trim();
      if (!name) throw new Error('a section needs a name');
      const clash = SECTIONS.find((s) =>
        s.academicYearId === draft.academicYearId
        && s.gradeLevelId === draft.gradeLevelId
        && s.name.toLowerCase() === name.toLowerCase());
      if (clash) {
        throw new Error(`a section named "${name}" already exists for this grade level`);
      }
      const gradeLevel = GRADE_LEVELS.find((g) => g.id === draft.gradeLevelId);
      const id = `sec-${SECTIONS.length + 1}`;
      SECTIONS.push({
        id, name, gradeLevelId: draft.gradeLevelId,
        gradeLevel: gradeLevel?.name ?? '', adviserUserId: draft.adviserUserId ?? null,
        room: draft.room ?? null, capacity: draft.capacity ?? null,
        academicYearId: draft.academicYearId,
      });
      return id;
    },

    /**
     * Idempotent by (section, subject), the same as the database: the
     * unique key is what actually prevents a duplicate, not a check
     * done here first.
     */
    async createClass(draft) {
      const section = SECTIONS.find((s) => s.id === draft.sectionId);
      const subject = FIXTURE_SUBJECTS.find((s) => s.id === draft.subjectId);
      if (!section || !subject) throw new Error('class not found');

      const existing = CLASSES.find(
        (c) => c.gradeLevel === section.gradeLevel && c.section === section.name
          && c.subjectCode === subject.code);
      if (existing) return existing.id;

      const id = `c-${subject.code.toLowerCase()}-${section.name.toLowerCase()}`;
      CLASSES.push({
        id, gradeLevel: section.gradeLevel, section: section.name,
        subject: subject.title, subjectCode: subject.code,
        // Auto-populated from the section's roster, same intent as
        // sync_class_roster: nobody types the list twice. The fixture
        // roster is shared across classes, so "populated" means the
        // whole shared roster here rather than a real per-section one.
        studentCount: ROSTER.length,
        scheduleNote: draft.scheduleNote ?? null, room: draft.room ?? null,
        status: { p1: 'draft', p2: 'draft', p3: 'draft' },
        receipts: {},
        completeness: {
          p1: { scored: 0, total: 0 }, p2: { scored: 0, total: 0 }, p3: { scored: 0, total: 0 },
        },
      });
      return id;
    },

    /* ---- a teacher's own class ------------------------------------ */

    async getMyClassSetupOptions(yearId) {
      return {
        gradeLevels: GRADE_LEVELS.map((g) => ({ id: g.id, name: g.name, ordinal: g.ordinal })),
        subjects: offeredSubjects(),
        sections: SECTIONS
          .filter((s) => s.academicYearId === yearId)
          .map((s) => ({
            id: s.id, name: s.name, gradeLevelId: s.gradeLevelId, gradeLevel: s.gradeLevel,
            learnerCount: ROSTER.length,
          })),
        myClasses: CLASSES.map((c) => ({
          id: c.id,
          sectionId: SECTIONS.find(
            (s) => s.name === c.section && s.gradeLevel === c.gradeLevel)?.id ?? '',
          subjectId: FIXTURE_SUBJECTS.find((s) => s.code === c.subjectCode)?.id ?? '',
        })),
        permissions: { canCreateOwn: true },
      };
    },

    async createMyClass(draft) {
      const subject = FIXTURE_SUBJECTS.find((s) => s.id === draft.subjectId);
      if (!subject) throw new Error('that subject is not offered by this school');

      // Resolve the section the same way the server does: by id, or by
      // a CASE-INSENSITIVE name match within the grade level, so
      // "pearl" lands on "Pearl" instead of forking it.
      let section = draft.sectionId
        ? SECTIONS.find((s) => s.id === draft.sectionId)
        : undefined;
      let wasExisting = section !== undefined;

      if (!section) {
        const name = (draft.sectionName ?? '').trim();
        const level = GRADE_LEVELS.find((g) => g.id === draft.gradeLevelId);
        if (!name || !level) {
          throw new Error('choose a section, or give a grade level and a section name');
        }
        section = SECTIONS.find(
          (s) => s.gradeLevelId === level.id && s.name.toLowerCase() === name.toLowerCase());
        wasExisting = section !== undefined;
        if (!section) {
          section = {
            id: `sec-${name.toLowerCase().replace(/\s+/g, '-')}`,
            name, gradeLevelId: level.id, gradeLevel: level.name,
            // Never the adviser: teaching a class in a section is not
            // the same authority as advising it.
            adviserUserId: null, room: null, capacity: null,
            academicYearId: draft.academicYearId,
          };
          SECTIONS.push(section);
        }
      }

      const existing = CLASSES.find(
        (c) => c.gradeLevel === section!.gradeLevel && c.section === section!.name
          && c.subjectCode === subject.code);
      if (existing) return existing.id;

      const id = `c-${subject.code.toLowerCase()}-${section.name.toLowerCase()}`;
      // A section that already existed brings its enrolment with it; a
      // section the teacher just named brings NOBODY. Reproducing that
      // is the whole reason this fixture tracks rosters per class —
      // see migration 0033's note on the dead end.
      const inherited = wasExisting ? ROSTER.length : 0;
      CLASSES.push({
        id, gradeLevel: section.gradeLevel, section: section.name,
        subject: subject.title, subjectCode: subject.code,
        studentCount: inherited,
        scheduleNote: draft.scheduleNote ?? null, room: draft.room ?? null,
        status: { p1: 'draft', p2: 'draft', p3: 'draft' },
        receipts: {},
        completeness: {
          p1: { scored: 0, total: 0 }, p2: { scored: 0, total: 0 }, p3: { scored: 0, total: 0 },
        },
      });
      classRosters.set(id, ROSTER.slice(0, inherited));
      return id;
    },

    /* ---- the roster of a class I teach ----------------------------- */

    async getMyClassRoster(classId) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('you do not teach this class');
      const inClass = rosterFor(classId);
      const inClassIds = new Set(inClass.map((r) => r.studentId));
      return {
        classId,
        roster: inClass.map((r) => {
          const st = STUDENTS.find((s) => s.studentId === r.studentId);
          return {
            classEnrollmentId: r.classEnrollmentId,
            studentId: r.studentId,
            displayName: r.displayName,
            firstName: st?.firstName ?? r.displayName,
            lastName: st?.lastName ?? '',
            sex: (st?.sex ?? null) as 'male' | 'female' | null,
            lrn: st?.lrn ?? null,
            // A class that has never been scored has nobody with
            // marks, so everyone in it is removable. Blanket-truthing
            // this hid the Remove button on exactly the class the
            // feature exists for — the empty one a teacher just made.
            hasScores: (cls.completeness.p1?.scored ?? 0) > 0
              && !r.classEnrollmentId.startsWith('ce-new-'),
          };
        }),
        candidates: STUDENTS
          .filter((s) => !inClassIds.has(s.studentId))
          .map((s) => ({
            studentId: s.studentId,
            displayName: s.displayName,
            lrn: s.lrn ?? null,
            enrolledHere: true,
          })),
        permissions: { canWrite: true },
      };
    },

    async addLearnerToMyClass(learner) {
      const cls = CLASSES.find((c) => c.id === learner.classId);
      if (!cls) throw new Error('you do not teach this class');

      let studentId = learner.studentId ?? null;
      let displayName: string;

      if (studentId) {
        const st = STUDENTS.find((s) => s.studentId === studentId);
        if (!st) throw new Error('no such learner at this school');
        displayName = st.displayName;
      } else {
        const first = (learner.firstName ?? '').trim();
        const last = (learner.lastName ?? '').trim();
        if (!first || !last) {
          throw new Error('choose a learner, or give a first and last name');
        }
        // The duplicate guard, matching the server: case- and
        // space-insensitive, refused unless explicitly confirmed.
        const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
        const clash = STUDENTS.find(
          (s) => norm(s.firstName) === norm(first) && norm(s.lastName) === norm(last));
        if (clash && !learner.confirmNewPerson) {
          throw new Error(`${clash.displayName} is already on file at this school. `
            + 'Add them from the list instead, or confirm this is a different '
            + 'learner with the same name.');
        }
        studentId = `st-new-${STUDENTS.length + 1}`;
        displayName = `${last}, ${first}`;
        STUDENTS.push({
          studentId, displayName, firstName: first, middleName: null, lastName: last,
          suffix: null, sex: learner.sex ?? null,
          // No LRN. The registrar completes the record; a null LRN is
          // the flag the Students directory already surfaces.
          lrn: null, studentNumber: null, birthDate: null, status: 'active',
        } as StudentIdentity);
      }

      const id = `ce-new-${ROSTER.length + 1}`;
      const entry = { classEnrollmentId: id, studentId, displayName };
      // ROSTER is the school-wide pool the gradebook reads from;
      // rosterFor(classId) is THIS class's membership. Two lists,
      // because one learner belongs to many classes and exactly one
      // school — the same split the three tables encode.
      if (!ROSTER.some((r) => r.classEnrollmentId === id)) ROSTER.push(entry);
      const list = rosterFor(learner.classId);
      list.push(entry);
      cls.studentCount = list.length;
      return id;
    },

    async removeLearnerFromMyClass(classEnrollmentId) {
      // Only ever the CLASS membership. STUDENTS is untouched, and so is
      // the school-wide ROSTER — removing a learner from one subject
      // must never withdraw them from the school.
      let found = false;
      for (const [classId, list] of classRosters) {
        const i = list.findIndex((r) => r.classEnrollmentId === classEnrollmentId);
        if (i < 0) continue;
        list.splice(i, 1);
        const cls = CLASSES.find((c) => c.id === classId);
        if (cls) cls.studentCount = list.length;
        found = true;
        break;
      }
      if (!found) throw new Error('no such learner in this class');
    },

    async correctLearnerName(fix) {
      const st = STUDENTS.find((s) => s.studentId === fix.studentId);
      if (!st) throw new Error('that learner is not in any class you teach');
      const first = fix.firstName.trim();
      const last = fix.lastName.trim();
      if (!first || !last) throw new Error('a first and last name are both required');

      const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
      const clash = STUDENTS.find((s) => s.studentId !== fix.studentId
        && norm(s.firstName) === norm(first) && norm(s.lastName) === norm(last));
      if (clash && !fix.confirmNamesake) {
        throw new Error(`Another learner at this school is already called `
          + `${clash.displayName}. Confirm they are different people if that is correct.`);
      }

      st.firstName = first;
      st.lastName = last;
      st.middleName = fix.middleName?.trim() || null;
      st.suffix = fix.suffix?.trim() || null;
      st.displayName = `${last}, ${first}`;
      // The rename has to reach every list the learner appears in —
      // which in the real schema it does for free, because those lists
      // hold an id and read the name through a join. The fixtures
      // denormalise displayName, so they have to do it by hand.
      for (const r of ROSTER) {
        if (r.studentId === fix.studentId) r.displayName = st.displayName;
      }
      for (const list of classRosters.values()) {
        for (const r of list) {
          if (r.studentId === fix.studentId) r.displayName = st.displayName;
        }
      }
    },

    /* ---- accounts ------------------------------------------------- */

    async getSchoolProfile() {
      return {
        id: CURRENT_USER.schoolId,
        code: CURRENT_USER.schoolCode.toLowerCase(),
        name: FIXTURE_SESSION.school.name,
        govtSchoolId: FIXTURE_SESSION.school.govtSchoolId,
        schoolType: 'public',
        region: FIXTURE_SESSION.school.region,
        division: FIXTURE_SESSION.school.division,
        district: FIXTURE_SESSION.school.district,
        address: 'Manila East Road, Angono, Rizal',
        contactEmail: 'office@anhs.deped.gov.ph',
        contactPhone: '(02) 8651-1234',
        status: 'active',
        permissions: { canWrite: true },
      };
    },

    async updateSchoolProfile(edit) {
      if (!edit.name.trim()) throw new Error('the school needs a name');
      // Mutating FIXTURE_SESSION rather than a copy, so the change is
      // visible everywhere the school is printed — the header, the
      // class Setup panel, and the SF forms — exactly as it would be
      // against the real database, where all of them read one row.
      FIXTURE_SESSION.school.name = edit.name.trim();
      FIXTURE_SESSION.school.govtSchoolId = edit.govtSchoolId?.trim() || null;
      FIXTURE_SESSION.school.region = edit.region?.trim() || null;
      FIXTURE_SESSION.school.division = edit.division?.trim() || null;
      FIXTURE_SESSION.school.district = edit.district?.trim() || null;
    },

    async getStaffDirectory() {
      return {
        roles: FIXTURE_ROLES,
        users: STAFF.map((u) => ({ ...u, roles: [...u.roles] })),
        // The fixture signs in as a teacher, but the demo role switcher
        // reaches the admin menu, so the directory has to be usable
        // from there. Against Supabase these come from the permission
        // catalogue and a teacher is refused outright.
        permissions: { canWrite: true, canAssignRoles: true, canDeactivate: true },
      };
    },

    async createAccount(draft) {
      const email = draft.email.trim().toLowerCase();
      if (STAFF.some((u) => u.email.toLowerCase() === email)) {
        throw new Error('That email address already has an account. '
          + 'Every account across all schools needs its own address.');
      }
      if (draft.password.length < 8) {
        throw new Error('Use a temporary password of at least 8 characters.');
      }
      const id = `u-new-${STAFF.length + 1}`;
      STAFF.push({
        id, email,
        employeeId: draft.employeeId?.trim() || null,
        firstName: draft.firstName.trim(),
        middleName: draft.middleName?.trim() || null,
        lastName: draft.lastName.trim(),
        suffix: draft.suffix?.trim() || null,
        status: 'active',
        // The one behaviour worth reproducing exactly: a fresh account
        // always starts owing a password change, because the person who
        // created it knows the temporary one.
        mustChangePassword: true,
        lastLoginAt: null,
        position: draft.position?.trim() || null,
        isSelf: false,
        roles: [...draft.roles],
      });
      return { userId: id };
    },

    async resetPassword(userId, password) {
      if (password.length < 8) {
        throw new Error('Use a password of at least 8 characters.');
      }
      const user = STAFF.find((u) => u.id === userId);
      if (!user) throw new Error('No such account in this school.');
      user.mustChangePassword = true;
    },

    async setUserRoles(userId, roleCodes) {
      const user = STAFF.find((u) => u.id === userId);
      if (!user) throw new Error('No such account in this school.');
      if (user.isSelf && !roleCodes.includes('school_admin')
          && user.roles.includes('school_admin')) {
        throw new Error('you cannot remove your own administrator role '
          + '— ask another administrator');
      }
      user.roles = [...roleCodes].sort();
    },

    async setUserStatus(userId, status) {
      const user = STAFF.find((u) => u.id === userId);
      if (!user) throw new Error('No such account in this school.');
      if (user.isSelf && status !== 'active') {
        throw new Error('you cannot deactivate your own account');
      }
      user.status = status;
    },

    async getMyAccount() {
      const me = STAFF.find((u) => u.isSelf) ?? STAFF[0]!;
      return {
        id: me.id, email: me.email, employeeId: me.employeeId,
        firstName: me.firstName, middleName: me.middleName,
        lastName: me.lastName, suffix: me.suffix,
        status: me.status, mustChangePassword: me.mustChangePassword,
        position: me.position, employmentStatus: 'Permanent',
        dateHired: '2019-06-03', qualifications: 'BSEd Mathematics',
        ancillaryAssignments: null,
        schoolName: CURRENT_USER.schoolName,
        roles: [...me.roles],
      };
    },

    async updateMyProfile(edit) {
      const me = STAFF.find((u) => u.isSelf) ?? STAFF[0]!;
      if (!edit.firstName.trim() || !edit.lastName.trim()) {
        throw new Error('a first and last name are both required');
      }
      me.firstName = edit.firstName.trim();
      me.lastName = edit.lastName.trim();
      me.middleName = edit.middleName?.trim() || null;
      me.suffix = edit.suffix?.trim() || null;
      me.position = edit.position?.trim() || null;
    },

    async changeMyPassword(password) {
      if (password.length < 8) {
        throw new Error('Use a password of at least 8 characters.');
      }
      const me = STAFF.find((u) => u.isSelf) ?? STAFF[0]!;
      me.mustChangePassword = false;
    },

    /**
     * Creates a PERSON and their FIRST YEAR, and refuses a duplicate the
     * same way the database does — the demo has to teach the real rule,
     * not a friendlier one.
     */
    async admitStudent(student, enrollment, confirmNamesake) {
      if (!student.firstName?.trim() || !student.lastName?.trim()) {
        throw new Error('A first name and a last name are required.');
      }
      const clash = STUDENTS.find((x) =>
        (student.lrn && x.lrn === student.lrn)
        || (student.studentNumber && x.studentNumber === student.studentNumber));
      if (clash) {
        throw new Error(
          `A learner with that ${student.lrn && clash.lrn === student.lrn ? 'LRN' : 'student number'} `
          + `already exists in this school (${clash.displayName}).`);
      }

      // A NAME clash warns rather than refusing, exactly as the server
      // does: an identifier is a certainty, a name is a suspicion. Real
      // namesakes exist, and a demo that refused them would teach the
      // wrong rule.
      if (!confirmNamesake) {
        const matches = STUDENTS.filter((x) =>
          normaliseName(x.firstName) === normaliseName(student.firstName!)
          && normaliseName(x.lastName) === normaliseName(student.lastName!)
          && (!student.birthDate || !x.birthDate || x.birthDate === student.birthDate));
        if (matches.length > 0) {
          return {
            status: 'needs_confirmation' as const,
            reason: 'namesake' as const,
            message:
              'This school already has a learner by that name. Check the record '
              + 'below before adding a second one — if this is a different '
              + 'person, confirm and continue.',
            matches: matches.map((x) => ({
              studentId: x.studentId, displayName: x.displayName,
              lrn: x.lrn, studentNumber: x.studentNumber, birthDate: x.birthDate,
            })),
          };
        }
      }

      const studentId = `st-${Date.now()}-${STUDENTS.length}`;
      const displayName = `${student.lastName.trim()}, ${student.firstName.trim()}`
        + (student.middleName ? ` ${student.middleName.trim()}` : '');
      STUDENTS.push({
        studentId, displayName,
        firstName: student.firstName.trim(), lastName: student.lastName.trim(),
        middleName: student.middleName?.trim() || null,
        suffix: student.suffix?.trim() || null,
        studentNumber: student.studentNumber?.trim() || null,
        lrn: student.lrn?.trim() || null,
        sex: student.sex || null,
        birthDate: student.birthDate || null,
        birthPlace: null, motherTongue: null, religion: null,
        addressLine: student.addressLine?.trim() || null,
        barangay: null, municipality: null, province: null,
        contactNumber: student.contactNumber?.trim() || null,
        email: student.email?.trim() || null,
        status: 'active', hasPortalAccount: false,
      });
      // Creating a learner and placing one are separate acts. A form
      // that names an academic year still enrols exactly as before.
      const enrollmentId = enrollment?.academicYearId
        ? await src.enrolStudent(studentId, enrollment)
        : null;
      return { status: 'created' as const, studentId, enrollmentId };
    },

    async enrolStudent(studentId, enrollment) {
      if (!STUDENTS.some((x) => x.studentId === studentId)) {
        throw new Error('Learner not found.');
      }
      if (!enrollment.academicYearId || !enrollment.gradeLevelId) {
        throw new Error('An academic year and a grade level are required.');
      }
      // The (student, year) uniqueness the database enforces. Without it
      // a learner appears twice in one directory.
      if (ENROLMENTS.some((e) => e.studentId === studentId
                               && e.academicYearId === enrollment.academicYearId)) {
        throw new Error(
          'This learner is already enrolled for that school year — '
          + 'edit the enrolment instead of adding one.');
      }
      const year = YEAR_TRIMESTER.id === enrollment.academicYearId
        ? YEAR_TRIMESTER.label : enrollment.academicYearId;
      const gl = GRADE_LEVELS.find((g) => g.id === enrollment.gradeLevelId);
      const sec = SECTIONS.find((x) => x.id === enrollment.sectionId);
      const enrollmentId = `en-${Date.now()}-${ENROLMENTS.length}`;
      ENROLMENTS.push({
        studentId, enrollmentId,
        academicYearId: enrollment.academicYearId, academicYear: year,
        yearStatus: 'active',
        gradeLevel: gl?.name ?? '—', gradeLevelId: enrollment.gradeLevelId,
        section: sec?.name ?? null, sectionId: enrollment.sectionId ?? null,
        status: enrollment.status ?? 'enrolled',
        promotionStatus: null, generalAverage: null,
        dateEnrolled: enrollment.dateEnrolled ?? today(),
      });

      // The enrolment is itself an event. Without it a history starts at
      // the first transfer, reading as though the learner appeared
      // mid-year.
      recordEvent(
        enrollmentId,
        enrollment.status === 'transferred_in' ? 'transfer_in' : 'enrolled',
        null, gl?.name ?? null, enrollment.previousSchool ?? null,
        enrollment.dateEnrolled);
      if (sec) {
        recordEvent(enrollmentId, 'section_change', null, sec.name,
          'Assigned at enrolment', enrollment.dateEnrolled);
      }
      return enrollmentId;
    },

    /* ---- the enrolment lifecycle ---------------------------------- */

    async transferSection(enrollmentId, sectionId, effectiveDate, reason) {
      const en = ENROLMENTS.find((e) => e.enrollmentId === enrollmentId);
      if (!en) throw new Error('Enrolment not found.');
      const to = SECTIONS.find((x) => x.id === sectionId);
      // Same guard as the server: a section IS a grade level and a name,
      // so moving across grades is not a transfer.
      if (!to || to.gradeLevelId !== en.gradeLevelId
          || to.academicYearId !== en.academicYearId) {
        throw new Error(
          'That section is not available for this learner\'s year and grade level.');
      }
      if (en.sectionId === sectionId) {
        throw new Error(`This learner is already in ${to.name}.`);
      }
      const from = en.section;
      en.section = to.name;
      en.sectionId = sectionId;
      recordEvent(enrollmentId, 'section_change', from, to.name, reason ?? null,
        effectiveDate);
      return { from, to: to.name, classesLeft: 0, classesJoined: 0 };
    },

    async withdrawStudent(enrollmentId, kind, effectiveDate, reason, destination) {
      const en = ENROLMENTS.find((e) => e.enrollmentId === enrollmentId);
      if (!en) throw new Error('Enrolment not found.');
      if (!reason?.trim()) {
        throw new Error('A reason is required to withdraw a learner.');
      }
      if (en.status === 'transferred_out' || en.status === 'dropped') {
        throw new Error(`This enrolment is already closed (${en.status}).`);
      }
      const was = en.status;
      en.status = kind;
      recordEvent(enrollmentId,
        kind === 'transferred_out' ? 'transfer_out' : 'drop',
        was, kind,
        destination?.trim() ? `${reason} — to ${destination.trim()}` : reason,
        effectiveDate);
      return { status: kind, classesClosed: 0 };
    },

    async reenrolStudent(enrollmentId, effectiveDate, reason) {
      const en = ENROLMENTS.find((e) => e.enrollmentId === enrollmentId);
      if (!en) throw new Error('Enrolment not found.');
      if (en.status !== 'transferred_out' && en.status !== 'dropped') {
        throw new Error('This enrolment is not closed, so there is nothing to re-open.');
      }
      const was = en.status;
      en.status = 'enrolled';
      recordEvent(enrollmentId, 're_entry', was, 'enrolled', reason ?? null, effectiveDate);
      return { status: 'enrolled', classesRejoined: 0 };
    },

    async getEnrollmentHistory(studentId) {
      return EVENTS
        .filter((e) => e.studentId === studentId)
        .map(({ studentId: _s, ...row }) => row)
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.seq - a.seq);
    },

    /* ---- portal accounts ------------------------------------------ */

    // True here for the same reason the subject catalogue's canWrite is:
    // the demo switcher changes the MENU, never what the data layer
    // returns. The refusal path is tested against real Postgres, where
    // the permission actually lives.
    async mayProvisionPortalAccounts() {
      return true;
    },

    async getPortalCandidates(sectionId) {
      const sec = SECTIONS.find((x) => x.id === sectionId);
      const learners = ENROLMENTS
        .filter((e) => e.sectionId === sectionId
                    && (e.status === 'enrolled' || e.status === 'transferred_in'))
        .map((e) => STUDENTS.find((x) => x.studentId === e.studentId))
        .filter((x): x is StudentIdentity => !!x)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return {
        section: sec
          ? { id: sec.id, name: sec.name, gradeLevel: sec.gradeLevel }
          : null,
        learners: learners.map((x) => ({
          studentId: x.studentId, displayName: x.displayName, lrn: x.lrn,
          email: x.hasPortalAccount ? (x.email ?? 'account@school') : null,
          hasAccount: x.hasPortalAccount,
        })),
      };
    },

    async createStudentPortalAccount(studentId, email, password) {
      const st = STUDENTS.find((x) => x.studentId === studentId);
      if (!st) throw new Error('No such learner in this school.');
      if (st.hasPortalAccount) {
        throw new Error(
          `${st.displayName} already has a portal account. `
          + 'Reset its password rather than creating a second one.');
      }
      if (!email.trim()) throw new Error('An email address is required.');
      if (password.length < 8) {
        throw new Error('Use a temporary password of at least 8 characters.');
      }
      st.hasPortalAccount = true;
      st.email = email.trim();
      return { userId: `u-${Date.now()}` };
    },

    async unlinkStudentPortalAccount(studentId, reason) {
      const st = STUDENTS.find((x) => x.studentId === studentId);
      if (!st) throw new Error('No such learner in this school.');
      if (!st.hasPortalAccount) {
        throw new Error('That learner has no portal account to unlink.');
      }
      if (!reason?.trim()) {
        throw new Error('A reason is required to unlink a portal account.');
      }
      st.hasPortalAccount = false;
    },

    async updateStudent(studentId, patch) {
      const st = STUDENTS.find((x) => x.studentId === studentId);
      if (!st) throw new Error('Learner not found.');
      // Patch semantics: an absent key is left alone, never blanked.
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) (st as unknown as Record<string, unknown>)[k] = v === '' ? null : v;
      }
      st.displayName = `${st.lastName}, ${st.firstName}`
        + (st.middleName ? ` ${st.middleName}` : '');
    },

    /** A SECTION TRANSFER: the enrolment moves, the person does not. */
    async updateEnrollment(enrollmentId, patch) {
      const en = ENROLMENTS.find((x) => x.enrollmentId === enrollmentId);
      if (!en) throw new Error('Enrolment not found.');
      if (patch.gradeLevelId) {
        en.gradeLevelId = patch.gradeLevelId;
        en.gradeLevel = GRADE_LEVELS.find((g) => g.id === patch.gradeLevelId)?.name ?? en.gradeLevel;
      }
      if (patch.sectionId !== undefined) {
        en.sectionId = patch.sectionId || null;
        en.section = SECTIONS.find((x) => x.id === patch.sectionId)?.name ?? null;
      }
      if (patch.status) en.status = patch.status;
    },

    async getAttendance(classId, date) {
      const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      const weekend = [0, 6].includes(new Date(date + 'T00:00:00').getDay());
      return {
        classId, date,
        calendarDayId: weekend ? null : `cd-${date}`,
        dayType: weekend ? 'non_teaching' : 'class_day',
        dayNote: null,
        isClassDay: !weekend,
        statuses: ATTENDANCE_STATUSES,
        roster: ROSTER.slice(0, cls.studentCount).map((r, i) => ({
          enrollmentId: `en-${i + 1}`,
          studentId: r.studentId,
          displayName: r.displayName,
          statusId: attendanceMarks.get(`${date}|en-${i + 1}`) ?? null,
          note: null,
        })),
      } satisfies AttendanceDay;
    },

    async saveAttendance(_classId, date, marks: AttendanceMark[]) {
      for (const m of marks) attendanceMarks.set(`${date}|${m.enrollmentId}`, m.statusId);
      return { written: marks.length };
    },

    /* ---- workflow ---------------------------------------------------
     * The fixture runs the SAME state machine as the database, from the
     * same table of legal transitions. If it were more permissive the
     * UI would be developed against rules the server does not have, and
     * the difference would surface only in production.
     * ------------------------------------------------------------------ */

    async saveAssessments(classId, periodId, items) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      if (!['draft', 'returned', 'reopened'].includes(cls.status[periodId] ?? 'draft')) {
        throw new Error('this period has been submitted and can no longer be reconfigured');
      }
      // Mirror the server's totals so the UI is developed against the
      // same numbers: the completeness denominator moves when the shape
      // of the record book changes.
      const before = cls.completeness[periodId]?.total ?? 0;
      cls.completeness[periodId] = {
        scored: Math.min(cls.completeness[periodId]?.scored ?? 0, items.length * cls.studentCount),
        total: items.length * cls.studentCount,
      };
      return { written: items.length, removed: before > items.length * cls.studentCount ? 1 : 0 };
    },

    async validateSubmission(classId, periodId) {
      const cls = CLASSES.find((c) => c.id === classId) ?? CLASSES[0]!;
      const c = cls.completeness[periodId] ?? { scored: 0, total: 0 };
      const missing = Math.max(0, c.total - c.scored);
      return {
        ok: c.total > 0,
        errors: c.total === 0
          ? [{ code: 'no_assessments', message: 'No assessments have been defined for this period' }]
          : [],
        warnings: missing > 0
          ? [{ code: 'missing_scores', message: `${missing} score(s) not yet entered` }]
          : [],
      } satisfies ValidationReport;
    },

    /**
     * Mirrors what the server does, in the same order: compute and
     * record the grades FIRST, then move the workflow. The fixtures are
     * a stand-in for the database, not for the browser, so a demo that
     * submits must leave a recorded grade behind exactly as production
     * does — otherwise the Summary tab would look materialised on real
     * data and empty on fixtures, and the difference would only surface
     * in front of a school.
     */
    async submitGrades(classId, periodId, acknowledgeWarnings) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      const report = await src.validateSubmission(classId, periodId);
      if (!report.ok) throw new Error(report.errors.map((e) => e.message).join('; '));
      if (report.warnings.length > 0 && !acknowledgeWarnings) {
        throw new Error('This submission has warnings that need acknowledging.');
      }
      assertTransition(cls.status[periodId] ?? 'draft', 'submitted');

      recordPeriodGrades(await src.getGradebook(classId, periodId));
      cls.status[periodId] = 'submitted';
    },

    async getLoaCohort(_yearId, classId, periodId) {
      const self = CLASSES.find((c) => c.id === classId);
      if (!self) return [];
      const peers = CLASSES
        .filter((c) => c.subjectCode === self.subjectCode && c.gradeLevel === self.gradeLevel)
        .sort((a, b) => a.section.localeCompare(b.section));
      return Promise.all(peers.map(async (c) => ({
        classId: c.id,
        label: `${c.gradeLevel} – ${c.section}`,
        data: await src.getGradebook(c.id, periodId),
      })));
    },

    async getPeriodGrades(classId, periodId) {
      return persistedGrades.get(`${classId}|${periodId}`) ?? {};
    },

    /**
     * The REGISTRAR's queue. Strict chain: nothing appears here until the
     * adviser has forwarded it, because until then it is not the
     * registrar's to act on.
     */
    async getSubmissionQueue(_yearId) {
      return CLASSES.flatMap((c) =>
        Object.entries(c.status)
          .filter(([, st]) => !['draft', 'submitted', 'received'].includes(st))
          .map(([periodId, st]) => ({
            submissionId: `sub-${c.id}-${periodId}`,
            classId: c.id,
            periodId,
            periodName: YEAR_TRIMESTER.periods.find((p) => p.id === periodId)?.name ?? periodId,
            gradeLevel: c.gradeLevel,
            section: c.section,
            subject: c.subject,
            teacher: CURRENT_USER.name,
            status: st,
            submittedAt: '2026-09-16T08:00:00Z',
            ...receiptsFor(c.id, periodId),
            returnedAt: st === 'returned' ? '2026-09-17T09:00:00Z' : null,
            returnReason: st === 'returned' ? '5 missing scores in Written Works' : null,
            studentCount: c.studentCount,
            completeness: c.completeness[periodId] ?? { scored: 0, total: 0 },
          })),
      ) satisfies SubmissionRow[];
    },

    /**
     * The ADVISER's queue: everything submitted in their sections,
     * including what the registrar now holds, so they can see their
     * hand-off landed. No marks and no completeness — see the note on
     * SubmissionRow.
     */
    async getAdviserQueue(_yearId) {
      return CLASSES.flatMap((c) =>
        Object.entries(c.status)
          .filter(([, st]) => st !== 'draft')
          .map(([periodId, st]) => ({
            submissionId: `sub-${c.id}-${periodId}`,
            classId: c.id,
            periodId,
            periodName: YEAR_TRIMESTER.periods.find((p) => p.id === periodId)?.name ?? periodId,
            gradeLevel: c.gradeLevel,
            section: c.section,
            subject: c.subject,
            teacher: CURRENT_USER.name,
            status: st,
            submittedAt: '2026-09-16T08:00:00Z',
            ...receiptsFor(c.id, periodId),
            returnedAt: st === 'returned' ? '2026-09-17T09:00:00Z' : null,
            returnReason: st === 'returned' ? '5 missing scores in Written Works' : null,
          })),
      ) satisfies SubmissionRow[];
    },

    async getMyAdvisorySections(academicYearId) {
      return SECTIONS
        .filter((s) => s.adviserUserId === CURRENT_USER.id && s.academicYearId === academicYearId)
        .map((s) => ({ id: s.id, name: s.name, gradeLevel: s.gradeLevel, gradeLevelId: s.gradeLevelId }));
    },

    /**
     * Mirrors `rds.consolidated_grades`: one row per learner in the
     * section, one cell per subject taught in it, read from the SAME
     * `persistedGrades` store `submitGrades` writes — never recomputed
     * here, so a subject the adviser doesn't teach still shows the grade
     * its own teacher filed, exactly as the real RPC's SECURITY DEFINER
     * bypass does.
     */
    async getConsolidatedGrades(sectionId, periodId) {
      const section = SECTIONS.find((s) => s.id === sectionId);
      if (!section) throw new Error('Section not found.');
      const classesInSection = CLASSES.filter(
        (c) => c.gradeLevel === section.gradeLevel && c.section === section.name,
      );
      const subjects = classesInSection.map((c) => ({ id: c.subjectCode, title: c.subject, classId: c.id }));
      const rows = ROSTER.map((student) => {
        const grades: Record<string, ConsolidatedGradeCell> = {};
        for (const c of classesInSection) {
          const persisted = persistedGrades.get(`${c.id}|${periodId}`)?.[student.classEnrollmentId];
          grades[c.subjectCode] = {
            classId: c.id,
            grade: persisted?.periodGrade ?? null,
            descriptor: persisted?.descriptor ?? null,
            passed: persisted?.passed ?? null,
            statusCode: null,
          };
        }
        return { studentId: student.studentId, displayName: student.displayName, grades };
      });
      return {
        section: { id: section.id, name: section.name, gradeLevel: section.gradeLevel },
        subjects,
        rows,
      };
    },

    async recallSubmission(classId, periodId) {
      const cls = CLASSES.find((c) => c.id === classId);
      if (!cls) throw new Error('Class not found.');
      const from = cls.status[periodId] ?? 'draft';
      // The same refusal the database gives, in the same words, so the
      // demo teaches the real rule rather than a friendlier fiction.
      if (from !== 'submitted') {
        const holder = from === 'received' ? 'class adviser'
          : from === 'forwarded' || from === 'registrar_received' ? 'registrar'
          : from;
        throw new Error(
          `This period is already with the ${holder} and can no longer be recalled; `
          + 'ask for it to be returned instead.',
        );
      }
      assertTransition(from, 'draft');
      cls.status[periodId] = 'draft';
    },

    async receiveSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      assertTransition(cls.status[periodId] ?? 'draft', 'received');
      cls.status[periodId] = 'received';
      receiptsFor(cls.id, periodId).receivedAt = new Date().toISOString();
    },

    async forwardSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      assertTransition(cls.status[periodId] ?? 'draft', 'forwarded');
      cls.status[periodId] = 'forwarded';
      receiptsFor(cls.id, periodId).forwardedAt = new Date().toISOString();
    },

    async unforwardSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      if ((cls.status[periodId] ?? 'draft') !== 'forwarded') {
        throw new Error(
          'The registrar has already received this; ask for it to be returned instead.',
        );
      }
      cls.status[periodId] = 'received';
      receiptsFor(cls.id, periodId).forwardedAt = null;
    },

    async registrarReceiveSubmission(submissionId) {
      const { cls, periodId } = locate(submissionId);
      const from = cls.status[periodId] ?? 'draft';
      if (from !== 'forwarded') {
        throw new Error(
          'This record has not been forwarded yet — it is still '
          + (from === 'submitted' ? 'waiting for the class adviser to receive it'
             : from === 'received' ? 'with the class adviser, who has not forwarded it'
             : `at ${from}`) + '.',
        );
      }
      cls.status[periodId] = 'registrar_received';
      receiptsFor(cls.id, periodId).registrarReceivedAt = new Date().toISOString();
    },

    async returnSubmission(submissionId, reason) {
      if (!reason.trim()) throw new Error('A reason is required when returning a submission.');
      moveSubmission(submissionId, 'returned');
    },
    async approveSubmission(submissionId)  { moveSubmission(submissionId, 'approved'); },
    async finalizeSubmission(submissionId) { moveSubmission(submissionId, 'finalized'); },
    async publishSubmission(submissionId)  { moveSubmission(submissionId, 'published'); },

    /* ---- student portal --------------------------------------------- */

    async getMyProfile() {
      return {
        student: {
          studentId: 'st-6', displayName: 'Boyore, Joshua Reyes',
          firstName: 'Joshua', middleName: 'Reyes', lastName: 'Boyore', suffix: null,
          lrn: '136789010005', studentNumber: '2026-0005', sex: 'Male',
          birthDate: '2010-05-18', barangay: 'Mahabang Parang',
          municipality: 'Angono', province: 'Rizal',
        },
        enrollment: {
          academicYear: '2026-2027', gradeLevel: 'Grade 10', section: 'Pearl',
          status: 'enrolled', dateEnrolled: '2026-06-08', adviser: 'Juan Dela Cruz',
        },
        settings: { student_can_view_attendance: false },
      } satisfies StudentProfile;
    },

    async getMyGrades() {
      // Only PUBLISHED periods carry a number. p2 and p3 are not
      // published in the fixture, so they read as null — the same thing
      // the RLS policies do on the real database, rather than a
      // friendlier fiction.
      //
      // ⚠️ This used to be `CLASSES.slice(0, 2)`, which is Mathematics 10
      // in Pearl AND Mathematics 10 in Diamond — one learner enrolled in
      // the same subject twice, in two sections, in one year. Nobody is.
      // It also collided the React key on the grades table, so a row
      // could be silently omitted from a learner's own grade list.
      //
      // The demo learner is Grade 10 Pearl, so their grades are the
      // PEARL classes — which is also what My Schedule shows, so the two
      // screens now agree about the same person.
      return CLASSES
        .filter((c) => c.section === 'Pearl' && c.gradeLevel === 'Grade 10')
        .map((c) => ({
        academicYear: '2026-2027',
        academicYearId: YEAR_TRIMESTER.id,
        gradeLevel: c.gradeLevel,
        section: c.section,
        subject: c.subject,
        subjectCode: c.subjectCode,
        periods: YEAR_TRIMESTER.periods.map((p) => ({
          ordinal: p.ordinal, name: p.name, shortName: p.shortName,
          grade: c.status[p.id] === 'published' ? 88 : null,
        })),
        finalGrade: null,
        remark: null,
      })) satisfies StudentGradeRow[];
    },

    /* ---- the Import Center ---------------------------------------- *
     * A real implementation, not a stub. The fixtures are what the
     * offline demo and the end-to-end suite run against, and an import
     * that pretended to work there would be discovered by a school
     * rather than by us.
     *
     * The one thing it cannot model is row-level security: everything
     * here is visible to everybody, so the permission flags below are
     * the fixture user's, and matching sees the whole roster.
     * ------------------------------------------------------------------ */

    async resolveImport(workbook) {
      const wb = workbook as ImportWorkbookInput;
      const cls = resolveFixtureClass(wb);
      const scheme = cls && cls.subjectCode.startsWith('MAPEH') ? DO015_MAPEH : DO015_CORE;
      // No class means no subject means no grading scheme, and a
      // component can only be judged against a scheme. The server
      // returns [] here; reporting every component "missing" instead is
      // what put four errors on the teacher's screen that were only
      // consequences of the one real problem.
      const schemeResolved = cls ? scheme : null;

      const wanted = new Set<string>();
      for (const t of wb.terms ?? []) {
        for (const c of t.components ?? []) {
          for (const i of c.items ?? []) wanted.add(i.childComponentCode ?? c.key);
        }
      }
      const components: ResolvedComponent[] = !schemeResolved ? [] : [...wanted].map((code) => {
        const found = schemeResolved.components.find((c) => c.code === code);
        const parent = code === 'WW' || code === 'PT' || code === 'EX' ? code : 'EX';
        return {
          key: parent as ResolvedComponent['key'],
          itemCode: parent === code ? null : code,
          componentId: found?.id ?? null,
          weight: found?.weight ?? null,
          status: found ? 'matched' : 'missing',
        };
      });

      const learners: ResolvedLearner[] = (wb.roster ?? []).map((r) => {
        const candidates = ROSTER
          .filter((x) => normaliseName(x.displayName) === normaliseName(r.raw))
          .map((x) => ({
            studentId: x.studentId,
            enrollmentId: x.classEnrollmentId,
            displayName: x.displayName,
            lrn: null,
            studentNumber: null,
          }));
        return {
          row: r.row,
          raw: r.raw,
          sex: r.sex ?? null,
          status: candidates.length === 1 ? 'matched'
            : candidates.length > 1 ? 'ambiguous' : 'new',
          candidates,
        };
      });

      const termOrdinals = (wb.terms ?? []).map((t) => t.ordinal);
      const periods = YEAR_TRIMESTER.periods
        .filter((p) => termOrdinals.includes(p.ordinal))
        .map((p) => ({
          ordinal: p.ordinal,
          periodId: p.id,
          name: p.name,
          editable: cls
            ? ['draft', 'in_progress', 'returned', 'reopened']
              .includes(cls.status[p.id] ?? 'draft')
            : true,
        }));

      const assessments: ImportResolution['assessments'] = [];
      for (const t of wb.terms ?? []) {
        const period = periods.find((p) => p.ordinal === t.ordinal);
        const existing = cls && period
          ? assessmentsFor(cls.id, period.periodId) : ASSESSMENTS;
        for (const c of t.components ?? []) {
          let ordinal = 0;
          for (const item of c.items ?? []) {
            const code = item.childComponentCode ?? c.key;
            const n = item.childComponentCode ? 1 : (ordinal += 1);
            const match = existing.find(
              (a) => a.componentId === code && a.ordinal === n);
            assessments.push({
              termOrdinal: t.ordinal,
              componentKey: c.key,
              itemCode: item.code,
              ordinal: n,
              newHps: item.highestPossibleScore,
              assessmentId: match?.id ?? null,
              currentHps: match?.highestPossibleScore ?? null,
              status: !match ? 'willCreate'
                : match.highestPossibleScore !== item.highestPossibleScore
                  ? 'hpsChanged' : 'unchanged',
            });
          }
        }
      }

      const section = cls
        ? SECTIONS.find((x) => x.gradeLevel === cls.gradeLevel && x.name === cls.section)
        : undefined;

      return {
        options: {
          academicYears: [{ id: YEAR_TRIMESTER.id, label: YEAR_TRIMESTER.label }],
          gradeLevels: GRADE_LEVELS.map((g) => ({ id: g.id, name: g.name })),
          sections: SECTIONS.map((x) => ({
            id: x.id, name: x.name, gradeLevelId: x.gradeLevelId,
          })),
          subjects: FIXTURE_SUBJECTS.map((x) => ({
            id: x.id, code: x.code, title: x.title,
          })),
        },
        class: {
          status: cls ? 'matched' : 'unresolved',
          classId: cls?.id ?? null,
          academicYearId: YEAR_TRIMESTER.id,
          gradeLevelId: section?.gradeLevelId ?? null,
          sectionId: section?.id ?? null,
          subjectId: cls
            ? (FIXTURE_SUBJECTS.find((x) => x.code === cls.subjectCode)?.id ?? null)
            : null,
          gradingSchemeId: schemeResolved?.id ?? null,
          label: cls ? `${cls.gradeLevel} – ${cls.section} · ${cls.subject}` : null,
          teacher: { userId: CURRENT_USER.id, displayName: CURRENT_USER.name },
        },
        periods,
        components,
        learners,
        assessments,
        permissions: {
          runImport: true, createClass: false, createStudent: true, writeMarks: true,
        },
        issues: cls ? [] : [{
          severity: 'error' as const,
          code: 'no-such-class',
          where: 'INPUT!J7',
          message:
            'No class here matches this workbook. In the demo only the seeded '
            + 'classes exist, and an import cannot create one.',
        }],
      };
    },

    async commitImport(plan: ImportPlan) {
      const cls = CLASSES.find((c) => c.id === plan.classId);
      if (!cls) throw new Error('That class no longer exists.');

      // Workbook row -> class-enrolment id, built as learners resolve.
      // The same reason the server does it: a learner being created has
      // no id until the moment they are created.
      const rows = new Map<number, string>();
      let studentsCreated = 0;
      for (const learner of plan.learners) {
        if (learner.action === 'link' && learner.enrollmentId) {
          rows.set(learner.row, learner.enrollmentId);
        } else if (learner.action === 'create' && learner.student) {
          const id = `ce-imp-${ROSTER.length + 1}`;
          const displayName = [learner.student.lastName, learner.student.firstName]
            .filter(Boolean).join(', ');
          ROSTER.push({ classEnrollmentId: id, studentId: `st-imp-${ROSTER.length + 1}`, displayName });
          cls.studentCount = ROSTER.length;
          rows.set(learner.row, id);
          studentsCreated += 1;
        }
      }

      let created = 0;
      let marks = 0;
      for (const period of plan.periods) {
        const key = `${cls.id}|${period.periodId}`;
        const added = importedAssessments.get(key) ?? [];
        // What this class ALREADY holds in THIS period — not the shared
        // ASSESSMENTS template.
        //
        // Consulting the template was wrong in exactly one case, and it
        // is the case the demonstration runs on: a period with no
        // assessments of its own. The template still listed WW1..TE, so
        // the import concluded every column already existed, created
        // none, then matched no marks against the period's (empty) list
        // and imported zero — while still reporting success. Silent, and
        // only reachable once a period was genuinely empty.
        const existing = assessmentsFor(cls.id, period.periodId);
        for (const a of period.assessments) {
          if (existing.some(
            (x) => x.componentId === a.componentId && x.ordinal === a.ordinal)) continue;
          if (added.some((x) => x.componentId === a.componentId && x.ordinal === a.ordinal)) continue;
          added.push({
            id: `a-imp-${a.componentId}-${a.ordinal}`,
            componentId: a.componentId,
            ordinal: a.ordinal,
            title: null,
            highestPossibleScore: a.highestPossibleScore,
          });
          created += 1;
        }
        importedAssessments.set(key, added);

        const all = assessmentsFor(cls.id, period.periodId);
        for (const mark of period.marks) {
          const ce = rows.get(mark.row);
          const assessment = all.find(
            (a) => a.componentId === mark.componentId && a.ordinal === mark.ordinal);
          if (!ce || !assessment) continue;
          // A blank stays a blank. Writing zero here would fail a
          // learner who simply has not sat the test.
          editedScores.set(`${ce}|${assessment.id}`, { raw: mark.raw, isExcused: false });
          marks += 1;
        }
      }

      const record: ImportRecord = {
        id: `imp-${importBatches.length + 1}`,
        fileName: plan.fileName,
        at: new Date().toISOString(),
        classId: cls.id,
        className: `${cls.gradeLevel} – ${cls.section} · ${cls.subject}`,
        importedBy: CURRENT_USER.name,
        summary: {
          createdClass: false,
          studentsCreated,
          learnersOnRoster: rows.size,
          assessments: created,
          marks,
        },
      };
      importBatches.push(record);

      const result: ImportResult = {
        batchId: record.id,
        classId: cls.id,
        createdClass: false,
        studentsCreated,
        learnersOnRoster: rows.size,
        assessments: created,
        marks,
      };
      return result;
    },

    async getImportHistory(limit) {
      return [...importBatches].reverse().slice(0, limit ?? 50);
    },

    /**
     * The demo learner is in Grade 10 Pearl, so their schedule is the
     * Pearl classes — derived the same way the server derives it, from
     * section membership rather than from a hand-written list.
     *
     * MAPEH deliberately has no teacher in this fixture and one class
     * has no room, so the empty states are exercised by the demo rather
     * than only by a test.
     */
    async getMySchedule() {
      const section = 'Pearl';
      return {
        enrollment: {
          academicYear: YEAR_TRIMESTER.label,
          gradeLevel: 'Grade 10',
          section,
          status: 'enrolled',
        },
        classes: CLASSES
          .filter((c) => c.section === section && c.gradeLevel === 'Grade 10')
          .map((c) => ({
            classId: c.id,
            subject: c.subject,
            subjectCode: c.subjectCode,
            teacher: c.subjectCode === 'MAPEH10' ? null : CURRENT_USER.name,
            when: c.scheduleNote,
            room: c.subjectCode === 'MAPEH10' ? null : c.room,
          }))
          .sort((a, b) => a.subject.localeCompare(b.subject)),
      };
    },

    async getMyHistory() {
      return [
        {
          academicYearId: YEAR_TRIMESTER.id, academicYear: '2026-2027',
          gradeLevel: 'Grade 10', section: 'Pearl', status: 'enrolled',
          promotionStatus: null, generalAverage: null,
          schoolName: 'Angono National High School',
        },
        {
          academicYearId: 'year-2025', academicYear: '2025-2026',
          gradeLevel: 'Grade 9', section: null, status: 'completed',
          promotionStatus: 'promoted', generalAverage: 86,
          schoolName: 'Taytay National High School',
        },
      ] satisfies StudentHistoryRow[];
    },
  };

  return src;
}

/* ------------------------------------------------------------------ *
 * Fixture-side workflow support
 * ------------------------------------------------------------------ */

const ATTENDANCE_STATUSES: AttendanceDay['statuses'] = [
  { id: 'as-p', code: 'P', label: 'Present', symbol: 'P', countsAs: 'present' },
  { id: 'as-a', code: 'A', label: 'Absent',  symbol: 'A', countsAs: 'absent' },
  { id: 'as-l', code: 'L', label: 'Late',    symbol: 'L', countsAs: 'present' },
  { id: 'as-e', code: 'E', label: 'Excused', symbol: 'E', countsAs: 'neutral' },
];

const attendanceMarks = new Map<string, string>();

/**
 * The legal transitions, mirroring app.assert_transition in migration
 * 0010. Exported so the test suite can assert the two agree.
 */
/**
 * Re-exported, not redefined.
 *
 * This file used to keep its own copy of the table so offline
 * development exercised real constraints. It kept a test honest right up
 * until migration 0022 added three states, at which point the copy was
 * simply wrong and the fixtures accepted transitions the server refuses.
 * One table, imported.
 */
export { TRANSITIONS } from '../lib/status';

export function assertTransition(from: string, to: string): void {
  const legal = (TRANSITIONS as Record<string, readonly string[]>)[from];
  if (!legal?.includes(to)) {
    throw new Error(`Illegal transition: ${from} → ${to}`);
  }
}

/** id shape: sub-<classId>-<periodId> */
function locate(submissionId: string): { cls: ClassSummary; periodId: string } {
  const rest = submissionId.replace(/^sub-/, '');
  const cls = CLASSES.find((c) => rest.startsWith(`${c.id}-`));
  if (!cls) throw new Error('Submission not found.');
  return { cls, periodId: rest.slice(cls.id.length + 1) };
}

function moveSubmission(submissionId: string, to: SubmissionRow['status']): void {
  // id shape: sub-<classId>-<periodId>
  const rest = submissionId.replace(/^sub-/, '');
  const cls = CLASSES.find((c) => rest.startsWith(`${c.id}-`));
  if (!cls) throw new Error('Submission not found.');
  const periodId = rest.slice(cls.id.length + 1);
  assertTransition(cls.status[periodId] ?? 'draft', to);
  cls.status[periodId] = to;
}
