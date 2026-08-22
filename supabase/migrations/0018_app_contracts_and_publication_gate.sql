-- 0018 — Contracts the frontend needs, and one privacy defect.
--
-- Adds the read contracts for the registrar queue, class rosters,
-- attendance and the student portal, plus the write path for attendance.
-- Every one is SECURITY INVOKER: reachability, never authority. RLS
-- decides what comes back, exactly as it would for a direct query.
--
-- Also closes a real gap found while checking what a student can see.

-- =====================================================================
-- 1. THE PUBLICATION GATE ON FINAL GRADES
-- =====================================================================
--
-- docs/02-roles-and-workflow.md: "A student sees a grade only when the
-- submission for that class+period is published."
--
-- That was enforced for period_grades (policy period_grades_read_student
-- checks app.ce_period_is_published) but NOT for final_subject_grades,
-- whose student policy checked only ownership. Verified against the live
-- database: the seeded student could read final grades of 93.00 and
-- 85.00 with zero published submissions.
--
-- A final grade is a year-level record with no single period, so the
-- rule has to be "every period that has a submission is published, and
-- at least one is" — a final grade assembled from unpublished periods is
-- exactly the thing the gate exists to withhold.

create or replace function app.ce_all_periods_published(p_ce_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
           select 1
           from public.class_enrollments ce
           join public.grade_submissions gs on gs.class_id = ce.class_id
           where ce.id = p_ce_id
             and gs.status = 'published'
             and gs.published_at is not null
         )
     and not exists (
           select 1
           from public.class_enrollments ce
           join public.grade_submissions gs on gs.class_id = ce.class_id
           where ce.id = p_ce_id
             and (gs.status <> 'published' or gs.published_at is null)
         )
$$;

comment on function app.ce_all_periods_published is
  'True when every grade submission for this class enrolment is published '
  'and at least one exists. Gates a student''s view of a final grade, '
  'which is assembled from periods and must not leak an unpublished one.';

drop policy if exists final_grades_read_student on public.final_subject_grades;
create policy final_grades_read_student on public.final_subject_grades
  for select to authenticated
  using (
    is_current
    and app.class_enrollment_is_mine(final_subject_grades.class_enrollment_id)
    and app.ce_all_periods_published(final_subject_grades.class_enrollment_id)
  );

-- Staff are unaffected: final_grades_read_staff still covers teachers of
-- the class and anyone holding grades.read.all.

-- =====================================================================
-- 2. REGISTRAR — SUBMISSION QUEUE
-- =====================================================================
--
-- The queue is the registrar's whole job during grading season, and it
-- is the join the frontend must never assemble itself: submission +
-- class + section + subject + teacher + completeness, filtered by RLS.

create or replace function rds.submission_queue(p_year_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(q order by q ->> 'submittedAt' desc nulls last,
                            q ->> 'gradeLevel', q ->> 'section'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'submissionId', gs.id,
      'classId',      cl.id,
      'periodId',     p.id,
      'periodName',   p.name,
      'gradeLevel',   gl.name,
      'section',      sec.name,
      'subject',      sub.title,
      'teacher',      nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''),
      'status',       gs.status,
      'submittedAt',  gs.submitted_at,
      'returnedAt',   gs.returned_at,
      'returnReason', gs.return_reason,
      'studentCount', (select count(*) from public.class_enrollments ce
                       where ce.class_id = cl.id and ce.status = 'active'),
      'completeness', (
        select jsonb_build_object('scored', coalesce(x.scored,0), 'total', coalesce(x.total,0))
        from (
          select count(*) filter (where s.raw_score is not null or s.is_excused) as scored,
                 count(*) as total
          from public.class_enrollments ce
          cross join public.assessments a
          left join public.assessment_scores s
            on s.assessment_id = a.id and s.class_enrollment_id = ce.id
          where ce.class_id = cl.id and ce.status = 'active'
            and a.class_id = cl.id and a.academic_period_id = p.id
        ) x
      )
    ) as q
    from public.grade_submissions gs
    join public.classes cl        on cl.id = gs.class_id
    join public.academic_periods p on p.id = gs.academic_period_id
    join public.sections sec      on sec.id = cl.section_id
    join public.grade_levels gl   on gl.id = sec.grade_level_id
    join public.subjects sub      on sub.id = cl.subject_id
    left join public.users u      on u.id = cl.primary_teacher_id
    where cl.academic_year_id = p_year_id
  ) t
$$;

