-- 05 — Schedule security, and tenant isolation for every staff role.
--
-- The student schedule (migration 0043) takes no parameter: the learner
-- comes from the verified JWT. This suite proves that holds at the
-- DATABASE, not just in the screen — a learner sees their own classes
-- and literally cannot read anyone else's rows.
--
-- ⚠️ Identity lookups here run as SUPERUSER on purpose. Reading
-- `public.users` while holding a student's claims returns nothing (RLS,
-- correctly), so a lookup made under the wrong identity silently
-- returns no rows and the loop tests nothing. The first run of this
-- suite printed no role rows at all, which is what gave it away.
\pset tuples_only on
\pset format unaligned
begin;
do $$
declare
  ok text := '  PASS  '; bad text := '  FAIL  ';
  v_a uuid; v_b uuid; v_n int; v_u uuid; v_res jsonb; v_st uuid;
  v_role text;
  v_foreign_enr uuid; v_foreign_sec uuid;
begin
  select id into v_a from public.schools where code='anhs';
  select id into v_b from public.schools where code<>'anhs' limit 1;

  raise notice '── SCHEDULE SECURITY ──────────────────────────────────────';

  -- a learner with a portal account, from the seed
  select st.id, st.portal_user_id into v_st, v_u
    from public.students st
   where st.school_id=v_a and st.portal_user_id is not null limit 1;
  -- (still superuser here, so this sees the seed)

  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_a,'sub',v_u)::text, true);
  set local role authenticated;

  v_res := public.my_schedule();
  raise notice '% 1. a learner gets a schedule with no id passed -> % class(es)',
    case when v_res is not null then ok else bad end,
    jsonb_array_length(v_res->'classes');

  -- every class on it is one of THEIR class enrolments
  select count(*) into v_n from jsonb_array_elements(v_res->'classes') x
   where (x->>'classId')::uuid not in (
     select ce.class_id from public.class_enrollments ce
      join public.enrollments e on e.id=ce.enrollment_id
     where e.student_id = v_st);
  raise notice '% 2. and nothing on it belongs to another learner -> % foreign',
    case when v_n=0 then ok else bad end, v_n;

  -- the learner cannot reach another learner's class enrolments AT ALL
  select count(*) into v_n from public.class_enrollments ce
    join public.enrollments e on e.id = ce.enrollment_id
   where e.student_id <> v_st;
  raise notice '% 3. RLS hides every other learner''s class membership -> % visible',
    case when v_n=0 then ok else bad end, v_n;

  -- and cannot see another learner at all
  select count(*) into v_n from public.students where id <> v_st;
  raise notice '% 4. and every other learner record -> % visible',
    case when v_n=0 then ok else bad end, v_n;

  -- unpublished grades stay hidden
  select count(*) into v_n from public.period_grades pg
   where not exists (
     select 1 from public.grade_submissions gs
      where gs.class_id = (select ce.class_id from public.class_enrollments ce
                            where ce.id = pg.class_enrollment_id)
        and gs.status='published' and gs.published_at is not null);
  raise notice '% 5. unpublished period grades are invisible -> % visible',
    case when v_n=0 then ok else bad end, v_n;

  raise notice '── TENANT ISOLATION, ALL FOUR ROLES ───────────────────────';

  for v_role in select unnest(array['school_admin','registrar','teacher','adviser']) loop
    -- ⚠️ Look the user up as SUPERUSER. Under `set role authenticated`
    -- with a student's claims, public.users is invisible to RLS — the
    -- lookup returned nothing, v_u kept its previous value, and the
    -- loop silently tested the wrong identity. The first run of this
    -- suite printed no rows at all, which is what gave it away.
    set local role postgres;
    v_u := null;
    select u.id into v_u from public.users u
      join public.user_roles ur on ur.user_id=u.id
      join public.roles r on r.id=ur.role_id
     where u.school_id=v_a and r.code=v_role limit 1;
    set local role authenticated;
    continue when v_u is null;

    perform set_config('request.jwt.claims',
      jsonb_build_object('school_id',v_a,'sub',v_u)::text, true);

    select (select count(*) from public.students  where school_id=v_b)
         + (select count(*) from public.enrollments where school_id=v_b)
         + (select count(*) from public.classes     where school_id=v_b)
         + (select count(*) from public.period_grades where school_id=v_b)
         + (select count(*) from public.enrollment_events where school_id=v_b)
      into v_n;
    raise notice '% 6.% a School A % sees % School B row(s)',
      case when v_n=0 then ok else bad end, v_role, v_role, v_n;
  end loop;

  -- a School A registrar cannot MODIFY School B
  set local role postgres;
  select u.id into v_u from public.users u
    join public.user_roles ur on ur.user_id=u.id
    join public.roles r on r.id=ur.role_id
   where u.school_id=v_a and r.code='registrar' limit 1;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id',v_a,'sub',v_u)::text, true);
  -- Resolve the School B ids as SUPERUSER first. Reading them as the
  -- School A registrar returns nothing — which is itself correct, but
  -- it would make this pass on "a section is required" rather than on
  -- tenancy. Hand the function the real foreign ids and make it refuse
  -- them explicitly.
  set local role postgres;
  select e.id into v_foreign_enr from public.enrollments e where e.school_id=v_b limit 1;
  select s.id into v_foreign_sec from public.sections s where s.school_id=v_b limit 1;
  set local role authenticated;

  begin
    perform public.transfer_student_section(
      v_foreign_enr, v_foreign_sec, current_date, 'cross-tenant attempt');
    raise notice '% 7. a School A registrar MOVED a School B learner', bad;
  exception when others then
    raise notice '% 7. a School A registrar cannot transfer a School B learner -> %',
      ok, sqlerrm;
  end;

  begin
    perform public.withdraw_student(v_foreign_enr, 'dropped', current_date, 'x');
    raise notice '% 7b. a School A registrar WITHDREW a School B learner', bad;
  exception when others then
    raise notice '% 7b. nor withdraw one -> %', ok, sqlerrm;
  end;

  begin
    perform public.link_student_portal_account(
      (select st.id from public.students st where st.school_id=v_b limit 1), v_u);
    raise notice '% 7c. a School A registrar linked a School B learner', bad;
  exception when others then
    raise notice '% 7c. nor give one a portal account -> %', ok, sqlerrm;
  end;

  raise notice '── SCHEDULE, NON-STUDENT ROLES ────────────────────────────';
  -- staff have no student identity, so my_schedule resolves to nobody
  v_res := public.my_schedule();
  raise notice '% 8. staff calling my_schedule get no learner''s timetable -> %',
    case when (v_res->'enrollment') is null or v_res->'enrollment' = 'null'::jsonb
         then ok else bad end,
    coalesce(v_res->>'enrollment','null');

  raise notice '% 9. and no classes -> %',
    case when jsonb_array_length(v_res->'classes')=0 then ok else bad end,
    jsonb_array_length(v_res->'classes');

  -- anon cannot execute it at all
  raise notice '% 10. anon has no EXECUTE on my_schedule -> %',
    case when not has_function_privilege('anon','public.my_schedule()','execute')
         then ok else bad end,
    has_function_privilege('anon','public.my_schedule()','execute');
end $$;
rollback;
