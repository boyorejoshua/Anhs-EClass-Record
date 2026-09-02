-- 06 — The principal demonstration, run as a test.
--
-- Every step of the demo script in docs/27-phase-2-demo-readiness.md,
-- against the dataset supabase/demo-seed.sql builds. If this passes,
-- the demonstration works; if it fails, the demonstration would have
-- failed in front of the principal instead.
--
-- Run it AFTER the demo seed:
--   psql "$DATABASE_URL" -f supabase/demo-seed.sql
--   psql "$DATABASE_URL" -f supabase/tests/06_demo_workflow.sql
--
-- It rolls back, so it can be run immediately before a demonstration
-- without consuming the Term 1 submission the demo itself will make.
--
-- ⚠️ `adviser_queue` returns a jsonb ARRAY, not an object with a `rows`
-- key. An earlier version of this suite read `-> 'rows'`, got null, and
-- reported the adviser's queue as empty while the adviser could still
-- act on the submission — a failing assertion about a working product.
-- Worth remembering: check the contract's shape before believing a
-- queue is empty.

\pset tuples_only on
\pset format unaligned
begin;
do $$
declare
  ok text := '  PASS  '; bad text := '  FAIL  ';
  v_sch uuid; v_yr uuid; v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_tea uuid; v_adv uuid; v_reg uuid;
  v_class uuid; v_subm uuid; v_txt text; v_n int; v_res jsonb;
begin
  select id into v_sch from public.schools where code='anhs';
  select id into v_yr from public.academic_years
   where school_id=v_sch and status='active' and period_structure='three_term';
  select id into v_t1 from public.academic_periods where academic_year_id=v_yr and ordinal=1;
  select id into v_t2 from public.academic_periods where academic_year_id=v_yr and ordinal=2;
  select id into v_t3 from public.academic_periods where academic_year_id=v_yr and ordinal=3;
  select id into v_tea from public.users where email='maria@anhs.test';
  select id into v_adv from public.users where email='juan@anhs.test';
  select id into v_reg from public.users where email='registrar@anhs.test';
  select cl.id into v_class from public.classes cl
    join public.sections s on s.id=cl.section_id
    join public.subjects sub on sub.id=cl.subject_id
   where s.name='Demo 10-A' and sub.code='MATH10';

  raise notice '── TEACHER ────────────────────────────────────────────────';
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_tea)::text, true);
  set local role authenticated;

  select count(*) into v_n from jsonb_array_elements(public.my_classes(v_yr)) x;
  raise notice '% 1. the demo class is in the teacher''s My Classes -> % class(es)',
    case when v_n >= 4 then ok else bad end, v_n;

  select count(*) into v_n from jsonb_array_elements(public.class_students(v_class)) x;
  raise notice '% 2. the roster shows all eight demo learners -> %',
    case when v_n=8 then ok else bad end, v_n;

  -- gradebook for each term
  select jsonb_array_length(public.gradebook(v_class, v_t1) -> 'assessments') into v_n;
  raise notice '% 3. Term 1 gradebook has assessments -> %',
    case when v_n=4 then ok else bad end, v_n;
  select jsonb_array_length(public.gradebook(v_class, v_t3) -> 'assessments') into v_n;
  raise notice '% 4. Term 3 is empty, as seeded -> % assessment(s)',
    case when v_n=0 then ok else bad end, v_n;

  -- the deliberate gap is visible
  v_res := public.validate_submission(v_class, v_t2);
  raise notice '% 5. Term 2 reports the deliberate missing score -> %',
    case when v_res::text like '%missing%' then ok else bad end,
    left(v_res::text, 100);

  raise notice '── SUBMIT → ADVISER → REGISTRAR → PUBLISH ─────────────────';
  select (public.submit_grades(v_class, v_t1, true)).id into v_subm;
  select status into v_txt from public.grade_submissions where id=v_subm;
  raise notice '% 6. teacher submitted Term 1 -> %',
    case when v_txt='submitted' then ok else bad end, v_txt;

  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_adv)::text, true);
  select count(*) into v_n from jsonb_array_elements(public.adviser_queue(v_yr)) x;
  raise notice '% 7. it appears in the adviser''s queue -> % row(s)',
    case when v_n >= 1 then ok else bad end, v_n;

  perform public.receive_grades(v_subm);
  perform public.forward_grades(v_subm);
  select status into v_txt from public.grade_submissions where id=v_subm;
  raise notice '% 8. adviser received and forwarded -> %',
    case when v_txt='forwarded' then ok else bad end, v_txt;

  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_reg)::text, true);
  select count(*) into v_n from jsonb_array_elements(public.submission_queue(v_yr)) x;
  raise notice '% 9. and in the registrar''s queue -> % row(s)',
    case when v_n >= 1 then ok else bad end, v_n;

  perform public.registrar_receive_grades(v_subm);
  perform public.approve_grades(v_subm);
  perform public.finalize_grades(v_subm);
  perform public.publish_grades(v_subm);
  select status into v_txt from public.grade_submissions where id=v_subm;
  raise notice '% 10. registrar finalized and published -> %',
    case when v_txt='published' then ok else bad end, v_txt;

  raise notice '── TERM ISOLATION ─────────────────────────────────────────';
  select count(*) into v_n from public.grade_submissions
   where class_id=v_class and academic_period_id in (v_t2, v_t3);
  raise notice '% 11. Terms 2 and 3 are untouched by publishing Term 1 -> % submission(s)',
    case when v_n=0 then ok else bad end, v_n;
end $$;
rollback;
