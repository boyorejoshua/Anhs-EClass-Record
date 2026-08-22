-- 0020 — Make the period grade an authoritative, persisted record.
--
-- Until now `period_grades` existed and was empty: 0 rows. Summary,
-- Analytics, LOA and the gradebook all computed in the browser, and the
-- student portal had no number to show even after publication. The chain
--
--   TEACHER ENCODES → SYSTEM CALCULATES → SUBMITS → … → STUDENT SEES
--
-- was missing its middle step as a stored fact.
--
-- This migration does the DATABASE half. The calculation itself stays in
-- the one canonical TypeScript engine and is invoked from an Edge
-- Function — deliberately NOT reimplemented in PL/pgSQL. A grading
-- engine that exists twice is a grading engine that will eventually
-- disagree with itself, and docs/07 rules it out for exactly that
-- reason.

-- =====================================================================
-- 1. COLUMNS THE AUTHORITATIVE RECORD WAS MISSING
-- =====================================================================
--
-- Everything else the brief asks for is already reachable and already
-- normalised, so it is NOT duplicated here:
--
--   student, class, subject, academic year
--        → class_enrollment_id → class_enrollments → enrollment/class
--   approved / finalized / published, and by whom
--        → grade_submissions, at class+period grain
--
-- Copying the workflow timestamps onto every learner row would create a
-- second, per-learner publication state that could disagree with the
-- submission's. The brief warns about exactly that confusion; one
-- publication fact per class+period is the correct grain.

alter table public.period_grades
  add column if not exists descriptor     text,
  add column if not exists remark         text,
  add column if not exists passed         boolean,
  -- Provenance. When a grade is questioned two years from now, the
  -- answer has to include which code produced it.
  add column if not exists engine_version text,
  add column if not exists computed_mode  text
    check (computed_mode in ('running', 'final'));

comment on column public.period_grades.scheme_snapshot is
  'The grading scheme AS IT WAS when this grade was computed. A scheme '
  'edited later must not silently restate a grade already issued.';
comment on column public.period_grades.computed_mode is
  'running = unscored assessments excluded (mid-term preview). '
  'final   = unscored assessments count as zero. Submission uses final.';

-- =====================================================================
-- 2. THE PERSISTENCE PATH
-- =====================================================================
--
-- One entry point, callable only by service_role — which in practice
-- means only the Edge Function. Not exposed to `authenticated` at all:
-- a teacher must never be able to hand the database a grade. They hand
-- it SCORES; the server derives the grade.
--
-- Versioning, not overwriting. docs/06 requires academic history to be
-- append-only, so a recomputation supersedes rather than mutates.

