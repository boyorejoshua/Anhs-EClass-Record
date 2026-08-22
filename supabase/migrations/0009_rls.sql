-- ============================================================
-- 0009 · Row Level Security
-- ============================================================
-- This file IS the security boundary. V0 enforces authorization only in
-- navigation (buildNav, main.js:224) — every page div exists in the DOM
-- and showPage('registrar') works from the console regardless of role.
--
-- Two rules hold everywhere:
--   1. FORCE RLS, so the table owner is subject to policy too.
--   2. The tenant comes from a verified JWT claim, never client input.
--
-- Reads go through RLS. Writes that carry policy (submit / return /
-- approve / finalize / publish / reopen) go through the RPCs in 0010,
-- so a modified client cannot skip a state.

-- ------------------------------------------------------------
-- SECURITY DEFINER predicate helpers
-- ------------------------------------------------------------
-- Cross-table RLS predicates MUST go through these. A policy on table A
-- that inline-queries table B triggers B's policies, which may query A —
-- and Postgres raises "infinite recursion detected in policy". These
-- helpers run with the definer's rights, so the inner lookup does not
-- re-enter the policy system. They are also markedly faster.
--
-- Each one still scopes to the caller's own tenant and identity, so
-- SECURITY DEFINER here widens nothing.

create or replace function app.teaches_class(p_class_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.school_id = app.current_school_id()
      and (c.primary_teacher_id = app.current_user_id()
           or exists (select 1 from public.class_teachers ct
                      where ct.class_id = c.id and ct.user_id = app.current_user_id()))
  )
$$;

create or replace function app.advises_student(p_student_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.enrollments e
    join public.sections s on s.id = e.section_id
    where e.student_id = p_student_id
      and e.school_id = app.current_school_id()
      and s.adviser_user_id = app.current_user_id()
  )
$$;

create or replace function app.student_in_my_classes(p_student_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.class_enrollments ce
    join public.enrollments e on e.id = ce.enrollment_id
    join public.classes c     on c.id = ce.class_id
    where e.student_id = p_student_id
      and c.school_id = app.current_school_id()
      and (c.primary_teacher_id = app.current_user_id()
           or exists (select 1 from public.class_teachers ct
                      where ct.class_id = c.id and ct.user_id = app.current_user_id()))
  )
$$;

-- Is the authenticated LEARNER enrolled in this class?
create or replace function app.student_in_class(p_class_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.class_enrollments ce
    join public.enrollments e on e.id = ce.enrollment_id
    where ce.class_id = p_class_id
      and e.student_id = app.current_student_id()
  )
$$;

create or replace function app.enrollment_is_mine(p_enrollment_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id and e.student_id = app.current_student_id()
  )
$$;

create or replace function app.class_enrollment_is_mine(p_ce_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.class_enrollments ce
    join public.enrollments e on e.id = ce.enrollment_id
    where ce.id = p_ce_id and e.student_id = app.current_student_id()
  )
$$;

create or replace function app.class_enrollment_in_my_classes(p_ce_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where ce.id = p_ce_id
      and c.school_id = app.current_school_id()
      and (c.primary_teacher_id = app.current_user_id()
           or exists (select 1 from public.class_teachers ct
                      where ct.class_id = c.id and ct.user_id = app.current_user_id()))
  )
$$;

-- Published-to-learner check for a class_enrollment + period.
create or replace function app.ce_period_is_published(p_ce_id uuid, p_period_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.class_enrollments ce
    join public.grade_submissions gs
      on gs.class_id = ce.class_id and gs.academic_period_id = p_period_id
    where ce.id = p_ce_id
      and gs.status = 'published'
      and gs.published_at is not null
  )
$$;

create or replace function app.enrollment_advised_by_me(p_enrollment_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.enrollments e
    join public.sections s on s.id = e.section_id
    where e.id = p_enrollment_id and s.adviser_user_id = app.current_user_id()
  )
$$;

create or replace function app.assessment_in_my_classes(p_assessment_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.assessments a
    join public.classes c on c.id = a.class_id
    where a.id = p_assessment_id
      and c.school_id = app.current_school_id()
      and (c.primary_teacher_id = app.current_user_id()
           or exists (select 1 from public.class_teachers ct
                      where ct.class_id = c.id and ct.user_id = app.current_user_id()))
  )
