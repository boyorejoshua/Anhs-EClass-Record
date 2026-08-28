/** Shapes returned by the data layer. Mirror the database exactly. */
import type { GradingScheme } from '../lib/grading';

export type Role = 'teacher' | 'adviser' | 'registrar' | 'school_admin' | 'student';
export type SubmissionStatus =
  | 'draft' | 'in_progress' | 'submitted'
  | 'received'            // the class adviser has signed for it
  | 'forwarded'           // the adviser has passed it to the registrar
  | 'registrar_received'  // the registrar has signed for it
  | 'returned'
  | 'approved' | 'finalized' | 'published' | 'reopened';

export interface CurrentUser {
  id: string;
  name: string;
  initials: string;
  roles: Role[];
  schoolId: string;
  schoolName: string;
  schoolCode: string;
}

export interface AcademicPeriod {
  id: string;
  ordinal: number;
  name: string;
  shortName: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'closed';
}

export interface AcademicYear {
  id: string;
  label: string;
  /** Mirrors academic_years.period_structure. `three_term` is DO 009 s.2026. */
  periodStructure: 'three_term' | 'quarter' | 'semester' | 'custom';
  periods: AcademicPeriod[];
}

export interface ClassSummary {
  id: string;
  gradeLevel: string;
  section: string;
  subject: string;
  subjectCode: string;
  studentCount: number;
  scheduleNote: string | null;
  room: string | null;
  /** Per period, keyed by period id. */
  status: Record<string, SubmissionStatus>;
  /**
   * The chain of custody, per period. Present only for periods that have
   * a submission row at all — a period nobody has submitted has no
   * receipts, which is different from having empty ones.
   */
  receipts: Record<string, {
    receivedAt: string | null;
    forwardedAt: string | null;
    registrarReceivedAt: string | null;
    recalledAt: string | null;
  }>;
  completeness: Record<string, { scored: number; total: number }>;
}

export interface RosterStudent {
  classEnrollmentId: string;
  studentId: string;
  displayName: string;
}

export interface GradebookData {
  classId: string;
  periodId: string;
  scheme: GradingScheme;
  assessments: import('../lib/grading').Assessment[];
  roster: RosterStudent[];
  /** classEnrollmentId -> assessmentId -> score */
  scores: Record<string, Record<string, { raw: number | null; isExcused: boolean }>>;
  status: SubmissionStatus;
  editable: boolean;
}

/* ==================================================================== *
 * Contracts added for the functional build-out (migration 0018).
 * Field names mirror the JSON the rds.* functions return, so a payload
 * crosses into TypeScript without a mapping layer to drift out of date.
 * ==================================================================== */

export interface ClassStudent {
  classEnrollmentId: string;
  enrollmentId: string;
  studentId: string;
  displayName: string;
  studentNumber: string | null;
  lrn: string | null;
  sex: string | null;
  enrollmentStatus: string;
  classStatus: string;
  finalGrade: number | null;
}

export interface DirectoryStudent {
  studentId: string;
  displayName: string;
  studentNumber: string | null;
  lrn: string | null;
  sex: string | null;
  gradeLevelId: string;
  gradeLevel: string;
  sectionId: string | null;
  section: string | null;
  enrollmentStatus: string;
  generalAverage: number | null;
}

/**
 * How the directory is narrowed. Every field here is applied by the
 * DATABASE, not by the browser after the fact — a school of 1,500 should
 * not ship every learner's LRN to the client so the client can hide most
 * of them.
 */
export interface StudentQuery {
  search?: string;
  gradeLevelId?: string;
  sectionId?: string;
  limit?: number;
}

/**
 * One grade level the school runs, and how full it is this year.
 *
 * This is what the directory shows FIRST, in place of a list of every
 * learner. Six rows instead of fifteen hundred, and it answers the
 * question a registrar actually opens the screen with — which is nearly
 * always about one grade level, not about the whole school.
 *
 * A level with `enrolled: 0` is still returned. Somebody setting up
 * Grade 11 for the first time needs to see that it exists and is empty,
 * not wonder where it went.
 */
