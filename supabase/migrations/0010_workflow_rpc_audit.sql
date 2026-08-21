-- ============================================================
-- 0010 · Workflow RPCs and audit triggers
-- ============================================================
-- Every state transition is a server-side function that:
--   1. verifies the actor holds the required permission
--   2. verifies the transition is legal from the current state
--   3. performs the write
--   4. writes an audit row
-- A modified client cannot skip a step, because the steps are not in
-- the client.

-- ------------------------------------------------------------
-- Audit writer
-- ------------------------------------------------------------
create or replace function app.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old jsonb default null,
  p_new jsonb default null,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    school_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, reason
  ) values (
    app.current_school_id(), app.current_user_id(), p_action, p_entity_type,
    p_entity_id, p_old, p_new, p_reason
  );
end;
$$;

-- Generic row-level audit trigger for academic tables.
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_id  := (v_old ->> 'id')::uuid;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_id  := (v_new ->> 'id')::uuid;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id  := (v_new ->> 'id')::uuid;
    -- record only the fields that actually changed
    select jsonb_object_agg(key, value) into v_new
    from jsonb_each(to_jsonb(new))
    where to_jsonb(new) -> key is distinct from to_jsonb(old) -> key;
    if v_new is null or v_new = '{}'::jsonb then
      return coalesce(new, old);      -- nothing changed; do not log noise
    end if;
    select jsonb_object_agg(key, to_jsonb(old) -> key) into v_old
    from jsonb_each(v_new);
  end if;

  insert into public.audit_logs (
    school_id, actor_user_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    coalesce((to_jsonb(coalesce(new, old)) ->> 'school_id')::uuid, app.current_school_id()),
    app.current_user_id(),
    lower(tg_op), tg_table_name, v_id, v_old, v_new
  );

  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'students','enrollments','assessment_scores','period_grades',
    'final_subject_grades','grade_submissions','user_roles','generated_documents'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function app.audit_row_change()',
      t || '_audit', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Transition guard
-- ------------------------------------------------------------
create or replace function app.assert_transition(
  p_from text, p_to text
) returns void
language plpgsql
as $$
declare
  ok boolean := false;
begin
  ok := case
    when p_from = 'draft'     and p_to = 'submitted' then true
    when p_from = 'returned'  and p_to = 'submitted' then true
    when p_from = 'reopened'  and p_to = 'submitted' then true
    when p_from = 'submitted' and p_to in ('returned','approved') then true
    when p_from = 'approved'  and p_to in ('finalized','returned') then true
    when p_from = 'finalized' and p_to in ('published','reopened') then true
    when p_from = 'published' and p_to = 'reopened' then true
    else false
  end;

  if not ok then
    raise exception 'illegal transition: % -> %', p_from, p_to
      using errcode = '42501';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Submission validation gate
-- ------------------------------------------------------------
-- Hard errors block; soft warnings are returned for the client to
-- surface and the teacher to acknowledge. A system that refuses a
-- legitimately incomplete record — a learner absent for the term exam —
-- is a system teachers route around.
create or replace function public.validate_submission(
  p_class_id uuid,
  p_period_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_errors   jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_count    int;
begin
  if not app.teaches_class(p_class_id) and not app.has_permission('grades.read.all') then
    raise exception 'not authorised for this class' using errcode = '42501';
  end if;

  -- HARD: an assessment with no highest possible score cannot be graded.
  select count(*) into v_count from public.assessments
  where class_id = p_class_id and academic_period_id = p_period_id
    and (highest_possible_score is null or highest_possible_score <= 0);
  if v_count > 0 then
    v_errors := v_errors || jsonb_build_object(
      'code','assessment_without_hps',
      'message', v_count || ' assessment(s) have no maximum score set');
  end if;

  -- HARD: no assessments at all.
  select count(*) into v_count from public.assessments
  where class_id = p_class_id and academic_period_id = p_period_id;
  if v_count = 0 then
    v_errors := v_errors || jsonb_build_object(
      'code','no_assessments',
      'message','No assessments have been defined for this period');
  end if;

  -- SOFT: learners with no score at all this period.
  select count(*) into v_count
  from public.class_enrollments ce
  where ce.class_id = p_class_id and ce.status = 'active'
    and not exists (
      select 1 from public.assessment_scores s
      join public.assessments a on a.id = s.assessment_id
      where s.class_enrollment_id = ce.id
        and a.academic_period_id = p_period_id
        and (s.raw_score is not null or s.is_excused)
    );
  if v_count > 0 then
    v_warnings := v_warnings || jsonb_build_object(
      'code','students_without_scores',
      'message', v_count || ' learner(s) have no scores recorded this period');
  end if;

  -- SOFT: individual missing cells.
  select count(*) into v_count
  from public.class_enrollments ce
  cross join public.assessments a
  where ce.class_id = p_class_id and ce.status = 'active'
    and a.class_id = p_class_id and a.academic_period_id = p_period_id
    and not exists (
      select 1 from public.assessment_scores s
      where s.class_enrollment_id = ce.id and s.assessment_id = a.id
        and (s.raw_score is not null or s.is_excused)
    );
  if v_count > 0 then
    v_warnings := v_warnings || jsonb_build_object(
      'code','missing_scores', 'message', v_count || ' score(s) not yet entered');
  end if;

  return jsonb_build_object(
    'ok',        jsonb_array_length(v_errors) = 0,
    'errors',    v_errors,
    'warnings',  v_warnings
  );
end;
$$;

-- ------------------------------------------------------------
-- The transitions
-- ------------------------------------------------------------
create or replace function public.submit_grades(
  p_class_id uuid,
  p_period_id uuid,
  p_acknowledge_warnings boolean default false
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   public.grade_submissions;
  v_from  text;
  v_check jsonb;
begin
  if not app.teaches_class(p_class_id) or not app.has_permission('grades.submit') then
    raise exception 'not permitted to submit this class' using errcode = '42501';
  end if;

  v_check := public.validate_submission(p_class_id, p_period_id);
  if not (v_check ->> 'ok')::boolean then
    raise exception 'submission blocked: %', v_check ->> 'errors' using errcode = '23514';
  end if;
  if jsonb_array_length(v_check -> 'warnings') > 0 and not p_acknowledge_warnings then
    raise exception 'submission has warnings requiring acknowledgement: %',
      v_check -> 'warnings' using errcode = '23514';
  end if;

  insert into public.grade_submissions (school_id, class_id, academic_period_id, status)
  values (app.current_school_id(), p_class_id, p_period_id, 'draft')
  on conflict (class_id, academic_period_id) do nothing;

  select status into v_from from public.grade_submissions
  where class_id = p_class_id and academic_period_id = p_period_id;

  perform app.assert_transition(v_from, 'submitted');

  update public.grade_submissions
  set status = 'submitted', submitted_by = app.current_user_id(), submitted_at = now()
  where class_id = p_class_id and academic_period_id = p_period_id
  returning * into v_row;

  perform app.write_audit('grades.submit', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','submitted'));

  return v_row;
end;
$$;

create or replace function public.return_grades(
  p_submission_id uuid,
  p_reason text
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.has_permission('grades.return') then
    raise exception 'not permitted to return submissions' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a reason is required when returning a submission' using errcode = '23514';
  end if;

  select status into v_from from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found'; end if;

  perform app.assert_transition(v_from, 'returned');

  update public.grade_submissions
  set status = 'returned', returned_by = app.current_user_id(),
      returned_at = now(), return_reason = p_reason
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.return', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','returned'), p_reason);

  insert into public.notifications (school_id, recipient_user_id, type, title, body, link)
  select v_row.school_id, c.primary_teacher_id, 'submission_returned',
         'Grades returned for revision',
         'Your submission was returned. Open it to see the reason.',
         '/classes/' || c.id
  from public.classes c where c.id = v_row.class_id and c.primary_teacher_id is not null;

  return v_row;
end;
$$;

create or replace function public.approve_grades(p_submission_id uuid)
returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.has_permission('grades.approve') then
    raise exception 'not permitted to approve submissions' using errcode = '42501';
  end if;

  select status into v_from from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found'; end if;

  perform app.assert_transition(v_from, 'approved');

  update public.grade_submissions
  set status = 'approved', approved_by = app.current_user_id(), approved_at = now()
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.approve', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','approved'));
  return v_row;
