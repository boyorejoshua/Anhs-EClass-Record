-- 04 — The whole journey, once, in a transaction that is rolled back.
--
-- Phase 0 found `grade_submissions` and `period_grades` EMPTY on
-- production: the lifecycle existed and had never run. This is the
-- rehearsal, kept as a suite so it can be re-run against any database
-- before a school is let near it.
--
--   student → enrolment → section → class membership → teacher
--     → assessment → grade entry → submission → adviser → registrar
--     → finalize → publish → portal → schedule
--
-- It writes nothing: the final `rollback` is the point. Run it with
--   psql -f supabase/tests/04_lifecycle_rehearsal.sql
-- against a database rebuilt from every migration plus seed.sql.
--
-- ── WHAT THIS SUITE TAUGHT US ────────────────────────────────────────
--
-- Two things that no unit test had shown, both found by running it:
--
--   1. `save_assessments` treats its payload as the COMPLETE set for a
--      period and refuses to remove one that already carries marks. A
--      teacher adding a written work must send the existing ones too.
--   2. `record_period_grades` refuses once a period is FINALIZED. The
--      authoritative grade therefore has to be persisted BEFORE the
--      record leaves the teacher's hands — which is exactly what
--      `compute-period-grades` does, persisting and then submitting in
--      one invocation. Doing it the other way round fails.
\pset tuples_only on
\pset format unaligned
begin;

do $$
declare
  ok  text := '  PASS  ';  bad text := '  FAIL  ';
  v_sch uuid; v_other uuid;
  v_reg uuid; v_tea uuid; v_adv uuid; v_admin uuid;
  v_yr uuid; v_p1 uuid; v_g10 uuid; v_pearl uuid; v_diamond uuid;
  v_sub uuid; v_class uuid; v_scheme uuid;
  v_res jsonb; v_st uuid; v_enr uuid; v_ce uuid; v_sub_id uuid;
  v_user uuid; v_n int; v_txt text; v_ww uuid; v_a1 uuid; v_num numeric;
  v_rows jsonb;

  procedure_note text;

  function_signal text;