$$;

create or replace function app.assessment_is_editable(p_assessment_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce((
    select app.submission_is_editable(a.class_id, a.academic_period_id)
    from public.assessments a where a.id = p_assessment_id
  ), false)
$$;

-- ------------------------------------------------------------
-- Enable + force on every tenant table
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'schools','school_settings','users','staff_profiles','roles',
    'role_permissions','user_roles','academic_years','academic_periods',
    'grade_levels','sections','subject_categories','subjects',
    'grade_level_subjects','calendar_days','transmutation_tables',
    'transmutation_bands','grading_schemes','grade_components',
    'descriptor_bands','attendance_statuses','students','guardians',
    'enrollments','enrollment_events','classes','class_teachers',
    'class_enrollments','assessments','assessment_scores','period_grades',
    'final_subject_grades','grade_submissions','grade_change_requests',
    'attendance_records','audit_logs','notifications','import_batches',
    'report_templates','document_number_sequences','generated_documents',
    'announcements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- permissions is a global catalogue, readable by any authenticated user.
alter table public.permissions enable row level security;
create policy permissions_read on public.permissions
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Baseline tenant isolation
-- ------------------------------------------------------------
-- Applied to every table carrying school_id. Later policies ADD narrower
-- access; none of them can widen past the tenant, because Postgres ORs
-- permissive policies within a command and this one always applies to
-- the tables that only have it.
do $$
declare t text;
begin
  foreach t in array array[
    'school_settings','staff_profiles','roles','user_roles',
    'academic_years','academic_periods','grade_levels','sections',
    'subject_categories','subjects','grade_level_subjects','calendar_days',
    'transmutation_tables','transmutation_bands','grading_schemes',
    'grade_components','descriptor_bands','attendance_statuses',
    'enrollment_events','class_teachers','grade_change_requests',
    'import_batches','report_templates','generated_documents','announcements'
  ] loop
    execute format(
      'create policy tenant_read on public.%I for select to authenticated
         using (school_id = app.current_school_id())', t);
  end loop;
end $$;

-- schools: a user sees only their own school row.
create policy schools_read on public.schools
  for select to authenticated
  using (id = app.current_school_id());

-- role_permissions has no school_id; scope it through its role.
create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and r.school_id = app.current_school_id()
  ));

-- document_number_sequences: internal, service-role only. No policy =
-- no access for authenticated users, which is intended.

-- ------------------------------------------------------------
-- Configuration writes — school administrators
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'school_settings','academic_years','academic_periods','grade_levels',
    'sections','subject_categories','subjects','grade_level_subjects',
    'calendar_days','transmutation_tables','transmutation_bands',
    'grading_schemes','grade_components','descriptor_bands',
    'attendance_statuses','roles','user_roles','report_templates','announcements'
  ] loop
    execute format(
      'create policy config_write on public.%I for all to authenticated
         using      (school_id = app.current_school_id()
                     and app.has_permission(''school.config.write''))
         with check (school_id = app.current_school_id()
                     and app.has_permission(''school.config.write''))', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
create policy users_read_self on public.users
  for select to authenticated
  using (id = app.current_user_id());

create policy users_read_school on public.users
  for select to authenticated
  using (school_id = app.current_school_id() and app.has_permission('users.read'));

create policy users_write on public.users
  for all to authenticated
  using      (school_id = app.current_school_id() and app.has_permission('users.write'))
  with check (school_id = app.current_school_id() and app.has_permission('users.write'));

-- ------------------------------------------------------------
-- students
-- ------------------------------------------------------------
-- A learner sees exactly their own record. This policy is the reason a
-- student cannot reach another student's data by editing a URL: there is
-- no id parameter in the predicate at all.
create policy students_read_self on public.students
  for select to authenticated
  using (id = app.current_student_id());

create policy students_read_all on public.students
  for select to authenticated
  using (school_id = app.current_school_id()
         and app.has_permission('students.read.all')
         and deleted_at is null);

-- A teacher reaches learners only THROUGH their assigned classes.
-- Access follows the teaching load; change an assignment and access
-- changes with it, with no permission editing.
create policy students_read_own_classes on public.students
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and deleted_at is null
    and app.has_permission('students.read.own_classes')
    and app.student_in_my_classes(students.id)
  );

