-- 0019 — Let a teacher configure their own assessments.
--
-- The gap this closes: assessments were only ever seeded. A teacher
-- opening Term 3 found an empty gradebook and no way to create the
-- columns, so the period could never be started at all. The legacy
-- system's Record Book "Setup" tab is exactly this screen, and it is
-- the first thing a teacher does each term.
--
-- Legacy shape (assets/js/main.js, `cd.hps[q]`):
--
--     hps: { ww: [10,10,15,…], pt: [40,30,50,…], qa: 60 }
--
-- Two fixed arrays capped at ten items, plus one scalar for the
-- quarterly assessment. That shape is NOT migrated:
--
--   • the ten-item cap is a UI limit encoded as a data structure;
--   • `qa` as a scalar cannot express DO 015 s.2026's Exams component,
--     which splits into ST1 / ST2 / Term Exam;
--   • `ww`/`pt`/`qa` are hard-coded component names, and the new schema
--     reads components from the grading scheme.
--
-- What IS migrated is the business rule underneath: a teacher decides,
-- per component per period, how many items there are and what each is
-- out of. Here that is rows in `assessments`, so the count is unbounded
-- and the components come from whichever scheme the class resolves.

create or replace function public.save_assessments(
  p_class_id uuid,
  p_period_id uuid,
  p_items jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_school   uuid;
  v_editable boolean;
  v_written  int := 0;
  v_removed  int := 0;
  v_kept     uuid[];
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'save_assessments expects an array' using errcode = '22023';
  end if;

  select cl.school_id into v_school from public.classes cl where cl.id = p_class_id;
  if v_school is null then
    raise exception 'class not found' using errcode = 'P0002';
  end if;

  -- Refuse outright once the period has left the teacher's hands.
  -- The assessments_write POLICY already carries this condition, so RLS
  -- would filter the rows anyway — but filtering is silent, and a
  -- teacher who reshapes a submitted record book and sees "saved" has
  -- been told something untrue. Fail loudly instead.
  v_editable := app.submission_is_editable(p_class_id, p_period_id);
  if not v_editable then
    raise exception 'this period has been submitted and can no longer be reconfigured'
      using errcode = '42501';
  end if;

  -- Upsert by NATURAL KEY (class, period, component, ordinal), and keep
  -- the surviving ids. This is the set that must exist when the call
  -- returns; anything else in this class+period was removed by the
  -- teacher.
  with incoming as (
    select
      nullif(x ->> 'id', '')::uuid            as id,
      (x ->> 'componentId')::uuid             as component_id,
      (x ->> 'ordinal')::int                  as ordinal,
      nullif(x ->> 'title', '')               as title,
      (x ->> 'highestPossibleScore')::numeric as hps
    from jsonb_array_elements(p_items) x
  ),
  upserted as (
    insert into public.assessments
      (id, school_id, class_id, academic_period_id, grade_component_id,
       ordinal, title, highest_possible_score, created_by)
    select
      coalesce(i.id, gen_random_uuid()), v_school, p_class_id, p_period_id,
      i.component_id, i.ordinal, i.title, i.hps, app.current_user_id()
    from incoming i
    on conflict (class_id, academic_period_id, grade_component_id, ordinal)
    do update set
      title                  = excluded.title,
      highest_possible_score = excluded.highest_possible_score,
      updated_at             = now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_kept from upserted;

  v_written := coalesce(array_length(v_kept, 1), 0);

  -- ⚠️ Deleting an assessment cascades to its scores. That is intended —
  -- an orphaned score would silently keep counting toward a grade whose
  -- column no longer exists — but it is unrecoverable, so an assessment
  -- that already carries marks may not be removed this way.
  --
  -- The keep-set is v_kept, NOT the ids in the payload. A newly created
  -- item has no id yet, so filtering on the payload alone deletes
  -- everything the same call just inserted. That was the first version
  -- of this function, and the probe caught it: written=2, removed=2,
  -- gradebook left with zero assessments.
  if exists (
    select 1
    from public.assessments a
    join public.assessment_scores s on s.assessment_id = a.id
    where a.class_id = p_class_id
      and a.academic_period_id = p_period_id
      and not (a.id = any (v_kept))
      and (s.raw_score is not null or s.is_excused)
  ) then
    raise exception 'cannot remove an assessment that already has scores; clear its marks first'
      using errcode = '23503';
  end if;

  with gone as (
    delete from public.assessments a
    where a.class_id = p_class_id
      and a.academic_period_id = p_period_id
      and not (a.id = any (v_kept))
    returning 1
  )
  select count(*) into v_removed from gone;

  perform app.write_audit(
    'assessments.configure', 'assessments', p_class_id,
    null,
    jsonb_build_object('periodId', p_period_id, 'written', v_written, 'removed', v_removed));

  return jsonb_build_object('written', v_written, 'removed', v_removed);
end;
$$;

comment on function public.save_assessments is
  'Replaces the assessment configuration for one class and period. '
  'Refuses once the period is no longer editable, and refuses to delete '
  'an assessment that already carries scores.';

grant execute on function public.save_assessments(uuid, uuid, jsonb)
  to authenticated, service_role;
revoke execute on function public.save_assessments(uuid, uuid, jsonb)
  from public, anon;