export interface GradeLevelCensus {
  id: string;
  code: string;
  name: string;
  ordinal: number;
  /** 'SHS' marks Senior High, which is a different cycle — not KS3 + 2. */
  keyStage: string | null;
  enrolled: number;
  sections: number;
}

export interface AttendanceStatusOption {
  id: string;
  code: string;
  label: string;
  symbol: string;
  countsAs: 'present' | 'absent' | 'neutral';
}

export interface AttendanceRosterRow {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  statusId: string | null;
  note: string | null;
}

export interface AttendanceDay {
  classId: string;
  date: string;
  calendarDayId: string | null;
  /** 'class_day' | 'non_teaching' | 'holiday' | 'not_in_calendar' */
  dayType: string;
  dayNote: string | null;
  /** A non-class day is a distinct state, not an empty roster. */
  isClassDay: boolean;
  statuses: AttendanceStatusOption[];
  roster: AttendanceRosterRow[];
}

export interface AttendanceMark {
  enrollmentId: string;
  statusId: string;
  note?: string | null;
}

/** What `validate_submission` returns. Blocking errors vs. advisory warnings. */
export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface SubmissionRow {
  submissionId: string;
  classId: string;
  periodId: string;
  periodName: string;
  gradeLevel: string;
  section: string;
  subject: string;
  teacher: string | null;
  status: SubmissionStatus;
  submittedAt: string | null;
  /** When the class adviser signed for it. Never cleared by a later return. */
  receivedAt: string | null;
  /** When the adviser passed it to the registrar. */
  forwardedAt: string | null;
  /** When the registrar signed for it. */
  registrarReceivedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  /**
   * Absent on the adviser's queue: an adviser cannot read another
   * teacher's marks, and a count silently returning 0 would read as
   * "nothing entered" rather than "not visible to you".
   */
  studentCount?: number;
  completeness?: { scored: number; total: number };
}

export interface StudentProfile {
  student: {
    studentId: string;
    displayName: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    lrn: string | null;
    studentNumber: string | null;
    sex: string;
    birthDate: string | null;
    barangay: string | null;
    municipality: string | null;
    province: string | null;
  } | null;
  enrollment: {
    academicYear: string;
    gradeLevel: string;
    section: string | null;
    status: string;
    dateEnrolled: string;
    adviser: string | null;
  } | null;
  settings: Record<string, unknown>;
}

export interface StudentGradeRow {
  academicYear: string;
  academicYearId: string;
  gradeLevel: string;
  section: string | null;
  subject: string;
  subjectCode: string;
  periods: Array<{ ordinal: number; name: string; shortName: string; grade: number | null }>;
  finalGrade: number | null;
  remark: string | null;
}

export interface StudentHistoryRow {
  academicYearId: string;
  academicYear: string;
  gradeLevel: string;
  section: string | null;
  status: string;
  promotionStatus: string | null;
  generalAverage: number | null;
  schoolName: string;
}

/**
 * A grade as the SERVER recorded it.
 *
 * Distinct from anything `lib/grading` returns in the browser. The
 * browser's number is a preview that changes as a teacher types; this
 * one was computed by `compute-period-grades`, written to
 * `period_grades`, and is what the registrar reviews and the learner
 * eventually sees. Where a screen can show either, it shows this one and
 * says when it was computed — a stored grade and a live recalculation
 * that disagree is a fact the teacher needs to know, not one to paper
 * over by silently preferring whichever is newer.
 */
export interface PersistedGrade {
  initialGrade: number | null;
  periodGrade: number | null;
  descriptor: string | null;
  remark: string | null;
  passed: boolean | null;
  /** ISO timestamp. */
  computedAt: string;
  computedMode: 'running' | 'final';
  /** Increments each time the grade was superseded; 1 is the first. */
  version: number;
  componentBreakdown: unknown;
}