-- =====================================================================
-- 3. CLASS ROSTER WITH ENROLMENT DETAIL
-- =====================================================================
--
-- gradebook() returns the minimum a grid needs. The Students tab needs
-- the learner record behind it. LRN is included only because RLS already
-- decides whether the caller may read the students row at all — a
-- teacher of the class can, and that is the same rule SF1 relies on.

create or replace function rds.class_students(p_class_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(s order by s ->> 'displayName'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'classEnrollmentId', ce.id,
      'enrollmentId',      e.id,
      'studentId',         st.id,
      'displayName',       public.student_display_name(st.*),
      'studentNumber',     st.student_number,
      'lrn',               st.lrn,
      'sex',               st.sex,
      'enrollmentStatus',  e.status,
      'classStatus',       ce.status,
      'finalGrade',        (select fsg.final_grade from public.final_subject_grades fsg
                            where fsg.class_enrollment_id = ce.id and fsg.is_current)
    ) as s
    from public.class_enrollments ce
    join public.enrollments e on e.id = ce.enrollment_id
    join public.students st   on st.id = e.student_id
    where ce.class_id = p_class_id
  ) t
$$;

-- =====================================================================
-- 4. REGISTRAR — STUDENT DIRECTORY
-- =====================================================================

create or replace function rds.students(p_year_id uuid, p_search text default null)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(s order by s ->> 'displayName'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'studentId',      st.id,
      'displayName',    public.student_display_name(st.*),
      'studentNumber',  st.student_number,
      'lrn',            st.lrn,
      'sex',            st.sex,
      'gradeLevel',     gl.name,
      'section',        sec.name,
      'enrollmentStatus', e.status,
      'generalAverage', e.general_average
    ) as s
    from public.students st
    join public.enrollments e   on e.student_id = st.id and e.academic_year_id = p_year_id
    join public.grade_levels gl on gl.id = e.grade_level_id
    left join public.sections sec on sec.id = e.section_id
    where st.deleted_at is null
      and (
        p_search is null or btrim(p_search) = ''
        or public.student_display_name(st.*) ilike '%' || btrim(p_search) || '%'
        or coalesce(st.lrn, '')            ilike '%' || btrim(p_search) || '%'
        or coalesce(st.student_number, '') ilike '%' || btrim(p_search) || '%'
      )
  ) t
$$;

-- =====================================================================
-- 5. ATTENDANCE
-- =====================================================================
--
-- Uses the existing model exactly: calendar_days decides what is a class
-- day, attendance_statuses is per-school configuration, and the
-- one-per-day unique index is the conflict target. No second model.

create or replace function rds.attendance(p_class_id uuid, p_date date)
returns jsonb
language plpgsql
stable
as $$
declare
  v_day  record;
  v_year uuid;
begin
  select cl.academic_year_id into v_year from public.classes cl where cl.id = p_class_id;

  select cd.id, cd.day_type, cd.description
    into v_day
  from public.calendar_days cd
  where cd.academic_year_id = v_year and cd.day_date = p_date;

  return jsonb_build_object(
    'classId',    p_class_id,
    'date',       p_date,
    'calendarDayId', v_day.id,
    'dayType',    coalesce(v_day.day_type, 'not_in_calendar'),
    'dayNote',    v_day.description,
    -- A non-class day is not an error and not an empty roster; it is a
    -- distinct state the screen has to render differently.
    'isClassDay', coalesce(v_day.day_type, '') = 'class_day',
    'statuses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'code', s.code, 'label', s.label,
        'symbol', s.symbol, 'countsAs', s.counts_as) order by s.ordinal)
      from public.attendance_statuses s
      where s.is_active
    ), '[]'::jsonb),
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'enrollmentId', e.id,
        'studentId',    st.id,
        'displayName',  public.student_display_name(st.*),
        'statusId',     ar.attendance_status_id,
        'note',         ar.note) order by st.last_name, st.first_name)
      from public.class_enrollments ce
      join public.enrollments e on e.id = ce.enrollment_id
      join public.students st   on st.id = e.student_id
      left join public.attendance_records ar
        on ar.enrollment_id = e.id
       and ar.class_id = p_class_id
       and ar.calendar_day_id = v_day.id
      where ce.class_id = p_class_id and ce.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_attendance(
  p_class_id uuid,
  p_date date,
  p_marks jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_year   uuid;
  v_day    uuid;
  v_school uuid;
  v_written int := 0;
begin
  if jsonb_typeof(p_marks) <> 'array' then
    raise exception 'save_attendance expects an array' using errcode = '22023';
  end if;

  select cl.academic_year_id, cl.school_id into v_year, v_school
  from public.classes cl where cl.id = p_class_id;

  select cd.id into v_day
  from public.calendar_days cd
  where cd.academic_year_id = v_year and cd.day_date = p_date
    and cd.day_type = 'class_day';

  -- Refuse rather than invent a calendar day. The expected-days
  -- denominator on SF2/SF4 comes from this table, so a day silently
  -- created here would quietly change every attendance percentage.
  if v_day is null then
    raise exception 'no class day in the school calendar for %', p_date
      using errcode = '23514';
  end if;

  with incoming as (
    select (x ->> 'enrollmentId')::uuid as enrollment_id,
           (x ->> 'statusId')::uuid     as status_id,
           nullif(x ->> 'note', '')     as note
    from jsonb_array_elements(p_marks) x
  ),
  upserted as (
    insert into public.attendance_records
      (school_id, enrollment_id, class_id, calendar_day_id, attendance_status_id, note, recorded_by)
    select v_school, i.enrollment_id, p_class_id, v_day, i.status_id, i.note, app.current_user_id()
    from incoming i
    where i.status_id is not null
    on conflict (enrollment_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid), calendar_day_id)
    do update set attendance_status_id = excluded.attendance_status_id,
                  note                 = excluded.note,
                  recorded_by          = excluded.recorded_by,
                  updated_at           = now()
    returning 1
  )
  select count(*) into v_written from upserted;

  return jsonb_build_object('written', v_written);