-- An adviser additionally sees their whole advisory section.
create policy students_read_section on public.students
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and deleted_at is null
    and app.has_permission('students.read.section')
    and app.advises_student(students.id)
  );

create policy students_write on public.students
  for all to authenticated
  using      (school_id = app.current_school_id() and app.has_permission('students.write'))
  with check (school_id = app.current_school_id() and app.has_permission('students.write'));

-- ------------------------------------------------------------
-- guardians / enrollments
-- ------------------------------------------------------------
create policy guardians_read on public.guardians
  for select to authenticated
  using (school_id = app.current_school_id()
         and (app.has_permission('students.read.all')
              or student_id = app.current_student_id()));

create policy guardians_write on public.guardians
  for all to authenticated
  using      (school_id = app.current_school_id() and app.has_permission('students.write'))
  with check (school_id = app.current_school_id() and app.has_permission('students.write'));

create policy enrollments_read_self on public.enrollments
  for select to authenticated
  using (student_id = app.current_student_id());

create policy enrollments_read_staff on public.enrollments
  for select to authenticated
  using (school_id = app.current_school_id()
         and (app.has_permission('enrollments.read') or app.has_permission('students.read.all')));

create policy enrollments_write on public.enrollments
  for all to authenticated
  using      (school_id = app.current_school_id() and app.has_permission('enrollments.write'))
  with check (school_id = app.current_school_id() and app.has_permission('enrollments.write'));

-- ------------------------------------------------------------
-- classes and rosters
-- ------------------------------------------------------------
create policy classes_read_own on public.classes
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and (primary_teacher_id = app.current_user_id()
         or exists (select 1 from public.class_teachers ct
                    where ct.class_id = classes.id and ct.user_id = app.current_user_id()))
  );

create policy classes_read_all on public.classes
  for select to authenticated
  using (school_id = app.current_school_id() and app.has_permission('classes.read.all'));

-- A learner sees the classes they are actually enrolled in.
create policy classes_read_student on public.classes
  for select to authenticated
  using (app.student_in_class(classes.id));

create policy classes_write on public.classes
  for all to authenticated
  using      (school_id = app.current_school_id() and app.has_permission('classes.assign'))
  with check (school_id = app.current_school_id() and app.has_permission('classes.assign'));

create policy class_enrollments_read on public.class_enrollments
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and (
      app.has_permission('students.read.all')
      or app.teaches_class(class_enrollments.class_id)
      or app.enrollment_is_mine(class_enrollments.enrollment_id)
    )
  );

create policy class_enrollments_write on public.class_enrollments
  for all to authenticated
  using      (school_id = app.current_school_id() and app.has_permission('enrollments.write'))
  with check (school_id = app.current_school_id() and app.has_permission('enrollments.write'));

-- ------------------------------------------------------------
-- assessments and scores
-- ------------------------------------------------------------


create policy assessments_read on public.assessments
  for select to authenticated
  using (school_id = app.current_school_id()
         and (app.teaches_class(class_id) or app.has_permission('grades.read.all')));

-- Writes are blocked once the class+period is submitted. The gradebook
-- greys the cells, but the lock lives here so it cannot be bypassed.
create policy assessments_write on public.assessments
  for all to authenticated
  using      (app.teaches_class(class_id) and app.has_permission('assessments.write')
              and app.submission_is_editable(class_id, academic_period_id))
  with check (app.teaches_class(class_id) and app.has_permission('assessments.write')
              and app.submission_is_editable(class_id, academic_period_id));

create policy scores_read on public.assessment_scores
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and (
      app.has_permission('grades.read.all')
      or app.assessment_in_my_classes(assessment_scores.assessment_id)
    )
  );

create policy scores_write on public.assessment_scores
  for all to authenticated
  using      (app.assessment_in_my_classes(assessment_scores.assessment_id)
              and app.has_permission('grades.encode')
              and app.assessment_is_editable(assessment_scores.assessment_id))
  with check (app.assessment_in_my_classes(assessment_scores.assessment_id)
              and app.has_permission('grades.encode')
              and app.assessment_is_editable(assessment_scores.assessment_id));

