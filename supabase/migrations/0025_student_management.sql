-- 0025 — Student Management: create, amend, and read a learner record.
--
-- The MODEL needed nothing. `students` has been a per-person master
-- since 0002, `enrollments` has been per academic year since 0003, and
-- the RLS policies and permissions for both already exist. What was
-- missing is the way in: there was no way to add a learner except by
-- seeding one.
--
-- ── THE DISTINCTION THIS MIGRATION PROTECTS ──────────────────────────
--
--   A STUDENT is a person. One row, forever, per school.
--   An ENROLLMENT is that person's participation in one school year.
--
-- Moving Pearl → Emerald edits an enrollment. Moving Grade 9 → Grade 10
-- adds one. Neither creates a second person. Every function below is
-- shaped to make the wrong thing hard: `admit_student` is the only one
-- that creates a person, and it refuses if the identifiers say the
-- person already exists.

-- =====================================================================
-- 1. IDENTIFIERS MUST BE UNIQUE
-- =====================================================================
--
-- Nothing enforced this. Two learners could hold the same LRN, which is
-- a national identifier, and the duplicate would surface years later on
-- an SF10 nobody could reconcile.
--
-- Partial, because both columns are legitimately null: a learner may be
-- admitted before their LRN is issued.

create unique index if not exists students_lrn_unique
  on public.students (school_id, lrn)
  where lrn is not null and deleted_at is null;

create unique index if not exists students_number_unique
  on public.students (school_id, student_number)
  where student_number is not null and deleted_at is null;

comment on index public.students_lrn_unique is
  'The LRN is a national identifier; a school may not hold it twice. '
  'Partial because a learner can be admitted before one is issued.';

-- =====================================================================
-- 2. ENROL AN EXISTING LEARNER IN A YEAR
-- =====================================================================
--
-- Separate and callable on its own, because this is what promotion is:
-- the same person, a new year, a new grade level. Calling it twice for
-- one year is refused by the (student_id, academic_year_id) unique
-- constraint, which is the thing that stops a learner appearing twice
-- in one directory.

create or replace function public.enrol_student(
  p_student_id uuid,
  p_enrollment jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid := app.current_school_id();
  v_id     uuid;
  v_year   uuid := (p_enrollment ->> 'academicYearId')::uuid;
  v_grade  uuid := (p_enrollment ->> 'gradeLevelId')::uuid;
begin
  if not app.has_permission('enrollments.write') then
    raise exception 'not permitted to enrol learners' using errcode = '42501';
  end if;
  if v_year is null or v_grade is null then
    raise exception 'an academic year and a grade level are required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.students st
                 where st.id = p_student_id and st.school_id = v_school) then
    raise exception 'learner not found in this school' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.enrollments e
             where e.student_id = p_student_id and e.academic_year_id = v_year) then
    raise exception
      'this learner is already enrolled for that school year — edit the enrolment instead of adding one'
      using errcode = '23505';
  end if;

  insert into public.enrollments (
    school_id, student_id, academic_year_id, grade_level_id, section_id,
    date_enrolled, status, previous_school, remarks
  ) values (
    v_school, p_student_id, v_year, v_grade,
    (nullif(p_enrollment ->> 'sectionId', ''))::uuid,
    coalesce((nullif(p_enrollment ->> 'dateEnrolled', ''))::date, current_date),
    -- 'enrolled', not 'active': enrollments.status is a DepEd
    -- enrolment state (enrolled / transferred_in / transferred_out /
    -- dropped / completed), not a generic row flag. students.status is
    -- the one that uses 'active'. The two are easy to confuse and the
    -- check constraint is what caught it.
    coalesce(nullif(btrim(p_enrollment ->> 'status'), ''), 'enrolled'),
    nullif(btrim(p_enrollment ->> 'previousSchool'), ''),
    nullif(btrim(p_enrollment ->> 'remarks'), '')
  )
  returning id into v_id;

  perform app.write_audit('enrollments.create', 'enrollments', v_id, null, p_enrollment);
  return v_id;
end;
$$;

-- =====================================================================
-- 3. ADMIT A LEARNER
-- =====================================================================
--
-- One call, two rows, in that order — because a person without a place
-- to be is not useful, and a place without a person is impossible. They
-- stay separate rows and separate concepts; this only means the form
-- does not have to leave a half-made record behind if the second step
-- fails.

