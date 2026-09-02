-- ============================================================
-- demo-seed-remove.sql · Take the demonstration data back out
-- ============================================================
--
-- Removes exactly what demo-seed.sql created — the 'Demo 10-A' section,
-- its classes, assessments, scores, submissions and grades, and every
-- learner whose student number begins 'DEMO-'.
--
-- It touches nothing else. A learner with an LRN is never matched,
-- because demo learners never have one.
--
--   psql "$DATABASE_URL" -f supabase/demo-seed-remove.sql

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_school  uuid;
  v_section uuid;
  v_learners int;
begin
  select id into v_school from public.schools where code = 'anhs';
  select id into v_section from public.sections
   where school_id = v_school and name = 'Demo 10-A';

  -- Safety: refuse if anything matching the demo prefix carries an LRN,
  -- which would mean a real learner was given a demo student number.
  select count(*) into v_learners
    from public.students
   where school_id = v_school and student_number like 'DEMO-%' and lrn is not null;
  if v_learners > 0 then
    raise exception
      '% learner(s) with a DEMO- number also carry an LRN. Refusing to '
      'delete — check whether these are real records.', v_learners
      using errcode = '42501';
  end if;

  if v_section is not null then
    delete from public.assessment_scores s
     using public.class_enrollments ce, public.classes cl
     where s.class_enrollment_id = ce.id and ce.class_id = cl.id
       and cl.section_id = v_section;

    delete from public.period_grades pg
     using public.class_enrollments ce, public.classes cl
     where pg.class_enrollment_id = ce.id and ce.class_id = cl.id
       and cl.section_id = v_section;

    delete from public.grade_submissions gs
     using public.classes cl
     where gs.class_id = cl.id and cl.section_id = v_section;

    delete from public.assessments a
     using public.classes cl
     where a.class_id = cl.id and cl.section_id = v_section;

    delete from public.class_enrollments ce
     using public.classes cl
     where ce.class_id = cl.id and cl.section_id = v_section;

    delete from public.classes where section_id = v_section;
  end if;

  delete from public.enrollment_events ev
   using public.enrollments e, public.students st
   where ev.enrollment_id = e.id and e.student_id = st.id
     and st.school_id = v_school and st.student_number like 'DEMO-%';

  delete from public.enrollments e
   using public.students st
   where e.student_id = st.id
     and st.school_id = v_school and st.student_number like 'DEMO-%';

  update public.students set portal_user_id = null
   where school_id = v_school and student_number like 'DEMO-%';

  delete from public.students
   where school_id = v_school and student_number like 'DEMO-%';

  if v_section is not null then
    delete from public.sections where id = v_section;
  end if;

  -- The demo PORTAL ACCOUNT is left alone deliberately. Deleting an
  -- auth identity is the auth provider's job, not a SQL script's, and
  -- an account with no learner attached simply resolves to nobody —
  -- which is the safe direction to fail in.
end $$;

commit;

\echo '  Demo dataset removed. The demo portal account, if any, was left'
\echo '  in place — remove it from the Users screen or the auth provider.'
