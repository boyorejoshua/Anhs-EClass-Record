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
  GradebookData, StudentGradeRow, StudentHistoryRow, StudentProfile, SubmissionRow,
  ValidationReport,
} from './types';
import type { Sf10Payload } from './sf10';

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
  periodStructure: 'quarter' | 'semester' | 'trimester' | 'custom';
  status: string;
  periods: SessionPeriod[];
}

export interface SessionContext {
  user: SessionUser;
  school: SessionSchool;
  academicYears: SessionYear[];
  settings: Record<string, unknown>;
}

export interface ScoreEdit {
  assessmentId: string;
  classEnrollmentId: string;
  raw: number | null;
  isExcused: boolean;
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

  /* ---- attendance ------------------------------------------------- */
  getAttendance(classId: string, date: string): Promise<AttendanceDay>;
  saveAttendance(classId: string, date: string, marks: AttendanceMark[]): Promise<{ written: number }>;

  /* ---- the grade workflow ----------------------------------------- *
   * Every one of these is a database RPC that writes an audit row and
   * refuses an illegal transition. None of them is a client-side status
   * change: a modified client cannot skip a state.
   * ------------------------------------------------------------------ */
  validateSubmission(classId: string, periodId: string): Promise<ValidationReport>;
  submitGrades(classId: string, periodId: string, acknowledgeWarnings: boolean): Promise<void>;
  getSubmissionQueue(academicYearId: string): Promise<SubmissionRow[]>;
  returnSubmission(submissionId: string, reason: string): Promise<void>;
  approveSubmission(submissionId: string): Promise<void>;
  finalizeSubmission(submissionId: string): Promise<void>;
  publishSubmission(submissionId: string): Promise<void>;

  /* ---- student portal --------------------------------------------- *
   * No student id parameter anywhere. The learner is resolved
   * server-side from the verified JWT (app.current_student_id()); a
   * student id accepted from the client is an IDOR waiting to happen.
   * ------------------------------------------------------------------ */
  getMyProfile(): Promise<StudentProfile>;
  getMyGrades(academicYearId?: string): Promise<StudentGradeRow[]>;
  getMyHistory(): Promise<StudentHistoryRow[]>;
}