create or replace function public.admit_student(
  p_student    jsonb,
  p_enrollment jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school     uuid := app.current_school_id();
  v_student_id uuid;
  v_enrol_id   uuid;
  v_lrn        text := nullif(btrim(p_student ->> 'lrn'), '');
  v_number     text := nullif(btrim(p_student ->> 'studentNumber'), '');
  v_existing   uuid;
begin
  if not app.has_permission('students.write') then
    raise exception 'not permitted to add learners' using errcode = '42501';
  end if;
  if v_school is null then
    raise exception 'no school in session' using errcode = '42501';
  end if;

  if nullif(btrim(p_student ->> 'lastName'), '') is null
     or nullif(btrim(p_student ->> 'firstName'), '') is null then
    raise exception 'a first name and a last name are required' using errcode = '23514';
  end if;

  -- Refuse a duplicate BEFORE writing, and say who it already is. The
  -- unique index would also catch this, but "duplicate key value
  -- violates unique constraint students_lrn_unique" is not something to
  -- show a registrar.
  select st.id into v_existing
  from public.students st
  where st.school_id = v_school and st.deleted_at is null
    and ((v_lrn    is not null and st.lrn = v_lrn)
      or (v_number is not null and st.student_number = v_number));

  if v_existing is not null then
    raise exception
      'a learner with that % already exists in this school (%)',
      case when v_lrn is not null and exists (
        select 1 from public.students where id = v_existing and lrn = v_lrn
      ) then 'LRN' else 'student number' end,
      (select public.student_display_name(s.*) from public.students s where s.id = v_existing)
      using errcode = '23505';
  end if;

  insert into public.students (
    school_id, student_number, lrn,
    first_name, middle_name, last_name, suffix,
    sex, birth_date, birth_place, mother_tongue, religion,
    address_line, barangay, municipality, province,
    contact_number, email, status
  ) values (
    v_school, v_number, v_lrn,
    btrim(p_student ->> 'firstName'),
    nullif(btrim(p_student ->> 'middleName'), ''),
    btrim(p_student ->> 'lastName'),
    nullif(btrim(p_student ->> 'suffix'), ''),
    nullif(btrim(p_student ->> 'sex'), ''),
    (nullif(p_student ->> 'birthDate', ''))::date,
    nullif(btrim(p_student ->> 'birthPlace'), ''),
    nullif(btrim(p_student ->> 'motherTongue'), ''),
    nullif(btrim(p_student ->> 'religion'), ''),
    nullif(btrim(p_student ->> 'addressLine'), ''),
    nullif(btrim(p_student ->> 'barangay'), ''),
    nullif(btrim(p_student ->> 'municipality'), ''),
    nullif(btrim(p_student ->> 'province'), ''),
    nullif(btrim(p_student ->> 'contactNumber'), ''),
    nullif(btrim(p_student ->> 'email'), ''),
    coalesce(nullif(btrim(p_student ->> 'status'), ''), 'active')
  )
  returning id into v_student_id;

  v_enrol_id := public.enrol_student(v_student_id, p_enrollment);

  perform app.write_audit('students.create', 'students', v_student_id, null,
    jsonb_build_object('lrn', v_lrn, 'studentNumber', v_number));

  return jsonb_build_object('studentId', v_student_id, 'enrollmentId', v_enrol_id);
end;
$$;

-- =====================================================================
-- 4. AMEND
-- =====================================================================
--
-- Patch semantics: a key that is absent is left alone, so a form that
-- edits one field cannot blank the rest. Identity columns are excluded
-- from the student patch — changing an LRN is a correction with its own
-- consequences and should not ride in on a general edit.

create or replace function public.update_student(
  p_student_id uuid,
  p_patch      jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_before jsonb;
begin
  if not app.has_permission('students.write') then
    raise exception 'not permitted to edit learners' using errcode = '42501';
  end if;

  select to_jsonb(st.*) into v_before from public.students st
  where st.id = p_student_id and st.school_id = app.current_school_id()
    and st.deleted_at is null;
  if v_before is null then
    raise exception 'learner not found' using errcode = 'P0002';
  end if;

  update public.students set
    first_name     = coalesce(nullif(btrim(p_patch ->> 'firstName'), ''), first_name),
    last_name      = coalesce(nullif(btrim(p_patch ->> 'lastName'), ''), last_name),
    middle_name    = case when p_patch ? 'middleName'   then nullif(btrim(p_patch ->> 'middleName'), '')   else middle_name end,
    suffix         = case when p_patch ? 'suffix'       then nullif(btrim(p_patch ->> 'suffix'), '')       else suffix end,
    sex            = case when p_patch ? 'sex'          then nullif(btrim(p_patch ->> 'sex'), '')          else sex end,
    birth_date     = case when p_patch ? 'birthDate'    then (nullif(p_patch ->> 'birthDate', ''))::date   else birth_date end,
    birth_place    = case when p_patch ? 'birthPlace'   then nullif(btrim(p_patch ->> 'birthPlace'), '')   else birth_place end,
    mother_tongue  = case when p_patch ? 'motherTongue' then nullif(btrim(p_patch ->> 'motherTongue'), '') else mother_tongue end,
    religion       = case when p_patch ? 'religion'     then nullif(btrim(p_patch ->> 'religion'), '')     else religion end,
    address_line   = case when p_patch ? 'addressLine'  then nullif(btrim(p_patch ->> 'addressLine'), '')  else address_line end,
    barangay       = case when p_patch ? 'barangay'     then nullif(btrim(p_patch ->> 'barangay'), '')     else barangay end,
    municipality   = case when p_patch ? 'municipality' then nullif(btrim(p_patch ->> 'municipality'), '') else municipality end,
    province       = case when p_patch ? 'province'     then nullif(btrim(p_patch ->> 'province'), '')     else province end,
    contact_number = case when p_patch ? 'contactNumber' then nullif(btrim(p_patch ->> 'contactNumber'), '') else contact_number end,
    email          = case when p_patch ? 'email'        then nullif(btrim(p_patch ->> 'email'), '')        else email end,
    updated_at     = now()
  where id = p_student_id;

  perform app.write_audit('students.update', 'students', p_student_id, v_before, p_patch);
end;
$$;

/**
 * Amend an enrolment — which is how a SECTION TRANSFER happens.
 *
 * The learner does not move; their enrolment does. That is the whole
 * point of the two-table split, and this is the function that expresses
 * it.
 */
create or replace function public.update_enrollment(
  p_enrollment_id uuid,
  p_patch         jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_before jsonb;
begin
  if not app.has_permission('enrollments.write') then
    raise exception 'not permitted to edit enrolments' using errcode = '42501';
  end if;

  select to_jsonb(e.*) into v_before from public.enrollments e
  where e.id = p_enrollment_id and e.school_id = app.current_school_id();
  if v_before is null then
    raise exception 'enrolment not found' using errcode = 'P0002';
  end if;

  update public.enrollments set
    grade_level_id   = coalesce((nullif(p_patch ->> 'gradeLevelId', ''))::uuid, grade_level_id),
    section_id       = case when p_patch ? 'sectionId'       then (nullif(p_patch ->> 'sectionId', ''))::uuid else section_id end,
    status           = coalesce(nullif(btrim(p_patch ->> 'status'), ''), status),
    promotion_status = case when p_patch ? 'promotionStatus' then nullif(btrim(p_patch ->> 'promotionStatus'), '') else promotion_status end,
    previous_school  = case when p_patch ? 'previousSchool'  then nullif(btrim(p_patch ->> 'previousSchool'), '')  else previous_school end,
    remarks          = case when p_patch ? 'remarks'         then nullif(btrim(p_patch ->> 'remarks'), '')         else remarks end,
    updated_at       = now()
  where id = p_enrollment_id;

  perform app.write_audit('enrollments.update', 'enrollments', p_enrollment_id, v_before, p_patch);
end;
$$;

-- =====================================================================
-- 5. THE PROFILE
-- =====================================================================
--
-- SECURITY INVOKER, so the four read policies on `students` decide who
-- may open it: the registrar sees anyone, an adviser sees their section,
-- a teacher sees learners in their own classes, and a learner sees
-- themselves. A caller with no route to the row gets null — the same
-- answer they would get for a learner who does not exist, which is the
-- correct answer to give.
--
-- Grades come from `period_grades` under the same policies, so a teacher
-- sees the periods they teach and the portal's publication gate still
-- governs what a learner sees of their own.

create or replace function rds.student_profile(p_student_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select case when st.id is null then null else jsonb_build_object(
    'student', jsonb_build_object(
      'studentId',     st.id,
      'displayName',   public.student_display_name(st.*),
      'firstName',     st.first_name,
      'middleName',    st.middle_name,
      'lastName',      st.last_name,
      'suffix',        st.suffix,
      'studentNumber', st.student_number,
      'lrn',           st.lrn,
      'sex',           st.sex,
      'birthDate',     st.birth_date,
      'birthPlace',    st.birth_place,
      'motherTongue',  st.mother_tongue,
      'religion',      st.religion,
      'addressLine',   st.address_line,
      'barangay',      st.barangay,
      'municipality',  st.municipality,
      'province',      st.province,
      'contactNumber', st.contact_number,
      'email',         st.email,
      'status',        st.status,
      'hasPortalAccount', st.portal_user_id is not null
    ),
    -- Every year this learner has been here. ONE student, many
    -- enrolments — the history IS the enrolment list.
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollmentId',    e.id,
        'academicYearId',  ay.id,
        'academicYear',    ay.label,
        'yearStatus',      ay.status,
        'gradeLevel',      gl.name,
        'gradeLevelId',    gl.id,
        'section',         sec.name,
        'sectionId',       sec.id,
        'status',          e.status,
        'promotionStatus', e.promotion_status,
        'generalAverage',  e.general_average,
        'dateEnrolled',    e.date_enrolled
      ) order by ay.start_date desc)
      from public.enrollments e
      join public.academic_years ay on ay.id = e.academic_year_id
      join public.grade_levels gl   on gl.id = e.grade_level_id
      left join public.sections sec on sec.id = e.section_id
      where e.student_id = st.id
    ), '[]'::jsonb),
    -- Recorded period grades, whatever the caller is allowed to see.
    'grades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'academicYear', ay.label,
        'period',       p.name,
        'periodOrdinal', p.ordinal,
        'subject',      sub.title,
        'subjectCode',  sub.code,
        'grade',        pg.period_grade,
        'descriptor',   pg.descriptor,
        'passed',       pg.passed
      ) order by ay.start_date desc, sub.title, p.ordinal)
      from public.period_grades pg
      join public.class_enrollments ce on ce.id = pg.class_enrollment_id
      join public.enrollments e        on e.id = ce.enrollment_id
      join public.classes cl           on cl.id = ce.class_id
      join public.subjects sub         on sub.id = cl.subject_id
      join public.academic_periods p   on p.id = pg.academic_period_id
      join public.academic_years ay    on ay.id = cl.academic_year_id
      where e.student_id = st.id and pg.is_current
    ), '[]'::jsonb)
  ) end
  from public.students st
  where st.id = p_student_id and st.deleted_at is null