end;
$$;

create or replace function public.finalize_grades(p_submission_id uuid)
returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.has_permission('grades.finalize') then
    raise exception 'not permitted to finalize' using errcode = '42501';
  end if;

  select status into v_from from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found'; end if;

  perform app.assert_transition(v_from, 'finalized');

  update public.grade_submissions
  set status = 'finalized', finalized_by = app.current_user_id(), finalized_at = now()
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.finalize', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','finalized'));
  return v_row;
end;
$$;

-- Publication is the privacy gate: a deliberate, separately permissioned,
-- audited act — never a side effect of any other action.
create or replace function public.publish_grades(p_submission_id uuid)
returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.has_permission('grades.publish') then
    raise exception 'not permitted to publish grades' using errcode = '42501';
  end if;

  select status into v_from from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found'; end if;

  perform app.assert_transition(v_from, 'published');

  update public.grade_submissions
  set status = 'published', published_by = app.current_user_id(), published_at = now()
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.publish', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','published'));

  -- Notify learners. The body never carries a grade value.
  insert into public.notifications (school_id, recipient_user_id, type, title, body, link)
  select v_row.school_id, s.portal_user_id, 'grades_published',
         'Your grades have been published',
         'New results are available in your portal.', '/portal/grades'
  from public.class_enrollments ce
  join public.enrollments e on e.id = ce.enrollment_id
  join public.students s    on s.id = e.student_id
  where ce.class_id = v_row.class_id and s.portal_user_id is not null;

  return v_row;
end;
$$;

-- Reopening reverts learner visibility and always requires a reason.
create or replace function public.reopen_grades(
  p_submission_id uuid,
  p_reason text
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.has_permission('grades.reopen') then
    raise exception 'not permitted to reopen finalized grades' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a reason is required when reopening a finalized record'
      using errcode = '23514';
  end if;

  select status into v_from from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found'; end if;

  perform app.assert_transition(v_from, 'reopened');

  update public.grade_submissions
  set status = 'reopened', reopened_by = app.current_user_id(),
      reopened_at = now(), reopen_reason = p_reason,
      published_at = null,          -- visibility reverts immediately
      version = version + 1
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.reopen', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','reopened'), p_reason);
  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- Roster auto-population
-- ------------------------------------------------------------
-- The highest-leverage function in the product: teachers never type a
-- student list, and it is the most visible "better than Excel" moment
-- in a demo.
create or replace function public.sync_class_roster(p_class_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_added int;
begin
  if not app.has_permission('enrollments.write') and not app.teaches_class(p_class_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  with cls as (
    select c.id, c.school_id, c.section_id from public.classes c where c.id = p_class_id
  ),
  ins as (
    insert into public.class_enrollments (school_id, class_id, enrollment_id)
    select cls.school_id, cls.id, e.id
    from cls
    join public.enrollments e
      on e.section_id = cls.section_id
     and e.status in ('enrolled','transferred_in')
    on conflict (class_id, enrollment_id) do nothing
    returning 1
  )
  select count(*) into v_added from ins;

  return v_added;
end;
$$;