end;
$$;

-- =====================================================================
-- 6. STUDENT PORTAL
-- =====================================================================
--
-- ⚠️ These take NO student id. The learner is resolved server-side from
-- app.current_student_id(), which reads the verified JWT. A student id
-- accepted as a parameter is an IDOR waiting to be found, and no amount
-- of frontend care prevents it.

create or replace function rds.my_profile()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'student', (
      select jsonb_build_object(
        'studentId',     st.id,
        'displayName',   public.student_display_name(st.*),
        'firstName',     st.first_name,
        'middleName',    st.middle_name,
        'lastName',      st.last_name,
        'suffix',        st.suffix,
        'lrn',           st.lrn,
        'studentNumber', st.student_number,
        'sex',           initcap(coalesce(st.sex, '')),
        'birthDate',     st.birth_date,
        'barangay',      st.barangay,
        'municipality',  st.municipality,
        'province',      st.province)
      from public.students st where st.id = app.current_student_id()
    ),
    'enrollment', (
      select jsonb_build_object(
        'academicYear', ay.label,
        'gradeLevel',   gl.name,
        'section',      sec.name,
        'status',       e.status,
        'dateEnrolled', e.date_enrolled,
        'adviser',      coalesce(e.adviser_name,
                          nullif(trim(coalesce(adv.first_name,'') || ' ' || coalesce(adv.last_name,'')), '')))
      from public.enrollments e
      join public.academic_years ay on ay.id = e.academic_year_id
      join public.grade_levels gl   on gl.id = e.grade_level_id
      left join public.sections sec on sec.id = e.section_id
      left join public.users adv    on adv.id = sec.adviser_user_id
      where e.student_id = app.current_student_id()
        and ay.status = 'active'
      order by e.date_enrolled desc
      limit 1
    ),
    'settings', coalesce((
      select jsonb_object_agg(key, value)
      from public.school_settings where school_id = app.current_school_id()
    ), '{}'::jsonb)
  )
$$;

-- Published grades only. The filter is not in this function — it is in
-- the RLS policies on period_grades and final_subject_grades, so a
-- direct query returns exactly the same rows. This function cannot widen
-- what the caller may see.
create or replace function rds.my_grades(p_year_id uuid default null)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(g order by g ->> 'academicYear' desc, g ->> 'subject'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'academicYear',  ay.label,
      'academicYearId', ay.id,
      'gradeLevel',    gl.name,
      'section',       sec.name,
      'subject',       sub.title,
      'subjectCode',   sub.code,
      'periods', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ordinal', p.ordinal, 'name', p.name, 'shortName', p.short_name,
          'grade',   pg.period_grade)
          order by p.ordinal)
        from public.academic_periods p
        left join public.period_grades pg
          on pg.class_enrollment_id = ce.id
         and pg.academic_period_id = p.id
         and pg.is_current
        where p.academic_year_id = ay.id
      ), '[]'::jsonb),
      'finalGrade', (select fsg.final_grade from public.final_subject_grades fsg
                     where fsg.class_enrollment_id = ce.id and fsg.is_current),
      'remark',     (select fsg.remark from public.final_subject_grades fsg
                     where fsg.class_enrollment_id = ce.id and fsg.is_current)
    ) as g
    from public.class_enrollments ce
    join public.enrollments e     on e.id = ce.enrollment_id
    join public.classes cl        on cl.id = ce.class_id
    join public.subjects sub      on sub.id = cl.subject_id
    join public.academic_years ay on ay.id = cl.academic_year_id
    join public.grade_levels gl   on gl.id = e.grade_level_id
    left join public.sections sec on sec.id = e.section_id
    where e.student_id = app.current_student_id()
      and (p_year_id is null or ay.id = p_year_id)
  ) t