/* ==================================================================== *
 * STUDENT MANAGEMENT
 *
 * The distinction these types exist to protect: a STUDENT is a person,
 * an ENROLLMENT is that person's participation in one school year. They
 * are separate shapes because they are separate rows with separate
 * lifetimes — a section transfer edits the second and never touches the
 * first.
 * ==================================================================== */

/** Identity. One per person, per school, for as long as they attend. */
export interface StudentIdentity {
  studentId: string;
  displayName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  studentNumber: string | null;
  lrn: string | null;
  sex: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  motherTongue: string | null;
  religion: string | null;
  addressLine: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  contactNumber: string | null;
  email: string | null;
  status: string;
  hasPortalAccount: boolean;
}

/** One school year of attendance. The academic history IS this list. */
export interface EnrollmentRow {
  enrollmentId: string;
  academicYearId: string;
  academicYear: string;
  yearStatus: string;
  gradeLevel: string;
  gradeLevelId: string;
  section: string | null;
  sectionId: string | null;
  status: string;
  promotionStatus: string | null;
  generalAverage: number | null;
  dateEnrolled: string | null;
}

export interface StudentGradeEntry {
  academicYear: string;
  period: string;
  periodOrdinal: number;
  subject: string;
  subjectCode: string;
  grade: number | null;
  descriptor: string | null;
  passed: boolean | null;
}

/**
 * The STAFF-facing view of a learner.
 *
 * Distinct from `StudentProfile`, which is the portal's view of the
 * signed-in learner's own record. Same person, different question: the
 * portal asks "what are my grades", this asks "who is this learner and
 * what is their history here". Keeping them apart stops a portal screen
 * accidentally rendering a field only staff should see.
 */
export interface StudentRecord {
  student: StudentIdentity;
  history: EnrollmentRow[];
  grades: StudentGradeEntry[];
}

/**
 * What the "create a section / create a class" form may offer.
 *
 * `sections` and `classes` are the CURRENT state for the chosen year —
 * the screen is a management view as much as a creation form, so a
 * registrar can see what already exists before adding to it.
 */
export interface SectionSetupOptions {
  gradeLevels: Array<{ id: string; name: string; ordinal: number }>;
  subjects: Array<{ id: string; code: string; title: string }>;
  /** Anyone holding a teaching role — candidates for adviser or class teacher. */
  teachers: Array<{ id: string; displayName: string }>;
  sections: Array<{
    id: string; name: string; gradeLevelId: string; gradeLevel: string;
    adviserUserId: string | null; adviserName: string | null;
    room: string | null; capacity: number | null; classCount: number;
  }>;
  classes: Array<{
    id: string; sectionId: string; subjectId: string; subject: string;
    teacherId: string | null; teacherName: string | null;
  }>;
  permissions: { canAssign: boolean };
}

export interface SectionDraft {
  academicYearId: string;
  gradeLevelId: string;
  name: string;
  adviserUserId?: string | null;
  room?: string | null;
  capacity?: number | null;
}

export interface ClassDraft {
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  teacherUserId?: string | null;
  scheduleNote?: string | null;
  room?: string | null;
}

/** One section an adviser advises, for a given school year. */
export interface AdvisorySection {
  id: string;
  name: string;
  gradeLevel: string;
  gradeLevelId: string;
}

/** One learner's grade in one subject, for the consolidated view. */
export interface ConsolidatedGradeCell {
  classId: string;
  grade: number | null;
  descriptor: string | null;
  passed: boolean | null;
  statusCode: string | null;
}

/**
 * Every subject, every learner, one section, one period. What an
 * adviser needs to consolidate a report card — the thing every subject
 * teacher's own submission feeds into.
 */