create or replace function public.record_period_grades(
  p_class_id  uuid,
  p_period_id uuid,
  p_rows      jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school     uuid;
  v_inserted   int := 0;
  v_unchanged  int := 0;
  v_superseded int := 0;
  r            record;
  v_cur        record;
  v_same       boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'record_period_grades expects an array' using errcode = '22023';
  end if;

  select cl.school_id into v_school from public.classes cl where cl.id = p_class_id;
  if v_school is null then
    raise exception 'class not found' using errcode = 'P0002';
  end if;

  for r in
    select
      (x ->> 'classEnrollmentId')::uuid   as ce_id,
      (x ->> 'initialGrade')::numeric     as initial_grade,
      (x ->> 'periodGrade')::numeric      as period_grade,
      nullif(x ->> 'descriptor', '')      as descriptor,
      nullif(x ->> 'remark', '')          as remark,
      (x ->> 'passed')::boolean           as passed,
      x -> 'componentBreakdown'           as component_breakdown,
      x -> 'schemeSnapshot'               as scheme_snapshot,
      nullif(x ->> 'engineVersion', '')   as engine_version,
      coalesce(nullif(x ->> 'computedMode', ''), 'final') as computed_mode
    from jsonb_array_elements(p_rows) x
  loop
    -- The learner must actually be in this class. Without this a caller
    -- with the service key could write a grade for any enrolment in the
    -- database by passing someone else's id.
    if not exists (
      select 1 from public.class_enrollments ce
      where ce.id = r.ce_id and ce.class_id = p_class_id
    ) then
      raise exception 'class enrolment % does not belong to class %', r.ce_id, p_class_id
        using errcode = '23503';
    end if;

    select * into v_cur
    from public.period_grades pg
    where pg.class_enrollment_id = r.ce_id
      and pg.academic_period_id = p_period_id
      and pg.is_current;

    -- IDEMPOTENCY. Recomputing an unchanged grade must be a no-op, not a
    -- new version — otherwise a registrar refreshing the queue would
    -- grow the history of every learner in the class.
    v_same := v_cur.id is not null
      and v_cur.initial_grade is not distinct from r.initial_grade
      and v_cur.period_grade  is not distinct from r.period_grade
      and v_cur.descriptor    is not distinct from r.descriptor
      and v_cur.remark        is not distinct from r.remark
      and v_cur.passed        is not distinct from r.passed
      and v_cur.computed_mode is not distinct from r.computed_mode;

    if v_same then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    if v_cur.id is not null then
      update public.period_grades set is_current = false where id = v_cur.id;
      v_superseded := v_superseded + 1;
    end if;

    insert into public.period_grades (
      school_id, class_enrollment_id, academic_period_id,
      component_breakdown, initial_grade, period_grade,
      descriptor, remark, passed,
      scheme_snapshot, engine_version, computed_mode,
      version, is_current, computed_at, computed_by
    ) values (
      v_school, r.ce_id, p_period_id,
      r.component_breakdown, r.initial_grade, r.period_grade,
      r.descriptor, r.remark, r.passed,
      coalesce(r.scheme_snapshot, '{}'::jsonb), r.engine_version, r.computed_mode,
      coalesce(v_cur.version, 0) + 1, true, now(), app.current_user_id()
    );
    v_inserted := v_inserted + 1;
  end loop;

  perform app.write_audit(
    'grades.compute', 'period_grades', p_class_id, null,
    jsonb_build_object(
      'periodId', p_period_id, 'inserted', v_inserted,
      'unchanged', v_unchanged, 'superseded', v_superseded));

  return jsonb_build_object(
    'inserted', v_inserted, 'unchanged', v_unchanged, 'superseded', v_superseded);
end;
$$;

comment on function public.record_period_grades is
  'Persists computed period grades for one class and period. service_role '
  'only — the Edge Function is the sole writer. Idempotent: an unchanged '
  'grade is a no-op; a changed one supersedes rather than overwrites.';

-- =====================================================================
-- 3. WHO MAY WRITE A GRADE
-- =====================================================================
--
-- ⚠️ Both grade tables carried Supabase's project-default blanket grant:
--
--   authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, …
--   anon:          SELECT, INSERT, UPDATE, DELETE, TRUNCATE, …
--
-- Nothing was exploitable — FORCE RLS is on and there is no INSERT or
-- UPDATE policy, so every write already failed. But the only thing
-- standing between a signed-in teacher and rewriting their own grades
-- was the ABSENCE of a policy. Adding one carelessly later would open
-- it silently. Remove the grant so the privilege has to be granted on
-- purpose, not merely left un-denied.
--
-- SELECT is untouched: the read policies are the intended control.

revoke insert, update, delete, truncate
  on public.period_grades, public.final_subject_grades
  from authenticated, anon;

grant execute on function public.record_period_grades(uuid, uuid, jsonb) to service_role;
revoke execute on function public.record_period_grades(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- =====================================================================
-- 4. READING THE AUTHORITATIVE GRADE
-- =====================================================================
--
-- One contract the whole app reads from, so Summary, Analytics, the
-- registrar's review and the student portal cannot disagree.

create or replace function rds.period_grades(p_class_id uuid, p_period_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(ce_id, payload), '{}'::jsonb)
  from (
    select pg.class_enrollment_id::text as ce_id,
           jsonb_build_object(
             'initialGrade', pg.initial_grade,
             'periodGrade',  pg.period_grade,
             'descriptor',   pg.descriptor,
             'remark',       pg.remark,
             'passed',       pg.passed,
             'computedAt',   pg.computed_at,
             'computedMode', pg.computed_mode,
             'version',      pg.version,
             'componentBreakdown', pg.component_breakdown
           ) as payload
    from public.period_grades pg
    join public.class_enrollments ce on ce.id = pg.class_enrollment_id
    where ce.class_id = p_class_id
      and pg.academic_period_id = p_period_id
      and pg.is_current
  ) t
$$;

create or replace function public.period_grades_for(p_class_id uuid, p_period_id uuid)
returns jsonb language sql stable
set search_path = public, pg_temp
as $$ select rds.period_grades(p_class_id, p_period_id) $$;

grant execute on function rds.period_grades(uuid, uuid),
                         public.period_grades_for(uuid, uuid)
  to authenticated, service_role;
revoke execute on function rds.period_grades(uuid, uuid),
                          public.period_grades_for(uuid, uuid)
  from public, anon;

-- =====================================================================
-- 5. FINALIZED MEANS FINALIZED — ENFORCED IN THE DATABASE
-- =====================================================================
--
-- The brief is explicit that this must not rest on a disabled button.
-- Two layers already exist, and this adds the third:
--
--   1. assessment_scores write policy requires app.submission_is_editable
--   2. save_assessments refuses a non-editable period outright
--   3. ← this: even the service role cannot supersede a grade whose
--      submission has been finalized or published, except through the
--      reopen_grades transition, which is audited.
--
-- Written as a trigger rather than a policy because service_role
-- bypasses RLS. A rule that the privileged writer can ignore is not a
-- rule.

create or replace function app.reject_write_to_finalized_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select gs.status into v_status
  from public.class_enrollments ce
  join public.grade_submissions gs
    on gs.class_id = ce.class_id
   and gs.academic_period_id = coalesce(new.academic_period_id, old.academic_period_id)
  where ce.id = coalesce(new.class_enrollment_id, old.class_enrollment_id);

  if v_status in ('finalized', 'published') then
    raise exception
      'this period is % and its grades cannot be changed; reopen it first', v_status
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger period_grades_finalized_guard
  before insert or update or delete on public.period_grades
  for each row execute function app.reject_write_to_finalized_period();

comment on function app.reject_write_to_finalized_period is
  'Refuses any change to a period grade once its submission is finalized '
  'or published. Applies to service_role too, which RLS does not.';