$$;

create or replace function rds.my_academic_history()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(h order by h ->> 'academicYear' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'academicYearId',  ay.id,
      'academicYear',    ay.label,
      'gradeLevel',      gl.name,
      'section',         sec.name,
      'status',          e.status,
      'promotionStatus', e.promotion_status,
      'generalAverage',  e.general_average,
      'schoolName',      coalesce(e.recording_school_name, sch.name)
    ) as h
    from public.enrollments e
    join public.academic_years ay on ay.id = e.academic_year_id
    join public.grade_levels gl   on gl.id = e.grade_level_id
    join public.schools sch       on sch.id = e.school_id
    left join public.sections sec on sec.id = e.section_id
    where e.student_id = app.current_student_id()
  ) t
$$;

-- =====================================================================
-- 7. PUBLIC WRAPPERS
-- =====================================================================
--
-- PostgREST exposes `public` only. Wrapped per function rather than by
-- exposing the whole rds schema, so writing a contract does not publish
-- it by accident.

create or replace function public.submission_queue(p_year_id uuid)
returns jsonb language sql stable as $$ select rds.submission_queue(p_year_id) $$;

create or replace function public.class_students(p_class_id uuid)
returns jsonb language sql stable as $$ select rds.class_students(p_class_id) $$;

create or replace function public.students_directory(p_year_id uuid, p_search text default null)
returns jsonb language sql stable as $$ select rds.students(p_year_id, p_search) $$;

create or replace function public.attendance(p_class_id uuid, p_date date)
returns jsonb language sql stable as $$ select rds.attendance(p_class_id, p_date) $$;

create or replace function public.my_profile()
returns jsonb language sql stable as $$ select rds.my_profile() $$;

create or replace function public.my_grades(p_year_id uuid default null)
returns jsonb language sql stable as $$ select rds.my_grades(p_year_id) $$;

create or replace function public.my_academic_history()
returns jsonb language sql stable as $$ select rds.my_academic_history() $$;

-- =====================================================================
-- 8. GRANTS
-- =====================================================================
--
-- Explicit, and to `authenticated` only. Migration 0017 turned off the
-- default rule that granted `anon` execute on everything created in
-- public; these are named here so the privilege set stays readable from
-- the file rather than inferred from a default.

grant execute on function
  rds.submission_queue(uuid), rds.class_students(uuid), rds.students(uuid, text),
  rds.attendance(uuid, date), rds.my_profile(), rds.my_grades(uuid),
  rds.my_academic_history()
to authenticated, service_role;

grant execute on function
  public.submission_queue(uuid), public.class_students(uuid),
  public.students_directory(uuid, text), public.attendance(uuid, date),
  public.save_attendance(uuid, date, jsonb),
  public.my_profile(), public.my_grades(uuid), public.my_academic_history()
to authenticated, service_role;

revoke execute on function
  public.submission_queue(uuid), public.class_students(uuid),
  public.students_directory(uuid, text), public.attendance(uuid, date),
  public.save_attendance(uuid, date, jsonb),
  public.my_profile(), public.my_grades(uuid), public.my_academic_history()
from public, anon;

-- =====================================================================
-- 9. RE-PIN search_path
-- =====================================================================
--
-- Same introspective block as migration 0016. Every function added above
-- is new, so none carries a pinned search_path yet, and a hand-written
-- list here would go stale the next time a contract is added. Running
-- 0016's rule again is idempotent — it skips anything already pinned and
-- anything owned by an extension.

do $$
declare f record;
begin
  for f in
    select n.nspname as sch, p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'rds', 'public')
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) as c
        where c like 'search_path=%')
  loop
    execute format('alter function %I.%I(%s) set search_path = public, pg_temp',
                   f.sch, f.fn, f.args);
  end loop;
end $$;
