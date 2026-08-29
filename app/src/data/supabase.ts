/**
 * Supabase data source — the real one.
 *
 * Every read goes through an `rds.*` contract function (migration 0014)
 * that returns the screen's payload in one round trip, already shaped
 * for TypeScript. The client stays thin on purpose: the query logic is
 * then verifiable in psql, without a browser or an HTTP layer.
 *
 * All of them are SECURITY INVOKER, so row-level security applies
 * exactly as it would to a direct query. These are a convenience, never
 * a way around the policies.
 */
import { requireSupabase } from '../lib/supabase';
import type {
  AssessmentDraft, DataSource, ImportRecord, ImportResult, ScoreEdit, SessionContext,
} from './source';
import type {
  AdvisorySection, ClassDraft, ConsolidatedGrades, LearnerNameFix, LearnerToAdd,
  MyAccount, MyClassDraft,
  MyClassRoster, MyClassSetupOptions, NewAccount,
  SchoolProfile, SchoolProfileEdit,
  SectionDraft, SectionSetupOptions, StaffDirectory,
} from './types';
import type { ImportResolution } from '../lib/import/plan';
import type {
  AttendanceDay, ClassStudent, ClassSummary, DirectoryStudent, GradeLevelCensus,
  SubjectCatalogue,
  EnrollmentOptions, GradebookData, PersistedGrade, StudentGradeRow, StudentHistoryRow,
  StudentProfile, StudentRecord, SubmissionRow, ValidationReport,
  AdmitResult, EnrollmentEvent, PortalAccountList,
} from './types';
import type { Sf10Payload } from './sf10';

/**
 * `functions.invoke` throws away the response body on a non-2xx and
 * hands back only "Edge Function returned a non-2xx status code". The
 * function puts a teacher-readable sentence in that body, so dig it out
 * rather than showing the wrapper's text.
 */
async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch { /* body was not JSON; fall through */ }
  }
  const message = error instanceof Error ? error.message : null;
  return message && !/non-2xx/i.test(message) ? message : null;
}

/** Supabase surfaces Postgres errors verbatim; make them readable first. */
function fail(where: string, error: { message: string; code?: string } | null): never {
  const code = error?.code ? ` [${error.code}]` : '';
  throw new Error(`${where} failed${code}: ${error?.message ?? 'unknown error'}`);
}