$$;

create or replace function public.student_profile(p_student_id uuid)
returns jsonb language sql stable
set search_path = public, pg_temp
as $$ select rds.student_profile(p_student_id) $$;

grant execute on function
  public.admit_student(jsonb, jsonb),
  public.enrol_student(uuid, jsonb),
  public.update_student(uuid, jsonb),
  public.update_enrollment(uuid, jsonb),
  rds.student_profile(uuid),
  public.student_profile(uuid)
  to authenticated;
revoke execute on function
  public.admit_student(jsonb, jsonb),
  public.enrol_student(uuid, jsonb),
  public.update_student(uuid, jsonb),
  public.update_enrollment(uuid, jsonb),
  rds.student_profile(uuid),
  public.student_profile(uuid)
  from public, anon;

-- =====================================================================
-- 6. WHAT AN ENROLMENT FORM MAY OFFER
-- =====================================================================
--
-- Grade levels the school runs, and the sections that exist for a year.
-- A form must never invent either: a typed section name is how a school
-- ends up with "Masipag", "masipag" and "Masipag " as three sections.

create or replace function rds.enrollment_options(p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'gradeLevels', coalesce((
      select jsonb_agg(jsonb_build_object('id', gl.id, 'name', gl.name, 'ordinal', gl.ordinal)
                       order by gl.ordinal)
      from public.grade_levels gl
      where gl.school_id = app.current_school_id()
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sec.id, 'name', sec.name,
               'gradeLevelId', sec.grade_level_id,
               'gradeLevel', gl.name,
               'adviserUserId', sec.adviser_user_id)
             order by gl.ordinal, sec.name)
      from public.sections sec
      join public.grade_levels gl on gl.id = sec.grade_level_id
      where sec.academic_year_id = p_year_id
        and sec.school_id = app.current_school_id()
    ), '[]'::jsonb)
  )
$$;

create or replace function public.enrollment_options(p_year_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $$ select rds.enrollment_options(p_year_id) $$;

grant execute on function rds.enrollment_options(uuid), public.enrollment_options(uuid)
  to authenticated;
revoke execute on function rds.enrollment_options(uuid), public.enrollment_options(uuid)
  from public, anon;
