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
  gradeLevel: string;
  section: string | null;
  enrollmentStatus: string;
  generalAverage: number | null;
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