begin
  select id into v_sch   from public.schools where code='anhs';
  select id into v_other from public.schools where code<>'anhs' limit 1;
  select id into v_yr    from public.academic_years where school_id=v_sch and status='active';
  select id into v_g10   from public.grade_levels where school_id=v_sch and ordinal=10;
  select id into v_pearl from public.sections where school_id=v_sch and name='Pearl';
  select id into v_diamond from public.sections where school_id=v_sch and name='Diamond';
  select id into v_sub   from public.subjects where school_id=v_sch and code='MATH10';

  -- ⚠️ NOT "ordinal = 1". seed.sql leaves Pearl/MATH10 Term 1 already
  -- SUBMITTED (suite 03 asserts that), so save_assessments correctly
  -- refuses to reconfigure it and this suite failed on a working
  -- product. Pick a period this class has not submitted, so the suite
  -- controls its own preconditions instead of inheriting them.
  select p.id into v_p1
    from public.academic_periods p
   where p.academic_year_id = v_yr
     and not exists (
       select 1 from public.grade_submissions gs
        join public.classes cl on cl.id = gs.class_id
       where gs.academic_period_id = p.id
         and cl.section_id = v_pearl
         and cl.subject_id = v_sub)
   order by p.ordinal
   limit 1;

  select u.id into v_reg from public.users u join public.user_roles ur on ur.user_id=u.id
    join public.roles r on r.id=ur.role_id where u.school_id=v_sch and r.code='registrar' limit 1;
  select u.id into v_tea from public.users u join public.user_roles ur on ur.user_id=u.id
    join public.roles r on r.id=ur.role_id where u.school_id=v_sch and r.code='teacher' limit 1;
  select u.id into v_adv from public.users u join public.user_roles ur on ur.user_id=u.id
    join public.roles r on r.id=ur.role_id where u.school_id=v_sch and r.code='adviser' limit 1;
  select u.id into v_admin from public.users u join public.user_roles ur on ur.user_id=u.id
    join public.roles r on r.id=ur.role_id where u.school_id=v_sch and r.code='school_admin' limit 1;

  raise notice '── STUDENT AND ENROLMENT (registrar) ──────────────────────';
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_reg)::text, true);
  set local role authenticated;

  -- 1 admit + enrol
  v_res := public.admit_student(
    jsonb_build_object('firstName','Testa','lastName','Rehearsal','lrn','999000111222'),
    jsonb_build_object('academicYearId',v_yr,'gradeLevelId',v_g10,'sectionId',v_pearl));
  v_st  := (v_res->>'studentId')::uuid;
  v_enr := (v_res->>'enrollmentId')::uuid;
  raise notice '% 1. student admitted with a stable UUID -> %',
    case when v_st is not null and v_res->>'status'='created' then ok else bad end, v_st;

  -- 2 duplicate LRN refused
  begin
    perform public.admit_student(
      jsonb_build_object('firstName','Other','lastName','Person','lrn','999000111222'),
      'null'::jsonb, true);
    raise notice '% 2. duplicate LRN accepted', bad;
  exception when others then
    raise notice '% 2. duplicate LRN refused', ok;
  end;

  -- 3 namesake warns
  v_res := public.admit_student(
    jsonb_build_object('firstName','testa','lastName','REHEARSAL'), 'null'::jsonb);
  raise notice '% 3. namesake WARNS rather than refusing -> %',
    case when v_res->>'status'='needs_confirmation' then ok else bad end, v_res->>'status';

  -- 4 duplicate active enrolment refused
  begin
    perform public.enrol_student(v_st, jsonb_build_object(
      'academicYearId',v_yr,'gradeLevelId',v_g10));
    raise notice '% 4. duplicate enrolment accepted', bad;
  exception when others then
    raise notice '% 4. duplicate enrolment in the same year refused', ok;
  end;

  -- 5 PHASE 1 FIX: joined the section's existing classes
  select count(*) into v_n from public.class_enrollments
   where enrollment_id=v_enr and status='active';
  raise notice '% 5. [P1 fix] enrolment joined % existing class(es)',
    case when v_n >= 1 then ok else bad end, v_n;

  -- 6 events, deterministic order
  select string_agg(event_type,' → ' order by seq) into v_txt
    from public.enrollment_events where enrollment_id=v_enr;
  raise notice '% 6. [P1 fix] events recorded in order -> %',
    case when v_txt = 'enrolled → section_change' then ok else bad end, v_txt;

  raise notice '── TEACHER: ROSTER, ASSESSMENT, GRADE ENTRY ───────────────';
  select cl.id into v_class from public.classes cl
   where cl.section_id=v_pearl and cl.subject_id=v_sub and cl.academic_year_id=v_yr;
  update public.classes set primary_teacher_id=v_tea where id=v_class;

  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_tea)::text, true);

  -- 7 the learner is on the teacher's roster
  select count(*) into v_n
    from jsonb_array_elements(public.class_students(v_class)) x
   where (x->>'studentId')::uuid = v_st;
  raise notice '% 7. the new learner appears on the teacher''s roster -> %',
    case when v_n=1 then ok else bad end, v_n;

  -- 8 write an assessment through the real RPC
  select gc.id into v_ww from public.grade_components gc
    join public.subject_categories sc on sc.grading_scheme_id = gc.grading_scheme_id
    join public.subjects s on s.subject_category_id = sc.id
   where s.id = v_sub and gc.code='WW' and gc.parent_component_id is null;
  -- save_assessments treats its payload as the COMPLETE set for the
  -- period and removes anything absent — correctly refusing to drop one
  -- that already carries marks. So APPEND to what the seed already has
  -- rather than replacing it, which is what a teacher adding a new
  -- written work actually does.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'componentId', a.grade_component_id, 'ordinal', a.ordinal,
           'title', a.title, 'highestPossibleScore', a.highest_possible_score)), '[]'::jsonb)
    into v_rows
    from public.assessments a
   where a.class_id = v_class and a.academic_period_id = v_p1;

  select coalesce(max(a.ordinal), 0) + 1 into v_n
    from public.assessments a
   where a.class_id=v_class and a.academic_period_id=v_p1 and a.grade_component_id=v_ww;

  v_res := public.save_assessments(v_class, v_p1, v_rows || jsonb_build_array(
    jsonb_build_object('componentId', v_ww, 'ordinal', v_n,
                       'title','Rehearsal WW','highestPossibleScore',20)));
  select a.id into v_a1 from public.assessments a
   where a.class_id=v_class and a.academic_period_id=v_p1
     and a.grade_component_id=v_ww and a.ordinal=v_n;
  raise notice '% 8. assessment created through save_assessments -> %',
    case when v_a1 is not null then ok else bad end, v_res::text;

  -- 9 marks for every learner on the roster, through save_scores
  select ce.id into v_ce from public.class_enrollments ce
   where ce.class_id=v_class and ce.enrollment_id=v_enr;
  select jsonb_agg(jsonb_build_object(
           'assessmentId', v_a1, 'classEnrollmentId', ce.id, 'raw', 18))
    into v_rows
    from public.class_enrollments ce
   where ce.class_id=v_class and ce.status='active';
  v_res := public.save_scores(v_rows);
  raise notice '% 9. marks written through save_scores -> %',
    case when (v_res->>'written')::int > 0 then ok else bad end, v_res::text;

  -- 10 the mark belongs to the right school/year/class/subject/student/term
  select count(*) into v_n
    from public.assessment_scores s
    join public.assessments a  on a.id = s.assessment_id
    join public.class_enrollments ce on ce.id = s.class_enrollment_id
    join public.enrollments e  on e.id = ce.enrollment_id
    join public.classes cl     on cl.id = ce.class_id
   where s.class_enrollment_id = v_ce
     and s.school_id = v_sch and a.academic_period_id = v_p1
     and cl.academic_year_id = v_yr and cl.subject_id = v_sub
     and e.student_id = v_st;
  raise notice '% 10. the mark is bound to school, year, class, subject, learner and term -> %',
    case when v_n=1 then ok else bad end, v_n;

  raise notice '── SUBMISSION CHAIN ───────────────────────────────────────';
  -- 11 validate then submit
  v_res := public.validate_submission(v_class, v_p1);
  raise notice '% 11. validate_submission answers before submitting -> %',
    case when v_res is not null then ok else bad end, left(v_res::text, 90);

  -- ── THE ORDER MATTERS, AND THE REHEARSAL IS HOW WE LEARNED IT ────
  --
  -- `compute-period-grades` persists period_grades and THEN calls
  -- submit_grades, in one invocation. Doing it the other way round —
  -- persisting after finalization — is refused by
  -- `record_period_grades`: "this period is finalized and its grades
  -- cannot be changed". That guard is correct, and it means the
  -- authoritative grade must exist before the record leaves the
  -- teacher's hands. Reproduced here as the Edge Function does it.
  set local role postgres;
  v_res := public.record_period_grades(v_class, v_p1, jsonb_build_array(
    jsonb_build_object('classEnrollmentId', v_ce, 'periodGrade', 90,
                       'initialGrade', 90, 'descriptor', 'Outstanding',
                       'passed', true, 'components', '[]'::jsonb)));
  set local role authenticated;
  select count(*) into v_n from public.period_grades
   where class_enrollment_id=v_ce and academic_period_id=v_p1 and is_current;
  raise notice '% 11b. period grade persisted BEFORE submission -> % row(s)',
    case when v_n=1 then ok else bad end, v_n;

  -- submit_grades returns the whole grade_submissions ROW, not an id.
  select (public.submit_grades(v_class, v_p1, true)).id into v_sub_id;
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 12. teacher submitted -> % (FIRST ROW grade_submissions has ever held here)',
    case when v_txt='submitted' then ok else bad end, v_txt;

  -- 13 a teacher may not approve their own work
  begin
    perform public.approve_grades(v_sub_id);
    raise notice '% 13. a TEACHER approved their own submission', bad;
  exception when others then
    raise notice '% 13. a teacher cannot approve their own submission -> %', ok, sqlerrm;
  end;

  -- 14-15 adviser receives and forwards
  update public.sections set adviser_user_id = v_adv where id = v_pearl;
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_adv)::text, true);
  perform public.receive_grades(v_sub_id);
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 14. adviser received -> %', case when v_txt='received' then ok else bad end, v_txt;

  perform public.forward_grades(v_sub_id);
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 15. adviser forwarded -> %', case when v_txt='forwarded' then ok else bad end, v_txt;

  -- 16-19 registrar receives, approves, finalizes, publishes
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_reg)::text, true);
  perform public.registrar_receive_grades(v_sub_id);
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 16. registrar received -> %',
    case when v_txt='registrar_received' then ok else bad end, v_txt;

  perform public.approve_grades(v_sub_id);
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 17. registrar approved -> %', case when v_txt='approved' then ok else bad end, v_txt;

  perform public.finalize_grades(v_sub_id);
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 18. registrar finalized -> %', case when v_txt='finalized' then ok else bad end, v_txt;

  perform public.publish_grades(v_sub_id);
  select status into v_txt from public.grade_submissions where id=v_sub_id;
  raise notice '% 19. registrar published -> %', case when v_txt='published' then ok else bad end, v_txt;

  -- every transition audited
  select count(*) into v_n from public.audit_logs
   where entity_type='grade_submissions' and entity_id=v_sub_id;
  raise notice '% 20. every transition wrote an audit row -> %',
    case when v_n >= 6 then ok else bad end, v_n;

  raise notice '── PORTAL ACCOUNT AND THE LEARNER''S OWN VIEW ─────────────';
  set local role postgres;
  v_user := gen_random_uuid();
  insert into public.users (id, school_id, email, first_name, last_name, status)
  values (v_user, v_sch, 'testa.rehearsal@example.test', 'Testa', 'Rehearsal', 'active');
  set local role authenticated;
  v_res := public.link_student_portal_account(v_st, v_user);
  raise notice '% 22. portal account linked -> %',
    case when v_res->>'status'='linked' then ok else bad end, v_res->>'status';

  -- sign in AS THE LEARNER
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_sch,'sub',v_user)::text, true);

  raise notice '% 23. the portal resolves the learner from the token alone -> %',
    case when app.current_student_id() = v_st then ok else bad end,
    coalesce(app.current_student_id()::text,'null');

  select count(*) into v_n from jsonb_array_elements(public.my_grades(null)) x;
  raise notice '% 24. the learner sees their PUBLISHED grade -> % subject row(s)',
    case when v_n >= 1 then ok else bad end, v_n;

  select count(*) into v_n from public.students;
  raise notice '% 25. and exactly ONE learner — themselves -> %',
    case when v_n=1 then ok else bad end, v_n;

  raise notice '── SCHEDULE ───────────────────────────────────────────────';
  v_res := public.my_schedule();
  raise notice '% 26. schedule resolves from the current enrolment -> % / %',
    case when v_res->'enrollment'->>'section' = 'Pearl' then ok else bad end,
    v_res->'enrollment'->>'gradeLevel', v_res->'enrollment'->>'section';

  select count(*) into v_n from jsonb_array_elements(v_res->'classes') x;
  raise notice '% 27. and lists the classes they are actually in -> %',
    case when v_n >= 1 then ok else bad end, v_n;

  select x->>'when' into v_txt from jsonb_array_elements(v_res->'classes') x limit 1;
  raise notice '% 28. the schedule note is returned VERBATIM, not parsed -> %',
    case when v_txt is null or v_txt !~ '^(Mon|Tue|Wed)' then ok else bad end,
    coalesce(v_txt,'(none recorded)');

  select count(*) into v_n from jsonb_array_elements(v_res->'classes') x
   where (x->>'classId')::uuid not in (
     select ce.class_id from public.class_enrollments ce
      join public.enrollments e on e.id=ce.enrollment_id
     where e.student_id = v_st);
  raise notice '% 29. every class on it belongs to this learner -> % foreign',
    case when v_n=0 then ok else bad end, v_n;

end $$;

-- The rollback belongs OUT here: plpgsql cannot terminate the
-- transaction it is running inside. Nothing above is kept — the whole
-- rehearsal leaves no rows, which is the point.
rollback;