export interface ConsolidatedGrades {
  section: { id: string; name: string; gradeLevel: string };
  /** Column order. `classId` lets a cell link back to the real gradebook. */
  subjects: Array<{ id: string; title: string; classId: string }>;
  rows: Array<{
    studentId: string;
    displayName: string;
    /** Keyed by subject id. A subject absent here has no grade YET, not zero. */
    grades: Record<string, ConsolidatedGradeCell>;
  }>;
}

/**
 * What a TEACHER's own "add a class" form offers.
 *
 * Deliberately not `SectionSetupOptions`, which is the registrar's and
 * carries a `teachers` list. This one has no teacher field at all — the
 * answer is always "you" — and it carries `myClasses` so the form can
 * say "you already teach this" instead of silently resolving to it.
 */
export interface MyClassSetupOptions {
  gradeLevels: Array<{ id: string; name: string; ordinal: number }>;
  subjects: Array<{ id: string; code: string; title: string }>;
  sections: Array<{
    id: string; name: string; gradeLevelId: string; gradeLevel: string;
    learnerCount: number;
  }>;
  myClasses: Array<{ id: string; sectionId: string; subjectId: string }>;
  permissions: { canCreateOwn: boolean };
}

/**
 * A class a teacher creates for themselves. The section is given EITHER
 * by id (picked from the list) or by grade level + name (typed because
 * it does not exist yet) — never both, and the server resolves a typed
 * name case-insensitively onto an existing section.
 */
export interface MyClassDraft {
  academicYearId: string;
  subjectId: string;
  sectionId?: string | null;
  gradeLevelId?: string | null;
  sectionName?: string | null;
  scheduleNote?: string | null;
  room?: string | null;
}

/**
 * The roster of a class the caller teaches, plus who could join it.
 *
 * `candidates` matters as much as `roster`. A teacher typing a name
 * that already exists is exactly how a school ends up with two records
 * for one child, so the form offers the school's existing learners
 * first and treats free text as the fallback.
 */
export interface MyClassRoster {
  classId: string;
  roster: Array<{
    classEnrollmentId: string;
    studentId: string;
    displayName: string;
    firstName: string;
    lastName: string;
    sex: 'male' | 'female' | null;
    /** Null means provisional — the registrar still owes this record an LRN. */
    lrn: string | null;
    /** Removing them would discard recorded work, so removal is refused. */
    hasScores: boolean;
  }>;
  candidates: Array<{
    studentId: string;
    displayName: string;
    lrn: string | null;
    /** Already enrolled in this school year, just not in this class. */
    enrolledHere: boolean;
  }>;
  permissions: { canWrite: boolean };
}

/**
 * A spelling correction. Name parts only — never LRN, sex, birth date,
 * status or enrolment, which are the registrar's to own. The absent
 * fields are not a rule this shape enforces; they are a request it
 * cannot express.
 */
export interface LearnerNameFix {
  studentId: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  /** Renaming onto somebody else's name is refused without this. */
  confirmNamesake?: boolean;
}

/** Either an existing learner by id, or a new one by name. Never both. */
export interface LearnerToAdd {
  classId: string;
  studentId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  sex?: 'male' | 'female' | null;
  /** "Yes, this really is a different person with the same name." */
  confirmNewPerson?: boolean;
}

/**
 * The school's own printable details.
 *
 * These head every SF form the school files, which is why they stopped
 * being an onboarding-only concern: a typo in the division name is a
 * typo on filed documents.
 *
 * `code` and `status` are returned but NOT editable. `code` is the
 * tenant slug — the subdomain, and part of how the tenant is resolved —
 * so a school renaming it would lock its own users out mid-session.
 * `status` is Mendtrix's lever; a suspended school must not be able to
 * un-suspend itself.
 */
/* ------------------------------------------------------------------ *
 * THE SUBJECT CATALOGUE
 *
 * Adding a subject is not the plain CRUD it looks like. A subject must
 * belong to a category, and the category carries the grading scheme —
 * so choosing "Core Subject" rather than "MAPEH / EPP-TLE" is choosing
 * 20/50/30 over 20/60/20 for every learner who ever takes it. The
 * weights travel with the category for exactly that reason.
 * ------------------------------------------------------------------ */

