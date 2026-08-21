-- ============================================================
-- TEST · Tenant isolation
-- ============================================================
-- The single most important test in the codebase. Runs on every
-- migration and blocks the deploy on failure.
--
-- Authenticates as a School B user and asserts that ZERO School A rows
-- are visible through every tenant table. If this ever fails, the
-- multi-tenant decision is void and a database per school becomes the
-- correct architecture by default.
--
--   psql -d mendtrix -f supabase/tests/01_tenant_isolation.sql
--
-- NOTE: must run inside a transaction. `set local role` silently
-- no-ops outside one, and the whole suite then runs as superuser —
-- which bypasses RLS and passes vacuously.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temporary table _results (test text, detail text, passed boolean);
-- the assertions run as `authenticated`, so that role must be able to
-- record its own results
grant all on _results to public;

create or replace function pg_temp.assert_isolated(
  p_own_school uuid, p_other_school uuid
) returns void
language plpgsql as $$
declare
  t text;
  leaked int;
  total int := 0;
begin
  foreach t in array array[
    'school_settings','roles','user_roles','academic_years','academic_periods',
    'grade_levels','sections','subject_categories','subjects',
    'grade_level_subjects','calendar_days','transmutation_tables',
    'transmutation_bands','grading_schemes','grade_components',
    'descriptor_bands','attendance_statuses','students','guardians',
    'enrollments','classes','class_enrollments','assessments',
    'assessment_scores','period_grades','grade_submissions',
    'attendance_records','notifications','report_templates',
    'generated_documents','announcements'
  ] loop
    execute format('select count(*) from public.%I where school_id = %L', t, p_other_school)
      into leaked;
    insert into _results values ('isolation: ' || t, leaked || ' foreign rows visible', leaked = 0);
    total := total + leaked;
  end loop;

  if total > 0 then
    raise exception 'TENANT ISOLATION BREACH: % foreign rows visible', total;
  end if;
end;
$$;

begin;

  -- Authenticate as a School B teacher.
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"d0000001-0000-0000-0000-000000000003","school_id":"22222222-2222-2222-2222-222222222222"}',
    true);

  -- Guard: prove the role switch actually took. Without this, a harness
  -- bug makes the entire suite pass while testing nothing.
  do $$
  begin
    if current_user <> 'authenticated' then
      raise exception 'harness error: running as %, not authenticated', current_user;
    end if;
  end $$;

  select pg_temp.assert_isolated(
    '22222222-2222-2222-2222-222222222222'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid);

  -- Sanity: the same user CAN see their own tenant. A suite that passes
  -- because nothing at all is visible proves nothing.
  insert into _results
  select 'sanity: own students visible', count(*) || ' rows', count(*) > 0 from public.students;
  insert into _results
  select 'sanity: own classes visible', count(*) || ' rows', count(*) > 0 from public.classes;
  insert into _results
  select 'sanity: own periods visible', count(*) || ' rows', count(*) = 4 from public.academic_periods;

commit;

\pset format aligned
\echo ''
\echo '=== TENANT ISOLATION ==='
select case when passed then 'PASS' else 'FAIL' end as result, test, detail
from _results where not passed
union all
select 'PASS', 'all ' || count(*) || ' assertions', 'no foreign rows visible'
from _results where passed
order by 1 desc;

do $$
declare failed int;
begin
  select count(*) into failed from _results where not passed;
  if failed > 0 then
    raise exception '% isolation assertion(s) FAILED', failed;
  end if;
  raise notice 'PASS: all % isolation assertions', (select count(*) from _results);
end $$;
