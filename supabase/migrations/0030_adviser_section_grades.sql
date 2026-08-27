-- 0030 — Let the adviser read their own section's grades.
--
-- The gap 0022 named and deliberately left open: the `adviser` role has
-- held `grades.read.section` since the permission catalogue was first
-- seeded, and no policy anywhere ever consulted it. An adviser could
-- sign for a subject teacher's submission without being able to read a
-- single mark in it, and could not consolidate their advisory section's
-- report card at all — the one thing "Consolidated Grades" in the nav
-- has been waiting on.
--
-- Scoped exactly as 0022's note promised: the COMPUTED period grade,
-- not the raw marks behind it. An adviser consolidating a report card
-- needs "English: 88, Passed" for each learner in their section; they
-- do not need to see another teacher's gradebook, and widening that
-- further would be the security decision 0022 explicitly deferred.

-- ------------------------------------------------------------
-- app.class_enrollment_advised_by_me — same shape as the teacher
-- equivalent (app.class_enrollment_in_my_classes, 0009), for the
-- adviser side of the same join.
-- ------------------------------------------------------------
create or replace function app.class_enrollment_advised_by_me(p_ce_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.class_enrollments ce
    join public.classes cl on cl.id = ce.class_id
    join public.sections sec on sec.id = cl.section_id
    where ce.id = p_ce_id
      and sec.adviser_user_id = app.current_user_id()
      and cl.school_id = app.current_school_id()
  )
$$;

comment on function app.class_enrollment_advised_by_me is
  'Whether the current user advises the SECTION this class-enrolment '
  'belongs to. The adviser half of app.class_enrollment_in_my_classes.';

-- ------------------------------------------------------------
-- The policy itself
-- ------------------------------------------------------------
create policy period_grades_read_adviser on public.period_grades
  for select to authenticated
  using (
    is_current
    and school_id = app.current_school_id()
    and app.has_permission('grades.read.section')
    and app.class_enrollment_advised_by_me(period_grades.class_enrollment_id)
  );

-- ------------------------------------------------------------
-- rds.my_advisory_sections — which section(s) am I the adviser of,
-- this year. What a "pick your section" control offers; there is
-- usually exactly one, but nothing here assumes that.
-- ------------------------------------------------------------
create or replace function rds.my_advisory_sections(p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sec.id, 'name', sec.name,
           'gradeLevel', gl.name, 'gradeLevelId', sec.grade_level_id)
         order by gl.ordinal, sec.name), '[]'::jsonb)
  from public.sections sec
  join public.grade_levels gl on gl.id = sec.grade_level_id
  where sec.academic_year_id = p_year_id
    and sec.school_id = app.current_school_id()
    and sec.adviser_user_id = app.current_user_id()
$$;

create or replace function public.my_advisory_sections(p_year_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $$ select rds.my_advisory_sections(p_year_id) $$;

-- ------------------------------------------------------------
-- rds.consolidated_grades — one section, one period, every subject.
-- ------------------------------------------------------------
-- Reads ONLY through the RLS-checked period_grades policy above —
-- there is no bypass here, no service-role shortcut. If the caller does
-- not advise this section, the join to period_grades returns nothing
-- and the response is an empty grade set, the same as any other RLS
-- read that resolves to zero rows.
-- ⚠️ SECURITY DEFINER, deliberately, and here is why it has to be.
-- period_grades_read_adviser fixes what THIS function reads for its
-- final answer, but the function's own internal joins -- to
-- class_enrollments, to classes for subjects the adviser does not
-- teach -- run under the CALLER's RLS if this is SECURITY INVOKER, and
-- an adviser has no read grant on another teacher's class_enrollments
-- at all. The first version of this function was invoker rights and
-- came back with every grade empty for a real adviser reading a real
-- class they do not teach — caught by testing against the live
-- database with a genuine cross-teacher case, not by reading the code.
--
-- So this checks its OWN authorization up front, the same pattern
-- create_class and create_section already use, and having done that
-- once, runs the whole report with full visibility.
create or replace function rds.consolidated_grades(p_section_id uuid, p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_school  uuid := app.current_school_id();
  v_advises boolean;
  v_result  jsonb;
begin
  select exists (
    select 1 from public.sections s
    where s.id = p_section_id and s.school_id = v_school
      and s.adviser_user_id = app.current_user_id()
  ) into v_advises;

  if not (v_advises and app.has_permission('grades.read.section')) then
    raise exception 'you do not advise this section' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'section', (
      select jsonb_build_object('id', sec.id, 'name', sec.name, 'gradeLevel', gl.name)
      from public.sections sec join public.grade_levels gl on gl.id = sec.grade_level_id
      where sec.id = p_section_id
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', sub.id, 'title', sub.title, 'classId', cl.id) order by sub.title)
      from public.classes cl join public.subjects sub on sub.id = cl.subject_id
      where cl.section_id = p_section_id and cl.status = 'active'
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'studentId', st.id,
               'displayName', public.student_display_name(st),
               'grades', (
                 select coalesce(jsonb_object_agg(cl.subject_id, jsonb_build_object(
                          'classId', cl.id,
                          'grade', pg.period_grade,
                          'descriptor', pg.descriptor,
                          'passed', pg.passed,
                          'statusCode', pg.status_code)), '{}'::jsonb)
                 from public.classes cl
                 join public.class_enrollments ce
                   on ce.class_id = cl.id and ce.enrollment_id = e.id
                 join public.period_grades pg
                   on pg.class_enrollment_id = ce.id
                  and pg.academic_period_id = p_period_id
                  and pg.is_current
                 where cl.section_id = p_section_id and cl.status = 'active'
               ))
             order by st.last_name, st.first_name)
      from public.enrollments e
      join public.students st on st.id = e.student_id
      where e.section_id = p_section_id
        and e.status in ('enrolled', 'transferred_in')
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.consolidated_grades(p_section_id uuid, p_period_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $$ select rds.consolidated_grades(p_section_id, p_period_id) $$;

comment on function public.consolidated_grades is
  'Every subject''s period grade for every learner in one section, one '
  'period, for the adviser of that section. Checks the section '
  'relationship and grades.read.section before returning anything.';

grant execute on function
  app.class_enrollment_advised_by_me(uuid),
  rds.my_advisory_sections(uuid), public.my_advisory_sections(uuid),
  rds.consolidated_grades(uuid, uuid), public.consolidated_grades(uuid, uuid)
to authenticated;

revoke execute on function
  rds.my_advisory_sections(uuid), public.my_advisory_sections(uuid),
  rds.consolidated_grades(uuid, uuid), public.consolidated_grades(uuid, uuid)
from public, anon;
