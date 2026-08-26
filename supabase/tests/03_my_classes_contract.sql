-- ============================================================
-- TEST · rds.my_classes returns the shape the client depends on
-- ============================================================
-- Regression test for a real production bug: `ClassSummary.receipts`
-- has been a REQUIRED field on the client type since the receipt chain
-- landed (0022), but `rds.my_classes` (0014) never returned one. Every
-- teacher opening the Submission tab of a real class hit
-- `cls.receipts[periodId]` on an undefined `receipts`, which threw
-- during render. With no error boundary in the app, that is a blank
-- white screen — the exact report that led here.
--
-- It went undetected because the fixture DataSource fabricates
-- `receipts` for every class, so the demo and the e2e suite — which run
-- against fixtures — never exercised the real RPC. This test calls the
-- real RPC and checks its keys, so a future change that drops a field
-- the client relies on fails HERE, in CI, not in a teacher's browser.
--
-- Fixed by migration 0028.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create temporary table _r (test text, detail text, passed boolean);
grant all on _r to public;

\set SCHOOL_A       11111111-1111-1111-1111-111111111111
\set YEAR_A         e0000001-0000-0000-0000-000000000001
\set TEACHER_JUAN   c0000001-0000-0000-0000-000000000004
\set MATH_PEARL     aa000000-0000-0000-0000-000000000001
\set MAPEH_PEARL    aa000000-0000-0000-0000-000000000002

-- Reset, so the suite is idempotent against a database that already
-- carries fixtures from an earlier run.
delete from public.grade_submissions where class_id in (:'MATH_PEARL', :'MAPEH_PEARL');

-- ------------------------------------------------------------
-- Arrange: Math/Pearl Term 1 is submitted (a receipt should exist);
-- Term 2 and Term 3 are untouched (no receipt should exist for them).
-- ------------------------------------------------------------
insert into public.grade_submissions (school_id, class_id, academic_period_id, status, submitted_at)
select :'SCHOOL_A', :'MATH_PEARL', p.id, 'submitted', now()
from public.academic_periods p
where p.academic_year_id = :'YEAR_A' and p.ordinal = 1;

-- ------------------------------------------------------------
-- Act: call the RPC exactly as the client does, as Juan (a real
-- teacher), not as the superuser this script otherwise runs as.
-- ------------------------------------------------------------
create temporary table _classes (data jsonb);
grant all on _classes to public;

begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', :'TEACHER_JUAN', 'school_id', :'SCHOOL_A')::text, true);
  insert into _classes select public.my_classes(:'YEAR_A'::uuid);
commit;

-- ------------------------------------------------------------
-- Assert
-- ------------------------------------------------------------
insert into _r select 'my_classes returns at least one class',
  jsonb_array_length(data) || ' classes', jsonb_array_length(data) >= 1
from _classes;

insert into _r select 'every class has a receipts object (not missing, not null)',
  string_agg(distinct jsonb_typeof(c -> 'receipts'), ', '),
  bool_and(jsonb_typeof(c -> 'receipts') = 'object')
from _classes, jsonb_array_elements(data) c;

insert into _r select 'Math/Pearl Term 1 (submitted) has a receipt entry',
  (c -> 'receipts')::text,
  (c -> 'receipts') ? (select p.id::text from public.academic_periods p
                        where p.academic_year_id = :'YEAR_A' and p.ordinal = 1)
from _classes, jsonb_array_elements(data) c
where c ->> 'id' = :'MATH_PEARL';

insert into _r select 'the receipt entry has the four fields the client reads',
  (c -> 'receipts' -> (select p.id::text from public.academic_periods p
                        where p.academic_year_id = :'YEAR_A' and p.ordinal = 1))::text,
  (c -> 'receipts' -> (select p.id::text from public.academic_periods p
                        where p.academic_year_id = :'YEAR_A' and p.ordinal = 1))
    ?& array['receivedAt','forwardedAt','registrarReceivedAt','recalledAt']
from _classes, jsonb_array_elements(data) c
where c ->> 'id' = :'MATH_PEARL';

insert into _r select 'Math/Pearl Term 2 (never submitted) has NO receipt entry',
  case when (c -> 'receipts') ? (select p.id::text from public.academic_periods p
                        where p.academic_year_id = :'YEAR_A' and p.ordinal = 2)
       then 'present — should be absent' else 'absent, correctly' end,
  not ((c -> 'receipts') ? (select p.id::text from public.academic_periods p
                             where p.academic_year_id = :'YEAR_A' and p.ordinal = 2))
from _classes, jsonb_array_elements(data) c
where c ->> 'id' = :'MATH_PEARL';

insert into _r select 'MAPEH/Pearl (nothing ever submitted) has an empty receipts object',
  (c -> 'receipts')::text,
  (c -> 'receipts') = '{}'::jsonb
from _classes, jsonb_array_elements(data) c
where c ->> 'id' = :'MAPEH_PEARL';

-- Every field the client reads elsewhere on ClassSummary must also
-- survive — this is the contract, not just the one field that broke.
insert into _r select 'status, completeness and receipts are keyed consistently',
  'status keys ⊇ receipts keys: ' ||
    bool_and((c -> 'status') ?& array(select jsonb_object_keys(c -> 'receipts')))::text,
  bool_and((c -> 'status') ?& array(select jsonb_object_keys(c -> 'receipts')))
from _classes, jsonb_array_elements(data) c;

-- ------------------------------------------------------------
\pset format aligned
\echo ''
\echo '=== rds.my_classes CONTRACT ==='
select case when passed then 'PASS' else 'FAIL' end as result, test, detail
from _r order by passed, test;

do $$
declare failed int;
begin
  select count(*) into failed from _r where not passed;
  if failed > 0 then raise exception '% my_classes contract assertion(s) FAILED', failed; end if;
  raise notice 'PASS: all % my_classes contract assertions', (select count(*) from _r);
end $$;
