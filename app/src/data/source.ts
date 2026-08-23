/**
 * The data-source contract.
 *
 * Both implementations satisfy it: `fixtures.ts` for review and offline
 * development, `supabase.ts` against a real database. Screens depend on
 * this interface and never on either implementation, so swapping is one
 * line in `index.ts`.
 *
 * Everything is async, including the fixture implementation. Making the
 * fixture path synchronous would let loading and error states go
 * unwritten, and they would then be discovered by a school on a bad
 * connection rather than by us.
 */
import type {
  AttendanceDay, AttendanceMark, ClassStudent, ClassSummary, DirectoryStudent,
  EnrollmentDraft, EnrollmentOptions, GradebookData, PersistedGrade, StudentDraft,
  StudentGradeRow, StudentHistoryRow, StudentProfile, StudentRecord,
  SubmissionRow, ValidationReport,
} from './types';
import type { Sf10Payload } from './sf10';
import type { CohortSection } from '../lib/loa';
import type { ImportPlan, ImportResolution } from '../lib/import/plan';

export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  email: string | null;
  employeeId: string | null;
  schoolId: string;
  roles: string[];
}

export interface SessionSchool {
  id: string;
  code: string;
  name: string;
  govtSchoolId: string | null;
  region: string | null;
  division: string | null;
  district: string | null;
}

export interface SessionPeriod {
  id: string;
  ordinal: number;
  name: string;
  shortName: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'closed';
}

export interface SessionYear {
  id: string;
  label: string;
  /** Mirrors academic_years.period_structure. `three_term` is DO 009 s.2026. */
  periodStructure: 'three_term' | 'quarter' | 'semester' | 'custom';
  status: string;
  periods: SessionPeriod[];
}

export interface SessionContext {
  user: SessionUser;
  school: SessionSchool;
  academicYears: SessionYear[];
  settings: Record<string, unknown>;
}

/** One assessment column as the Setup screen edits it. */
export interface AssessmentDraft {
  /** Absent for a newly added item; the server assigns one. */
  id?: string;
  componentId: string;
  ordinal: number;
  title: string | null;
  highestPossibleScore: number;
}

export interface ScoreEdit {
  assessmentId: string;
  classEnrollmentId: string;
  raw: number | null;
  isExcused: boolean;
}

export interface ImportResult {
  batchId: string;
  classId: string;
  createdClass: boolean;
  studentsCreated: number;
  learnersOnRoster: number;
  assessments: number;
  marks: number;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  at: string;
  classId: string | null;
  className: string | null;
  importedBy: string | null;
  summary: {
    createdClass?: boolean;
    studentsCreated?: number;
    learnersOnRoster?: number;
    assessments?: number;
    marks?: number;
  };
}

export interface DataSource {
  /** Identifies the implementation in the UI, so nobody demos fixtures believing they are live. */
  readonly kind: 'fixtures' | 'supabase';

  getSession(): Promise<SessionContext | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;

  getClasses(academicYearId: string): Promise<ClassSummary[]>;
  getGradebook(classId: string, periodId: string): Promise<GradebookData>;
  /** Returns how many rows the server actually wrote. */
  saveScores(edits: ScoreEdit[]): Promise<{ written: number }>;
  getSf10(studentId: string): Promise<Sf10Payload>;

  /* ---- roster & directory ---------------------------------------- */
  getClassStudents(classId: string): Promise<ClassStudent[]>;
  getStudents(academicYearId: string, search?: string): Promise<DirectoryStudent[]>;

  /* ---- student management ------------------------------------------ *
   * A STUDENT is a person; an ENROLLMENT is one school year of their
   * attendance. Every signature below keeps them apart, because the
   * commonest way to corrupt an academic record is to treat a section
   * transfer as a new learner.
   * ------------------------------------------------------------------ */

  /** Identity, every year of attendance, and whatever grades the caller may read. */
  getStudentRecord(studentId: string): Promise<StudentRecord | null>;
  /** The grade levels and sections a form may offer. Never free text. */
  getEnrollmentOptions(academicYearId: string): Promise<EnrollmentOptions>;
  /** Create the person AND their first year. Refuses a duplicate LRN or number. */
  admitStudent(
    student: StudentDraft, enrollment: EnrollmentDraft,
  ): Promise<{ studentId: string; enrollmentId: string }>;
  /** Enrol an EXISTING person in another year — this is what promotion is. */
  enrolStudent(studentId: string, enrollment: EnrollmentDraft): Promise<string>;
  /** Patch identity. An absent key is left alone, never blanked. */
  updateStudent(studentId: string, patch: Partial<StudentDraft>): Promise<void>;
  /** Patch one year. This is how a SECTION TRANSFER happens. */
  updateEnrollment(enrollmentId: string, patch: Partial<EnrollmentDraft>): Promise<void>;

