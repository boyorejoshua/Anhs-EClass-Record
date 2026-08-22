/** Shapes returned by the data layer. Mirror the database exactly. */
import type { GradingScheme } from '../lib/grading';

export type Role = 'teacher' | 'adviser' | 'registrar' | 'school_admin' | 'student';
export type SubmissionStatus =
  | 'draft' | 'in_progress' | 'submitted' | 'returned'
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
