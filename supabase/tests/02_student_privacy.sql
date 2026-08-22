-- ============================================================
-- TEST · Student privacy and the publication gate
-- ============================================================
-- Asserts the two rules the student portal depends on:
--   1. A learner sees ONLY their own records.
--   2. A learner sees a grade ONLY after the registrar publishes it.
--      Draft, submitted, approved and finalized are all invisible.
--
-- Both are enforced inside the RLS predicate, not in application code,
-- so a careless future query returns zero rows rather than leaking.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temporary table _r (test text, detail text, passed boolean);
grant all on _r to public;

\set STUDENT_JOSHUA c0000001-0000-0000-0000-000000000009
\set SCHOOL_A       11111111-1111-1111-1111-111111111111
\set REGISTRAR      c0000001-0000-0000-0000-000000000002
\set TEACHER_MARIA  c0000001-0000-0000-0000-000000000003

-- Reset, so the suite is idempotent and can be re-run against a
-- database that already has fixtures from an earlier run.
delete from public.period_grades
 where class_enrollment_id in (
   select id from public.class_enrollments
   where class_id = 'aa000000-0000-0000-0000-000000000001');
delete from public.grade_submissions
 where class_id = 'aa000000-0000-0000-0000-000000000001';
delete from public.audit_logs where action like 'grades.%';
delete from public.notifications where type in ('grades_published','submission_returned');

-- ------------------------------------------------------------
-- Arrange: compute Term 1 grades for the whole Mathematics class.
-- Written as superuser because period_grades is written only by
-- SECURITY DEFINER functions — there is deliberately no client grant.
-- ------------------------------------------------------------
insert into public.period_grades
  (school_id, class_enrollment_id, academic_period_id, initial_grade, period_grade, scheme_snapshot)
select ce.school_id, ce.id, p.id, 82.40, 89,
       jsonb_build_object('scheme','DO 015 s.2026 — Core (G4-10)','ww',20,'pt',50,'ex',30)
from public.class_enrollments ce
join public.classes c on c.id = ce.class_id
join public.academic_periods p on p.academic_year_id = c.academic_year_id and p.ordinal = 1
where c.id = 'aa000000-0000-0000-0000-000000000001';

insert into public.grade_submissions (school_id, class_id, academic_period_id, status, finalized_at)
select '11111111-1111-1111-1111-111111111111', 'aa000000-0000-0000-0000-000000000001', p.id,
       'finalized', now()
from public.academic_periods p
where p.academic_year_id = 'e0000001-0000-0000-0000-000000000001' and p.ordinal = 1;

-- ------------------------------------------------------------
-- 1. FINALIZED but not published → learner sees NOTHING
-- ------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', :'STUDENT_JOSHUA', 'school_id', :'SCHOOL_A')::text, true);

  insert into _r select 'finalized grade is hidden from learner',
    count(*) || ' grades visible', count(*) = 0 from public.period_grades;
commit;

-- ------------------------------------------------------------
-- 2. Registrar publishes
-- ------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', :'REGISTRAR', 'school_id', :'SCHOOL_A')::text, true);

  select public.publish_grades(id) from public.grade_submissions
  where class_id = 'aa000000-0000-0000-0000-000000000001';

  insert into _r values ('registrar can publish', 'publish_grades() succeeded', true);
commit;

-- ------------------------------------------------------------
-- 3. Published → learner sees EXACTLY their own grade, no one else's
-- ------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', :'STUDENT_JOSHUA', 'school_id', :'SCHOOL_A')::text, true);

  insert into _r select 'published grade is visible',
    count(*) || ' grades visible', count(*) = 1 from public.period_grades;

  -- The class has 6 learners. If the learner can see more than their own
  -- row, the self-scoping predicate has failed.
  insert into _r select 'learner sees ONLY own grade',
    count(*) || ' of 6 classmates'' grades visible', count(*) = 1
  from public.period_grades;

  insert into _r select 'learner sees only own student record',
    count(*) || ' student rows visible', count(*) = 1 from public.students;

  -- A learner has one enrollment PER YEAR and legitimately sees all of
  -- their own (that is their academic history). Assert OWNERSHIP, not a
  -- count: every visible row must be theirs, and at least one must be.
  insert into _r select 'every visible enrollment belongs to the learner',
    count(*) filter (where student_id <> app.current_student_id()) || ' foreign of '
      || count(*) || ' visible',
    count(*) > 0 and count(*) filter (where student_id <> app.current_student_id()) = 0
  from public.enrollments;

  -- A roster would expose classmates' names; not a student-facing
  -- feature. Every visible roster row must trace back to this learner.
  insert into _r select 'learner cannot enumerate classmates',
    count(*) filter (where not app.enrollment_is_mine(enrollment_id)) || ' foreign of '
      || count(*) || ' roster rows visible',
    count(*) filter (where not app.enrollment_is_mine(enrollment_id)) = 0
  from public.class_enrollments;

  -- Cannot reach another learner by naming them directly.
  insert into _r select 'direct query for another learner returns nothing',
    count(*) || ' rows', count(*) = 0
  from public.students where id = 'a8000000-0000-0000-0000-000000000001';

  -- Cannot see staff working data.
  insert into _r select 'learner cannot read the audit log',
    count(*) || ' audit rows visible', count(*) = 0 from public.audit_logs;
commit;

-- ------------------------------------------------------------
-- 4. Reopened → visibility REVERTS immediately
-- ------------------------------------------------------------
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', :'REGISTRAR', 'school_id', :'SCHOOL_A')::text, true);
  select public.reopen_grades(id, 'Correction requested by adviser')
  from public.grade_submissions where class_id = 'aa000000-0000-0000-0000-000000000001';
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', :'STUDENT_JOSHUA', 'school_id', :'SCHOOL_A')::text, true);
  insert into _r select 'reopening hides the grade again',
    count(*) || ' grades visible', count(*) = 0 from public.period_grades;
commit;

-- ------------------------------------------------------------
-- 5. A teacher cannot publish; only the registrar can
-- ------------------------------------------------------------
do $$
declare ok boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"c0000001-0000-0000-0000-000000000003","school_id":"11111111-1111-1111-1111-111111111111"}', true);
    perform public.publish_grades(
      (select id from public.grade_submissions
       where class_id = 'aa000000-0000-0000-0000-000000000001'));
  exception when others then
    ok := true;   -- expected: insufficient_privilege
  end;
  reset role;
  insert into _r values ('teacher cannot publish grades',
    case when ok then 'correctly refused' else 'PERMITTED — BUG' end, ok);
end $$;

-- ------------------------------------------------------------
-- 6. Audit trail exists for every transition
-- ------------------------------------------------------------
insert into _r select 'publish and reopen are audited',
  count(*) || ' workflow audit rows', count(*) >= 2
from public.audit_logs where action in ('grades.publish','grades.reopen');

insert into _r select 'reopen recorded its reason',
  coalesce(max(reason), '(none)'), count(*) = 1
from public.audit_logs where action = 'grades.reopen' and reason is not null;

-- ------------------------------------------------------------
\pset format aligned
\echo ''
\echo '=== STUDENT PRIVACY & PUBLICATION GATE ==='
select case when passed then 'PASS' else 'FAIL' end as result, test, detail
from _r order by passed, test;

do $$
declare failed int;
begin
  select count(*) into failed from _r where not passed;
  if failed > 0 then raise exception '% privacy assertion(s) FAILED', failed; end if;
  raise notice 'PASS: all % privacy assertions', (select count(*) from _r);
end $$;