  /* ---- attendance ------------------------------------------------- */
  getAttendance(classId: string, date: string): Promise<AttendanceDay>;
  saveAttendance(classId: string, date: string, marks: AttendanceMark[]): Promise<{ written: number }>;

  /* ---- the grade workflow ----------------------------------------- *
   * Every one of these is a database RPC that writes an audit row and
   * refuses an illegal transition. None of them is a client-side status
   * change: a modified client cannot skip a state.
   * ------------------------------------------------------------------ */
  /** Replaces the assessment configuration for one class and period. */
  saveAssessments(
    classId: string, periodId: string, items: AssessmentDraft[],
  ): Promise<{ written: number; removed: number }>;

  /**
   * The grades the server has actually recorded for this class and
   * period, keyed by class-enrolment id. Empty until a submission has
   * run — a period whose grades were never computed genuinely has none,
   * and the screens say so rather than quietly substituting a
   * browser-side figure.
   */
  getPeriodGrades(classId: string, periodId: string): Promise<Record<string, PersistedGrade>>;

  /**
   * Every class section this user teaches with the same subject and
   * grade level as `classId` — the sections one LOA report covers.
   *
   * The report is filed per subject across sections, not per class, so a
   * teacher carrying four sections of Grade 7 English files one sheet.
   * Row-level security decides the list: a teacher sees only their own
   * sections, so the report cannot become a way to read a colleague's
   * class by asking for a wider cohort.
   */
  getLoaCohort(
    academicYearId: string, classId: string, periodId: string,
  ): Promise<CohortSection[]>;

  validateSubmission(classId: string, periodId: string): Promise<ValidationReport>;

  /* ---- the chain of custody --------------------------------------- *
   * A record now gets signed for at each hand-off, the way it would on
   * paper: the teacher submits, the class adviser receives it, the
   * adviser forwards it, the registrar receives it. Each step is a
   * database RPC that checks the caller's identity against the section
   * and writes an audit row.
   * ------------------------------------------------------------------ */

  /** The teacher takes it back. Refused once the adviser has received it. */
  recallSubmission(classId: string, periodId: string, reason?: string): Promise<void>;
  /** The class adviser signs for it. */
  receiveSubmission(submissionId: string): Promise<void>;
  /** The adviser passes it to the registrar. */
  forwardSubmission(submissionId: string): Promise<void>;
  /** The adviser withdraws the hand-off, while the registrar has not signed. */
  unforwardSubmission(submissionId: string): Promise<void>;
  /** The registrar signs for it, before reviewing. */
  registrarReceiveSubmission(submissionId: string): Promise<void>;
  /** Every class in the sections this adviser advises. */
  getAdviserQueue(academicYearId: string): Promise<SubmissionRow[]>;
  submitGrades(classId: string, periodId: string, acknowledgeWarnings: boolean): Promise<void>;
  getSubmissionQueue(academicYearId: string): Promise<SubmissionRow[]>;
  returnSubmission(submissionId: string, reason: string): Promise<void>;
  approveSubmission(submissionId: string): Promise<void>;
  finalizeSubmission(submissionId: string): Promise<void>;
  publishSubmission(submissionId: string): Promise<void>;

  /* ---- the Import Center ------------------------------------------ *
   * Two calls, and the split is the safety property. `resolveImport`
   * READS: it says what importing this workbook would do, and there is
   * no path from it to a write. `commitImport` WRITES: it takes ids a
   * person confirmed and does no matching of its own.
   *
   * If the commit could match names, the preview would be advisory — a
   * second, unreviewed matching run would decide the outcome and the
   * user would have approved something else.
   * ------------------------------------------------------------------ */

  /** What this workbook would do. Writes nothing, ever. */
  resolveImport(workbook: unknown): Promise<ImportResolution>;
  /** Execute a confirmed plan, in one transaction. */
  commitImport(plan: ImportPlan): Promise<ImportResult>;
  /** What has been imported, newest first. */
  getImportHistory(limit?: number): Promise<ImportRecord[]>;

  /* ---- student portal --------------------------------------------- *
   * No student id parameter anywhere. The learner is resolved
   * server-side from the verified JWT (app.current_student_id()); a
   * student id accepted from the client is an IDOR waiting to happen.
   * ------------------------------------------------------------------ */
  getMyProfile(): Promise<StudentProfile>;
  getMyGrades(academicYearId?: string): Promise<StudentGradeRow[]>;
  getMyHistory(): Promise<StudentHistoryRow[]>;
}