export function createSupabaseSource(): DataSource {
  // Named so methods can call each other. A method reached as
  // `source.getLoaCohort` and then invoked detached has no `this`.
  const src: DataSource = {
    kind: 'supabase',

    async getSession() {
      const sb = requireSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;

      const { data, error } = await sb.rpc('session_context');
      if (error) fail('Loading your account', error);
      // A signed-in user with no `users` row is a provisioning gap, not
      // an empty state — say so rather than rendering a blank shell.
      if (!data?.user) {
        throw new Error(
          'Signed in, but this account has no user record in the school. ' +
          'Ask an administrator to finish setting it up.',
        );
      }
      return data as SessionContext;
    },

    async signIn(email, password) {
      const sb = requireSupabase();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        // Never distinguish "no such account" from "wrong password":
        // the difference tells an attacker which addresses are real.
        throw new Error('That email and password did not match an account.');
      }
    },

    async signOut() {
      await requireSupabase().auth.signOut();
    },

    onAuthChange(cb) {
      const sb = getOrNull();
      if (!sb) return () => {};
      const { data } = sb.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },

    async getClasses(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('my_classes', { p_year_id: academicYearId });
      if (error) fail('Loading your classes', error);
      return (data ?? []) as ClassSummary[];
    },

    async getGradebook(classId, periodId) {
      const { data, error } = await requireSupabase()
        .rpc('gradebook', { p_class_id: classId, p_period_id: periodId });
      if (error) fail('Loading the gradebook', error);
      return data as GradebookData;
    },

    async saveScores(edits: ScoreEdit[]) {
      if (edits.length === 0) return { written: 0 };

      const { data, error } = await requireSupabase()
        .rpc('save_scores', { p_scores: edits });
      if (error) fail('Saving scores', error);

      const written = (data as { written: number } | null)?.written ?? 0;

      // RLS filters rows it will not accept rather than raising, so a
      // short write is silent at the database. Surface it: the likeliest
      // cause is the period having been submitted in another tab, and a
      // teacher must not be left believing work was saved.
      if (written < edits.length) {
        throw new Error(
          `Only ${written} of ${edits.length} scores were saved. This period may have ` +
          'been submitted or locked. Reload to see its current state.',
        );
      }
      return { written };
    },

    async getSf10(studentId) {
      const { data, error } = await requireSupabase()
        .rpc('sf10_jhs', { p_student_id: studentId });
      if (error) fail('Loading the permanent record', error);
      return data as Sf10Payload;
    },

    /* ---- roster & directory --------------------------------------- */

    async getClassStudents(classId) {
      const { data, error } = await requireSupabase()
        .rpc('class_students', { p_class_id: classId });
      if (error) fail('Loading the class list', error);
      return (data ?? []) as ClassStudent[];
    },

    async getStudents(academicYearId, query) {
      const { data, error } = await requireSupabase()
        .rpc('students_directory', {
          p_year_id: academicYearId,
          p_search: query?.search ?? null,
          p_grade_level_id: query?.gradeLevelId ?? null,
          p_section_id: query?.sectionId ?? null,
          p_limit: query?.limit ?? 500,
        });
      if (error) fail('Searching learners', error);
      return (data ?? []) as DirectoryStudent[];
    },

    async getSubjectCatalogue(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('subject_catalogue', { p_year_id: academicYearId });
      if (error) fail('Loading the subject list', error);
      return data as SubjectCatalogue;
    },

    async createSubject(academicYearId, draft) {
      const { data, error } = await requireSupabase().rpc('create_subject', {
        p_code: draft.code,
        p_title: draft.title,
        p_category_id: draft.categoryId,
        p_units: draft.units ?? null,
        p_year_id: academicYearId,
        p_grade_level_ids: draft.gradeLevelIds ?? [],
      });
      if (error) fail('Adding the subject', error);
      return data as string;
    },

    async setSubjectGradeLevels(subjectId, academicYearId, gradeLevelIds) {
      const { error } = await requireSupabase().rpc('set_subject_grade_levels', {
        p_subject_id: subjectId,
        p_year_id: academicYearId,
        p_grade_level_ids: gradeLevelIds,
      });
      if (error) fail('Changing where this subject is taught', error);
    },

    async setSubjectActive(subjectId, isActive) {
      const { error } = await requireSupabase().rpc('set_subject_active', {
        p_subject_id: subjectId, p_is_active: isActive,
      });
      if (error) fail(isActive ? 'Restoring the subject' : 'Retiring the subject', error);
    },

    async getGradeLevelCensus(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('grade_level_census', { p_year_id: academicYearId });
      if (error) fail('Loading grade levels', error);
      return (data ?? []) as GradeLevelCensus[];
    },

    /* ---- attendance ------------------------------------------------ */

    async getAttendance(classId, date) {
      const { data, error } = await requireSupabase()
        .rpc('attendance', { p_class_id: classId, p_date: date });
      if (error) fail('Loading attendance', error);
      return data as AttendanceDay;
    },

    async saveAttendance(classId, date, marks) {
      if (marks.length === 0) return { written: 0 };
      const { data, error } = await requireSupabase()
        .rpc('save_attendance', { p_class_id: classId, p_date: date, p_marks: marks });
      if (error) fail('Saving attendance', error);
      const written = (data as { written: number } | null)?.written ?? 0;
      // Same reasoning as saveScores: RLS filters rather than raises, so
      // a short write is silent unless we look for it.
      if (written < marks.length) {
        throw new Error(
          `Only ${written} of ${marks.length} marks were saved. Reload to see the ` +
          'current state of this day.',
        );
      }
      return { written };
    },

    /* ---- the grade workflow ---------------------------------------- */

    async saveAssessments(classId, periodId, items: AssessmentDraft[]) {
      const { data, error } = await requireSupabase().rpc('save_assessments', {
        p_class_id: classId, p_period_id: periodId, p_items: items,
      });
      if (error) fail('Saving the record book setup', error);
      return (data ?? { written: 0, removed: 0 }) as { written: number; removed: number };
    },

    async validateSubmission(classId, periodId) {
      const { data, error } = await requireSupabase()
        .rpc('validate_submission', { p_class_id: classId, p_period_id: periodId });
      if (error) fail('Checking the submission', error);
      return data as ValidationReport;
    },

    /**
     * Submission goes through the Edge Function, not straight to
     * `submit_grades`.
     *
     * The browser has been computing grades all along for immediate
     * feedback, but a number that only ever existed in a React state
     * tree is not a record. `compute-period-grades` reads the scores
     * back out of the database under this teacher's own RLS,
     * recomputes with the same engine module this file's screens use,
     * writes the result to `period_grades` as service_role — the only
     * role with that privilege — and then calls `submit_grades` as the
     * caller so the state machine, the permission check and the audit
     * row all stay real.
     *
     * Nothing computed here is sent. The payload is two ids.
     */
    async submitGrades(classId, periodId, acknowledgeWarnings) {
      const { data, error } = await requireSupabase().functions.invoke(
        'compute-period-grades',
        { body: { classId, periodId, submit: true, acknowledgeWarnings } },
      );

      // functions.invoke reports a non-2xx as a generic FunctionsHttpError
      // and puts the real explanation in the response body. Reading it is
      // the difference between "This period has been finalized" and
      // "Edge Function returned a non-2xx status code".
      if (error) {
        const detail = await readFunctionError(error);
        throw new Error(detail ?? 'Submitting grades failed. Please try again.');
      }
      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Submitting grades failed.');
    },

    /**
     * N+1 by design, and deliberately so: it reuses `classes` and
     * `gradebook`, both already RLS-checked contracts, instead of adding
     * a wider SQL function that would need its own isolation proof. N is
     * the number of sections one teacher carries of one subject — four
     * or five, occasionally ten. A dedicated contract is worth writing
     * when that stops being true, not before.
     */
    async getLoaCohort(academicYearId, classId, periodId) {
      const all = await src.getClasses(academicYearId);
      const self = all.find((c) => c.id === classId);
      if (!self) return [];

      const peers = all
        .filter((c) => c.subjectCode === self.subjectCode && c.gradeLevel === self.gradeLevel)
        .sort((a, b) => a.section.localeCompare(b.section));

      return Promise.all(peers.map(async (c) => ({
        classId: c.id,
        label: `${c.gradeLevel} – ${c.section}`,
        data: await src.getGradebook(c.id, periodId),
      })));
    },

    async getStudentRecord(studentId) {
      const { data, error } = await requireSupabase()
        .rpc('student_profile', { p_student_id: studentId });
      if (error) fail('Loading the learner record', error);
      // null means RLS gave the caller no route to this learner — the
      // same answer as "no such learner", which is the right answer to
      // give. The screen renders "not found" either way.
      return (data ?? null) as StudentRecord | null;
    },

    async getEnrollmentOptions(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('enrollment_options', { p_year_id: academicYearId });
      if (error) fail('Loading grade levels and sections', error);
      return (data ?? { gradeLevels: [], sections: [] }) as EnrollmentOptions;
    },

    async admitStudent(student, enrollment, confirmNamesake) {
      const { data, error } = await requireSupabase()
        .rpc('admit_student', {
          p_student: student,
          p_enrollment: enrollment ?? null,
          p_confirm_namesake: confirmNamesake ?? false,
        });
      // "a learner with that LRN already exists in this school (Cruz, Juan)"
      // is written for a registrar. Do not flatten it.
      //
      // A NAMESAKE is not an error and does not arrive here: it comes
      // back in `data` as status 'needs_confirmation', because the
      // screen has to show the matching records so a person can decide.
      // An exception carries a string; this carries a comparison.
      if (error) throw new Error(error.message);
      return data as AdmitResult;
    },

    async transferSection(enrollmentId, sectionId, effectiveDate, reason) {
      const { data, error } = await requireSupabase()
        .rpc('transfer_student_section', {
          p_enrollment_id: enrollmentId,
          p_section_id: sectionId,
          p_effective_date: effectiveDate ?? null,
          p_reason: reason ?? null,
        });
      if (error) throw new Error(error.message);
      return data as { from: string | null; to: string;
                       classesLeft: number; classesJoined: number };
    },

    async withdrawStudent(enrollmentId, kind, effectiveDate, reason, destination) {
      const { data, error } = await requireSupabase()
        .rpc('withdraw_student', {
          p_enrollment_id: enrollmentId,
          p_kind: kind,
          p_effective_date: effectiveDate ?? null,
          p_reason: reason,
          p_destination: destination ?? null,
        });
      if (error) throw new Error(error.message);
      return data as { status: string; classesClosed: number };
    },

    async reenrolStudent(enrollmentId, effectiveDate, reason) {
      const { data, error } = await requireSupabase()
        .rpc('reenrol_student', {
          p_enrollment_id: enrollmentId,
          p_effective_date: effectiveDate ?? null,
          p_reason: reason ?? null,
        });
      if (error) throw new Error(error.message);
      return data as { status: string; classesRejoined: number };
    },

    async getEnrollmentHistory(studentId) {
      const { data, error } = await requireSupabase()
        .rpc('enrollment_history', { p_student_id: studentId });
      if (error) fail('Loading the enrolment history', error);
      return (data ?? []) as EnrollmentEvent[];
    },

    async mayProvisionPortalAccounts() {
      const { data, error } = await requireSupabase()
        .rpc('may_provision_portal_accounts');
      // A permission probe that fails is a NO, not a crash: the screen
      // hides a button rather than showing an error about one.
      if (error) return false;
      return data === true;
    },

    async getPortalCandidates(sectionId) {
      const { data, error } = await requireSupabase()
        .rpc('portal_account_candidates', { p_section_id: sectionId });
      if (error) fail('Loading portal accounts', error);
      return data as PortalAccountList;
    },

    async createStudentPortalAccount(studentId, email, password) {
      const { data, error } = await requireSupabase().functions.invoke(
        'manage-users',
        { body: { action: 'create_student_account', studentId, email, password } },
      );
      // functions.invoke reports a non-2xx as a generic FunctionsHttpError
      // and throws the body away. The function writes a sentence for a
      // registrar; read it back off the response rather than showing
      // "Edge Function returned a non-2xx status code".
      if (error) {
        const detail = await readFunctionError(error);
        throw new Error(detail ?? 'Creating the portal account failed.');
      }
      const body = data as
        { ok?: boolean; error?: string; userId?: string; warning?: string } | null;
      if (!body?.ok) throw new Error(body?.error ?? 'Creating the portal account failed.');
      return { userId: body.userId ?? '', warning: body.warning };
    },

    async unlinkStudentPortalAccount(studentId, reason) {
      const { error } = await requireSupabase()
        .rpc('unlink_student_portal_account',
             { p_student_id: studentId, p_reason: reason });
      if (error) throw new Error(error.message);
    },

    async enrolStudent(studentId, enrollment) {
      const { data, error } = await requireSupabase()
        .rpc('enrol_student', { p_student_id: studentId, p_enrollment: enrollment });
      if (error) throw new Error(error.message);
      return data as string;
    },

    async updateStudent(studentId, patch) {
      const { error } = await requireSupabase()
        .rpc('update_student', { p_student_id: studentId, p_patch: patch });
      if (error) throw new Error(error.message);
    },

    async updateEnrollment(enrollmentId, patch) {
      const { error } = await requireSupabase()
        .rpc('update_enrollment', { p_enrollment_id: enrollmentId, p_patch: patch });
      if (error) throw new Error(error.message);
    },

    async getPeriodGrades(classId, periodId) {
      const { data, error } = await requireSupabase()
        .rpc('period_grades_for', { p_class_id: classId, p_period_id: periodId });
      if (error) fail('Loading the recorded grades', error);
      return (data ?? {}) as Record<string, PersistedGrade>;
    },

    async getSubmissionQueue(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('submission_queue', { p_year_id: academicYearId });
      if (error) fail('Loading the submission queue', error);
      return (data ?? []) as SubmissionRow[];
    },

    /**
     * RECALL — the teacher takes their own submission back.
     *
     * The database refuses this the moment the adviser has signed for
     * the record, and says so in a sentence a teacher can act on
     * ("ask for it to be returned instead"). Surface that verbatim
     * rather than replacing it with a generic failure.
     */
    async recallSubmission(classId, periodId, reason) {
      const { error } = await requireSupabase()
        .rpc('recall_grades', {
          p_class_id: classId, p_period_id: periodId, p_reason: reason ?? null,
        });
      if (error) throw new Error(error.message);
    },

    async receiveSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('receive_grades', { p_submission_id: submissionId });
      if (error) throw new Error(error.message);
    },

    async forwardSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('forward_grades', { p_submission_id: submissionId });
      if (error) throw new Error(error.message);
    },

    async unforwardSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('unforward_grades', { p_submission_id: submissionId });
      if (error) throw new Error(error.message);
    },

    async registrarReceiveSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('registrar_receive_grades', { p_submission_id: submissionId });
      if (error) throw new Error(error.message);
    },

    async getAdviserQueue(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('adviser_queue', { p_year_id: academicYearId });
      if (error) fail('Loading the adviser queue', error);
      return (data ?? []) as SubmissionRow[];
    },

    async getMyAdvisorySections(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('my_advisory_sections', { p_year_id: academicYearId });
      if (error) fail('Loading your advisory sections', error);
      return (data ?? []) as AdvisorySection[];
    },

    async getConsolidatedGrades(sectionId, periodId) {
      const { data, error } = await requireSupabase()
        .rpc('consolidated_grades', { p_section_id: sectionId, p_period_id: periodId });
      // The function's own refusal ("you do not advise this section")
      // is written for the person reading it; show it as written.
      if (error) throw new Error(error.message);
      return data as ConsolidatedGrades;
    },

    async returnSubmission(submissionId, reason) {
      const { error } = await requireSupabase()
        .rpc('return_grades', { p_submission_id: submissionId, p_reason: reason });
      if (error) fail('Returning the submission', error);
    },

    async approveSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('approve_grades', { p_submission_id: submissionId });
      if (error) fail('Approving the submission', error);
    },

    async finalizeSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('finalize_grades', { p_submission_id: submissionId });
      if (error) fail('Finalizing the submission', error);
    },

    async publishSubmission(submissionId) {
      const { error } = await requireSupabase()
        .rpc('publish_grades', { p_submission_id: submissionId });
      if (error) fail('Publishing grades', error);
    },

    /* ---- student portal --------------------------------------------
     * None of these takes a student id. The learner comes from
     * app.current_student_id(), which reads the verified JWT.
     * ---------------------------------------------------------------- */

    async getMyProfile() {
      const { data, error } = await requireSupabase().rpc('my_profile');
      if (error) fail('Loading your profile', error);
      return data as StudentProfile;
    },

    async getMyGrades(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('my_grades', { p_year_id: academicYearId ?? null });
      if (error) fail('Loading your grades', error);
      return (data ?? []) as StudentGradeRow[];
    },

    async getMyHistory() {
      const { data, error } = await requireSupabase().rpc('my_academic_history');
      if (error) fail('Loading your academic history', error);
      return (data ?? []) as StudentHistoryRow[];
    },

    /* ---- class and section setup ------------------------------------ */

    async getSectionSetupOptions(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('section_setup_options', { p_year_id: academicYearId });
      if (error) fail('Loading section setup', error);
      return data as SectionSetupOptions;
    },

    async createSection(draft: SectionDraft) {
      const { data, error } = await requireSupabase().rpc('create_section', {
        p_academic_year_id: draft.academicYearId,
        p_grade_level_id: draft.gradeLevelId,
        p_name: draft.name,
        p_adviser_user_id: draft.adviserUserId ?? null,
        p_room: draft.room ?? null,
        p_capacity: draft.capacity ?? null,
      });
      // The function's own refusal ("a section named ... already
      // exists") is written for a registrar; show it as written.
      if (error) throw new Error(error.message);
      return data as string;
    },

    async createClass(draft: ClassDraft) {
      const { data, error } = await requireSupabase().rpc('create_class', {
        p_academic_year_id: draft.academicYearId,
        p_section_id: draft.sectionId,
        p_subject_id: draft.subjectId,
        p_teacher_user_id: draft.teacherUserId ?? null,
        p_schedule_note: draft.scheduleNote ?? null,
        p_room: draft.room ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },

    /* ---- a teacher's own class -------------------------------------- */

    async getMyClassSetupOptions(academicYearId: string) {
      const { data, error } = await requireSupabase()
        .rpc('my_class_setup_options', { p_year_id: academicYearId });
      if (error) throw new Error(error.message);
      return data as MyClassSetupOptions;
    },

    async createMyClass(draft: MyClassDraft) {
      const { data, error } = await requireSupabase().rpc('create_my_class', {
        p_academic_year_id: draft.academicYearId,
        p_subject_id: draft.subjectId,
        p_section_id: draft.sectionId ?? null,
        p_grade_level_id: draft.gradeLevelId ?? null,
        p_section_name: draft.sectionName ?? null,
        p_schedule_note: draft.scheduleNote ?? null,
        p_room: draft.room ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },

    async getMyClassRoster(classId: string) {
      const { data, error } = await requireSupabase()
        .rpc('my_class_roster', { p_class_id: classId });
      if (error) throw new Error(error.message);
      return data as MyClassRoster;
    },

    async addLearnerToMyClass(learner: LearnerToAdd) {
      const { data, error } = await requireSupabase().rpc('add_learner_to_my_class', {
        p_class_id: learner.classId,
        p_student_id: learner.studentId ?? null,
        p_first_name: learner.firstName ?? null,
        p_last_name: learner.lastName ?? null,
        p_sex: learner.sex ?? null,
        p_confirm_new_person: learner.confirmNewPerson ?? false,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },

    async removeLearnerFromMyClass(classEnrollmentId: string) {
      const { error } = await requireSupabase()
        .rpc('remove_learner_from_my_class', { p_class_enrollment_id: classEnrollmentId });
      if (error) throw new Error(error.message);
    },

    async correctLearnerName(fix: LearnerNameFix) {
      const { error } = await requireSupabase().rpc('correct_learner_name', {
        p_student_id: fix.studentId,
        p_first_name: fix.firstName,
        p_last_name: fix.lastName,
        p_middle_name: fix.middleName ?? null,
        p_suffix: fix.suffix ?? null,
        p_confirm_namesake: fix.confirmNamesake ?? false,
      });
      if (error) throw new Error(error.message);
    },

    /* ---- accounts --------------------------------------------------- */

    async getSchoolProfile() {
      const { data, error } = await requireSupabase().rpc('school_profile');
      if (error) throw new Error(error.message);
      return data as SchoolProfile;
    },

    async updateSchoolProfile(edit: SchoolProfileEdit) {
      const { error } = await requireSupabase().rpc('update_school_profile', {
        p_name: edit.name,
        p_govt_school_id: edit.govtSchoolId ?? null,
        p_region: edit.region ?? null,
        p_division: edit.division ?? null,
        p_district: edit.district ?? null,
        p_address: edit.address ?? null,
        p_contact_email: edit.contactEmail ?? null,
        p_contact_phone: edit.contactPhone ?? null,
      });
      if (error) throw new Error(error.message);
    },

    async getStaffDirectory() {
      const { data, error } = await requireSupabase().rpc('staff_directory');
      if (error) throw new Error(error.message);
      return data as StaffDirectory;
    },

    /**
     * Through the Edge Function, not an RPC: creating an account means
     * creating an AUTH IDENTITY with the tenant in app_metadata, and
     * only service_role may do that. A client holding the anon key must
     * never be able to mint accounts.
     */
    async createAccount(draft: NewAccount) {
      const { data, error } = await requireSupabase().functions.invoke(
        'manage-users',
        { body: { action: 'create', ...draft } },
      );
      if (error) {
        const detail = await readFunctionError(error);
        throw new Error(detail ?? 'Creating the account failed. Please try again.');
      }
      const result = data as { ok?: boolean; userId?: string; error?: string; warning?: string } | null;
      if (!result?.ok || !result.userId) {
        throw new Error(result?.error ?? 'Creating the account failed.');
      }
      return { userId: result.userId, warning: result.warning };
    },

    async resetPassword(userId, password) {
      const { data, error } = await requireSupabase().functions.invoke(
        'manage-users',
        { body: { action: 'reset_password', userId, password } },
      );
      if (error) {
        const detail = await readFunctionError(error);
        throw new Error(detail ?? 'Resetting the password failed. Please try again.');
      }
      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'Resetting the password failed.');
    },

    async setUserRoles(userId, roleCodes) {
      const { error } = await requireSupabase()
        .rpc('set_user_roles', { p_user_id: userId, p_role_codes: roleCodes });
      if (error) throw new Error(error.message);
    },

    async setUserStatus(userId, status) {
      const { error } = await requireSupabase()
        .rpc('set_user_status', { p_user_id: userId, p_status: status });
      if (error) throw new Error(error.message);
    },

    async getMyAccount() {
      const { data, error } = await requireSupabase().rpc('my_account');
      if (error) fail('Loading your account', error);
      return data as MyAccount;
    },

    async updateMyProfile(edit) {
      const { error } = await requireSupabase().rpc('update_my_profile', {
        p_first_name: edit.firstName,
        p_last_name: edit.lastName,
        p_middle_name: edit.middleName ?? null,
        p_suffix: edit.suffix ?? null,
        p_position: edit.position ?? null,
        p_qualifications: edit.qualifications ?? null,
      });
      if (error) throw new Error(error.message);
    },

    /**
     * Auth first, THEN the flag. If the order were reversed, a rejected
     * password (too short, say) would still clear must_change_password
     * and the person would keep the temporary one their administrator
     * knows — silently, with the app reporting success.
     */
    async changeMyPassword(password) {
      const sb = requireSupabase();
      const { error: authError } = await sb.auth.updateUser({ password });
      if (authError) throw new Error(authError.message);
      const { error } = await sb.rpc('clear_must_change_password');
      if (error) throw new Error(error.message);
    },

    /* ---- the Import Center ---------------------------------------- */

    async resolveImport(workbook) {
      // `import_resolution` is SECURITY INVOKER and `stable`, so this
      // call cannot write and row-level security decides which learners
      // it can even see. A teacher previewing a workbook for a class
      // they do not teach gets no candidates, which is the correct
      // answer rather than an error.
      const { data, error } = await requireSupabase()
        .rpc('import_resolution', { p_workbook: workbook });
      if (error) fail('Reading this workbook against your school', error);
      return data as ImportResolution;
    },

    async commitImport(plan) {
      const { data, error } = await requireSupabase()
        .rpc('import_commit', { p_plan: plan });
      // The function's refusals are written for a teacher — "that
      // grading period has already been submitted…" — so show what it
      // said rather than a wrapper's phrasing.
      if (error) throw new Error(error.message);
      return data as ImportResult;
    },

    async getImportHistory(limit) {
      const { data, error } = await requireSupabase()
        .rpc('import_history', { p_limit: limit ?? 50 });
      if (error) fail('Loading import history', error);
      return (data ?? []) as ImportRecord[];
    },
  };

  return src;
}

// Local helper so onAuthChange can no-op when unconfigured.
function getOrNull() {
  try { return requireSupabase(); } catch { return null; }
}