export interface SubjectCategory {
  id: string;
  code: string;
  name: string;
  /** "WW 20% · PT 50% · EX 30%", or null when the category has no scheme. */
  weights: string | null;
}

export interface CatalogueSubject {
  id: string;
  code: string;
  title: string;
  categoryId: string;
  category: string;
  units: number | null;
  isActive: boolean;
  /** Classes already running this subject — what retiring it would leave behind. */
  classCount: number;
}

export interface SubjectCatalogue {
  categories: SubjectCategory[];
  subjects: CatalogueSubject[];
  permissions: { canWrite: boolean };
}

export interface SubjectDraft {
  code: string;
  title: string;
  categoryId: string;
  units?: number | null;
}

export interface SchoolProfile {
  id: string;
  /** Read-only: the tenant slug. */
  code: string;
  name: string;
  govtSchoolId: string | null;
  schoolType: string | null;
  region: string | null;
  division: string | null;
  district: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** Read-only. */
  status: string;
  permissions: { canWrite: boolean };
}

/** The editable half of SchoolProfile. Deliberately omits code and status. */
export interface SchoolProfileEdit {
  name: string;
  govtSchoolId?: string | null;
  region?: string | null;
  division?: string | null;
  district?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

/* ==================================================================== *
 * ACCOUNTS
 *
 * A STAFF ACCOUNT is a login. It is not a student — `StudentProfile`
 * above is the learner's portal record and reads a different identity
 * (app.current_student_id()). Keeping the two shapes apart is what
 * stops "my profile" meaning two different things depending on who is
 * signed in.
 * ==================================================================== */

/** One account in the school directory, as an administrator sees it. */
export interface StaffAccount {
  id: string;
  email: string;
  employeeId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  status: 'active' | 'inactive' | 'suspended';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  position: string | null;
  /** So the screen can refuse to offer an administrator their own delete. */
  isSelf: boolean;
  roles: string[];
}

export interface StaffDirectory {
  roles: Array<{ code: string; name: string }>;
  users: StaffAccount[];
  permissions: {
    canWrite: boolean;
    canAssignRoles: boolean;
    canDeactivate: boolean;
  };
}

/** The signed-in person's own account. Distinct from StudentProfile. */
export interface MyAccount {
  id: string;
  email: string;
  employeeId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  status: string;
  mustChangePassword: boolean;
  position: string | null;
  employmentStatus: string | null;
  dateHired: string | null;
  qualifications: string | null;
  ancillaryAssignments: string | null;
  schoolName: string | null;
  roles: string[];
}

/** The fields a person may change about themselves. Never email or roles. */
export interface ProfileEdit {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  position?: string | null;
  qualifications?: string | null;
}

/** What an administrator fills in to create an account. */
export interface NewAccount {
  email: string;
  /** Temporary. The person is forced to replace it on first sign-in. */
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  employeeId?: string | null;
  position?: string | null;
  roles: string[];
}

/** What an enrolment form may offer. Never free text. */
export interface EnrollmentOptions {
  gradeLevels: Array<{ id: string; name: string; ordinal: number }>;
  sections: Array<{
    id: string; name: string; gradeLevelId: string; gradeLevel: string;
    adviserUserId: string | null;
  }>;
}

/** The two halves of an admission, kept apart on the way in as well. */
export interface StudentDraft {
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  lrn?: string;
  studentNumber?: string;
  sex?: string;
  birthDate?: string;
  addressLine?: string;
  contactNumber?: string;
  email?: string;
}

export interface EnrollmentDraft {
  academicYearId: string;
  gradeLevelId: string;
  sectionId?: string;
  dateEnrolled?: string;
  status?: string;
  previousSchool?: string;
  remarks?: string;
}