-- ------------------------------------------------------------
-- period_grades — THE PRIVACY GATE
-- ------------------------------------------------------------
-- A learner sees a grade only when it is theirs AND the class+period has
-- been published. Both predicates live here rather than in application
-- code, so a future developer writing a careless student-facing query
-- gets zero rows instead of an unpublished grade.
create policy period_grades_read_student on public.period_grades
  for select to authenticated
  using (
    is_current
    and app.class_enrollment_is_mine(period_grades.class_enrollment_id)
    and app.ce_period_is_published(period_grades.class_enrollment_id,
                                   period_grades.academic_period_id)
  );

create policy period_grades_read_teacher on public.period_grades
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and app.class_enrollment_in_my_classes(period_grades.class_enrollment_id)
  );

create policy period_grades_read_all on public.period_grades
  for select to authenticated
  using (school_id = app.current_school_id() and app.has_permission('grades.read.all'));

-- Grades are computed and written by server-side functions only.
-- There is deliberately no INSERT/UPDATE policy for authenticated users.

create policy final_grades_read_student on public.final_subject_grades
  for select to authenticated
  using (is_current
         and app.class_enrollment_is_mine(final_subject_grades.class_enrollment_id));

create policy final_grades_read_staff on public.final_subject_grades
  for select to authenticated
  using (school_id = app.current_school_id()
         and (app.has_permission('grades.read.all')
              or app.class_enrollment_in_my_classes(final_subject_grades.class_enrollment_id)));

-- ------------------------------------------------------------
-- grade_submissions — readable; transitions only via RPC
-- ------------------------------------------------------------
create policy submissions_read_teacher on public.grade_submissions
  for select to authenticated
  using (school_id = app.current_school_id() and app.teaches_class(class_id));

create policy submissions_read_staff on public.grade_submissions
  for select to authenticated
  using (school_id = app.current_school_id()
         and (app.has_permission('grades.read.all') or app.has_permission('grades.approve')));

-- ------------------------------------------------------------
-- attendance
-- ------------------------------------------------------------
create policy attendance_read_self on public.attendance_records
  for select to authenticated
  using (app.enrollment_is_mine(attendance_records.enrollment_id));

create policy attendance_read_staff on public.attendance_records
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and (app.has_permission('attendance.read.all')
         or (class_id is not null and app.teaches_class(class_id))
         or app.enrollment_advised_by_me(attendance_records.enrollment_id))
  );

create policy attendance_write on public.attendance_records
  for all to authenticated
  using (
    school_id = app.current_school_id()
    and app.has_permission('attendance.encode')
    and (class_id is null or app.teaches_class(class_id))
  )
  with check (
    school_id = app.current_school_id()
    and app.has_permission('attendance.encode')
    and (class_id is null or app.teaches_class(class_id))
  );

-- ------------------------------------------------------------
-- audit_logs — append-only, for everyone
-- ------------------------------------------------------------
create policy audit_read on public.audit_logs
  for select to authenticated
  using (school_id = app.current_school_id() and app.has_permission('audit.read'));

revoke update, delete on public.audit_logs from authenticated, anon;
revoke update, delete on public.audit_logs from public;
-- service_role too: an audit log an attacker can edit is not an audit log.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke update, delete on public.audit_logs from service_role';
  end if;
end $$;

-- ------------------------------------------------------------
-- notifications / documents
-- ------------------------------------------------------------
create policy notifications_own on public.notifications
  for all to authenticated
  using      (recipient_user_id = app.current_user_id())
  with check (recipient_user_id = app.current_user_id());

create policy documents_read_staff on public.generated_documents
  for select to authenticated
  using (school_id = app.current_school_id()
         and (app.has_permission('documents.generate') or app.has_permission('documents.issue')));

-- A learner sees their own issued documents, and only if the school
-- has switched that on. Default is off.
create policy documents_read_student on public.generated_documents
  for select to authenticated
  using (
    subject_type = 'student'
    and subject_id = app.current_student_id()
    and status = 'issued'
    and coalesce(
      (select (value #>> '{}')::boolean from public.school_settings
       where school_id = generated_documents.school_id
         and key = 'student_can_view_documents'),
      false)
  );
