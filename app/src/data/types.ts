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
  periodStructure: 'quarter' | 'semester' | 'trimester' | 'custom';
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
