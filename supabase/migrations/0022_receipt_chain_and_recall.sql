-- 0022 — The chain of custody: recall, receipt, and hand-off.
--
-- Until now a submission went from the teacher straight to the
-- registrar, and once the teacher pressed Submit they had no way back
-- and no idea what had become of it. Both of those are real problems on
-- paper too, and the school solves them the same way every school does:
-- somebody signs for the record when they take it.
--
--   TEACHER submits
--        ↓                       teacher may still RECALL — nobody has it yet
--   ADVISER receives             ← signs for it; recall closes here
--        ↓
--   ADVISER forwards
--        ↓                       adviser may still recall the hand-off
--   REGISTRAR receives           ← signs for it
--        ↓
--   approved → finalized → published
--
-- Two ideas, kept distinct:
--
--   STATE      where the record is. One value, on the submission.
--   RECEIPT    who signed for it and when. Timestamps, never cleared,
--              so the audit survives a return-and-resubmit.
--
-- The states carry the workflow; the receipts carry the history.

-- =====================================================================
-- 1. THE NEW STATES
-- =====================================================================

alter table public.grade_submissions drop constraint if exists grade_submissions_status_check;
alter table public.grade_submissions add constraint grade_submissions_status_check
  check (status in (
    'draft', 'submitted',
    'received',            -- the adviser has signed for it
    'forwarded',           -- the adviser has passed it to the registrar
    'registrar_received',  -- the registrar has signed for it
    'returned', 'approved', 'finalized', 'published', 'reopened'
  ));

alter table public.grade_submissions
  add column if not exists received_by     uuid references public.users(id),
  add column if not exists received_at     timestamptz,
  add column if not exists forwarded_by    uuid references public.users(id),
  add column if not exists forwarded_at    timestamptz,
  add column if not exists registrar_received_by uuid references public.users(id),
  add column if not exists registrar_received_at timestamptz,
  add column if not exists recalled_by     uuid references public.users(id),
  add column if not exists recalled_at     timestamptz,
  add column if not exists recall_reason   text;

comment on column public.grade_submissions.received_at is
  'When the class adviser signed for this submission. NEVER cleared on a '
  'later return or resubmission — it is the record that a hand-off '
  'happened, not a flag for the current state.';
comment on column public.grade_submissions.recalled_at is
  'The last time the teacher pulled a submission back. Only possible '
  'while nobody had received it.';

-- =====================================================================
-- 2. WHO ADVISES THIS CLASS
-- =====================================================================
--
-- SECURITY DEFINER so the predicate can read `sections` without the
-- caller needing a policy that would let them enumerate it — the same
-- pattern the other predicate helpers use to avoid RLS recursion.

create or replace function app.advises_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.classes cl
    join public.sections sec on sec.id = cl.section_id
    where cl.id = p_class_id
      and sec.adviser_user_id = app.current_user_id()
      and cl.school_id = app.current_school_id()
  )
$$;

comment on function app.advises_class is
  'True when the caller is the adviser of the section this class belongs to.';

/**
 * May the caller sign for this submission on the adviser's behalf?
 *
 * The adviser of the section, always. Plus anyone holding
 * grades.receive — which the registrar and school admin do.
 *
 * That fallback is deliberate and it is the reason a strict chain is
 * safe to run. A section whose adviser_user_id is null, or whose adviser
 * has left, would otherwise strand every submission in that section
 * with no one able to advance it. The chain still passes through the
 * receive step; it simply cannot deadlock.
 */
create or replace function app.may_receive_for_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.advises_class(p_class_id) or app.has_permission('grades.receive')
$$;

insert into public.permissions (code, category, description)
values ('grades.receive', 'grades',
        'Sign for a submitted class record on behalf of the adviser')
on conflict (code) do nothing;

-- The adviser gets it because it is their job. The registrar and school
-- admin get it as the fallback above, not because they are advisers.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'grades.receive'
from public.roles r
where r.code in ('adviser', 'registrar', 'school_admin')
on conflict do nothing;

-- =====================================================================
-- 3. THE STATE MACHINE
-- =====================================================================

create or replace function app.assert_transition(
  p_from text, p_to text
) returns void
language plpgsql
as $$
declare
  ok boolean := false;
begin
  ok := case
    -- into the adviser's hands
    when p_from = 'draft'     and p_to = 'submitted' then true
    when p_from = 'returned'  and p_to = 'submitted' then true
    when p_from = 'reopened'  and p_to = 'submitted' then true

    -- RECALL. The teacher changed their mind before anyone signed for
    -- it. Allowed only from 'submitted', which is precisely the window
    -- in which no one has taken responsibility for the record.
    when p_from = 'submitted' and p_to = 'draft' then true

    -- the adviser's leg
    when p_from = 'submitted' and p_to in ('received','returned') then true
    when p_from = 'received'  and p_to in ('forwarded','returned') then true
    -- the adviser un-forwards, while the registrar has not signed yet
    when p_from = 'forwarded' and p_to in ('received','registrar_received','returned') then true

    -- the registrar's leg
    when p_from = 'registrar_received' and p_to in ('approved','returned') then true
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

-- =====================================================================
-- 4. EDITABILITY
-- =====================================================================
--
-- Unchanged in effect, restated because three new statuses exist and
-- none of them may be editable: once somebody has signed for a record,
-- the way to change it is to have it returned, not to edit underneath
-- the person holding it.

create or replace function app.submission_is_editable(p_class_id uuid, p_period_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select status in ('draft','returned','reopened')
     from public.grade_submissions
     where class_id = p_class_id and academic_period_id = p_period_id),
    true      -- no submission row yet = draft = editable
  )
$$;

-- =====================================================================
-- 5. THE TRANSITIONS
-- =====================================================================

/**
 * RECALL — the teacher takes it back.
 *
 * Deliberately not called "unsubmit": what makes it safe is not that it
 * undoes a click but that nobody has yet signed for the record. Once the
 * adviser has, this refuses and the teacher must ask for a return —
 * which is a different act, with a reason attached, visible to both.
 */
create or replace function public.recall_grades(
  p_class_id  uuid,
  p_period_id uuid,
  p_reason    text default null
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.teaches_class(p_class_id) or not app.has_permission('grades.submit') then
    raise exception 'not permitted to recall this class' using errcode = '42501';
  end if;

  select status into v_from from public.grade_submissions
  where class_id = p_class_id and academic_period_id = p_period_id
    and school_id = app.current_school_id();
  if v_from is null then
    raise exception 'this period has not been submitted' using errcode = 'P0002';
  end if;

  -- The message matters. "Illegal transition: received -> draft" tells a
  -- teacher nothing; this tells them exactly who to ask.
  if v_from <> 'submitted' then
    raise exception
      'this period is already with the % and can no longer be recalled; ask for it to be returned instead',
      case v_from
        when 'received' then 'class adviser'
        when 'forwarded' then 'registrar'
        when 'registrar_received' then 'registrar'
        else v_from
      end
      using errcode = '42501';
  end if;

  perform app.assert_transition(v_from, 'draft');

  update public.grade_submissions
  set status = 'draft',
      recalled_by = app.current_user_id(), recalled_at = now(),
      recall_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      submitted_by = null, submitted_at = null
  where class_id = p_class_id and academic_period_id = p_period_id
  returning * into v_row;

  perform app.write_audit('grades.recall', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','draft'), p_reason);

  return v_row;
end;
$$;

/** RECEIVE — the class adviser signs for it. */
create or replace function public.receive_grades(
  p_submission_id uuid
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text; v_class uuid;
begin
  select status, class_id into v_from, v_class
  from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found' using errcode = 'P0002'; end if;

  if not app.may_receive_for_class(v_class) then
    raise exception 'only this section''s adviser can receive these grades'
      using errcode = '42501';
  end if;

  perform app.assert_transition(v_from, 'received');

  update public.grade_submissions
  set status = 'received',
      received_by = app.current_user_id(), received_at = now()
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.receive', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','received'));

  -- Tell the teacher. The whole point of the receipt is that they stop
  -- wondering.
  insert into public.notifications (school_id, recipient_user_id, type, title, body, link)
  select v_row.school_id, c.primary_teacher_id, 'submission_received',
         'Your grades were received',
         'The class adviser has received your submission. It can no longer be recalled.',
         '/classes/' || c.id
  from public.classes c where c.id = v_row.class_id and c.primary_teacher_id is not null;

  return v_row;
end;
$$;

/** FORWARD — the adviser passes the section's record to the registrar. */
create or replace function public.forward_grades(
  p_submission_id uuid
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text; v_class uuid;
begin
  select status, class_id into v_from, v_class
  from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found' using errcode = 'P0002'; end if;

  if not app.may_receive_for_class(v_class) then
    raise exception 'only this section''s adviser can forward these grades'
      using errcode = '42501';
  end if;

  perform app.assert_transition(v_from, 'forwarded');

  update public.grade_submissions
  set status = 'forwarded',
      forwarded_by = app.current_user_id(), forwarded_at = now()
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.forward', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','forwarded'));

  return v_row;
end;
$$;

/**
 * UNFORWARD — the adviser pulls the hand-off back.
 *
 * The adviser's equivalent of the teacher's recall, and gated the same
 * way: only while the registrar has not signed for it.
 */
create or replace function public.unforward_grades(
  p_submission_id uuid
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text; v_class uuid;
begin
  select status, class_id into v_from, v_class
  from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found' using errcode = 'P0002'; end if;

  if not app.may_receive_for_class(v_class) then
    raise exception 'only this section''s adviser can withdraw this hand-off'
      using errcode = '42501';
  end if;
  if v_from <> 'forwarded' then
    raise exception 'the registrar has already received this; ask for it to be returned instead'
      using errcode = '42501';
  end if;

  perform app.assert_transition(v_from, 'received');

  update public.grade_submissions
  set status = 'received', forwarded_by = null, forwarded_at = null
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.unforward', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','received'));

  return v_row;
end;
$$;

/** REGISTRAR RECEIVES — signs for it, before reviewing it. */
create or replace function public.registrar_receive_grades(
  p_submission_id uuid
) returns public.grade_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.grade_submissions; v_from text;
begin
  if not app.has_permission('grades.approve') then
    raise exception 'not permitted to receive submissions' using errcode = '42501';
  end if;

  select status into v_from from public.grade_submissions
  where id = p_submission_id and school_id = app.current_school_id();
  if v_from is null then raise exception 'submission not found' using errcode = 'P0002'; end if;

  -- "illegal transition: received -> registrar_received" is true and
  -- useless. Say which desk the record is still sitting on.
  if v_from <> 'forwarded' then
    raise exception
      'this record has not been forwarded yet — it is still %',
      case v_from
        when 'draft'     then 'being entered by the teacher'
        when 'submitted' then 'waiting for the class adviser to receive it'
        when 'received'  then 'with the class adviser, who has not forwarded it'
        else 'at ' || v_from
      end
      using errcode = '42501';
  end if;

  perform app.assert_transition(v_from, 'registrar_received');

  update public.grade_submissions
  set status = 'registrar_received',
      registrar_received_by = app.current_user_id(), registrar_received_at = now()
  where id = p_submission_id
  returning * into v_row;

  perform app.write_audit('grades.registrar_receive', 'grade_submissions', v_row.id,
    jsonb_build_object('status', v_from), jsonb_build_object('status','registrar_received'));

  -- Tell the adviser their hand-off landed.
  insert into public.notifications (school_id, recipient_user_id, type, title, body, link)
  select v_row.school_id, sec.adviser_user_id, 'submission_registrar_received',
         'The registrar received your section''s grades',
         'The registrar has signed for the record you forwarded.',
         '/classes/' || cl.id
  from public.classes cl
  join public.sections sec on sec.id = cl.section_id
  where cl.id = v_row.class_id and sec.adviser_user_id is not null;

  return v_row;
end;
$$;

grant execute on function
  public.recall_grades(uuid, uuid, text),
  public.receive_grades(uuid),
  public.forward_grades(uuid),
  public.unforward_grades(uuid),
  public.registrar_receive_grades(uuid)
  to authenticated;
revoke execute on function
  public.recall_grades(uuid, uuid, text),
  public.receive_grades(uuid),
  public.forward_grades(uuid),
  public.unforward_grades(uuid),
  public.registrar_receive_grades(uuid)
  from public, anon;

-- =====================================================================
-- 6. WHAT THE ADVISER CAN SEE
-- =====================================================================
--
-- Today an adviser reads only the classes they TEACH. To sign for their
-- section's records they must also be able to see them, so two policies
-- keyed on app.advises_class.
--
-- Deliberately narrow: the class and its submission, not the marks
-- inside it. Signing for a record is acknowledging that it arrived, and
-- that does not require reading every learner's score.
--
-- ⚠️ A REAL GAP REMAINS, and it is not closed here. The `adviser` role
-- holds `grades.read.section`, and NO policy anywhere consults it — so
-- an adviser cannot yet read the grades for their own section, which is
-- what they need to consolidate a report card. Widening grade visibility
-- is a security decision in its own right and should not ride along with
-- a workflow change. Tracked separately.

create policy classes_read_adviser on public.classes
  for select to authenticated
  using (school_id = app.current_school_id() and app.advises_class(id));

create policy submissions_read_adviser on public.grade_submissions
  for select to authenticated
  using (school_id = app.current_school_id() and app.advises_class(class_id));

-- =====================================================================
-- 7. THE TWO QUEUES
-- =====================================================================
--
-- Strict chain, so the registrar's queue must not show work that has not
-- reached them. `draft`, `submitted` and `received` belong to the
-- teacher and the adviser; everything from `forwarded` onward is the
-- registrar's, including what they have already returned or published,
-- because they need to see their own history.

create or replace function rds.submission_queue(p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(q order by q ->> 'forwardedAt' desc nulls last,
                            q ->> 'gradeLevel', q ->> 'section'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'submissionId', gs.id,
      'classId',      cl.id,
      'periodId',     p.id,
      'periodName',   p.name,
      'gradeLevel',   gl.name,
      'section',      sec.name,
      'subject',      sub.title,
      'teacher',      nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''),
      'status',       gs.status,
      'submittedAt',  gs.submitted_at,
      'receivedAt',   gs.received_at,
      'forwardedAt',  gs.forwarded_at,
      'registrarReceivedAt', gs.registrar_received_at,
      'returnedAt',   gs.returned_at,
      'returnReason', gs.return_reason,
      'studentCount', (select count(*) from public.class_enrollments ce
                       where ce.class_id = cl.id and ce.status = 'active'),
      'completeness', (
        select jsonb_build_object('scored', coalesce(x.scored,0), 'total', coalesce(x.total,0))
        from (
          select count(*) filter (where s.raw_score is not null or s.is_excused) as scored,
                 count(*) as total
          from public.class_enrollments ce
          cross join public.assessments a
          left join public.assessment_scores s
            on s.assessment_id = a.id and s.class_enrollment_id = ce.id
          where ce.class_id = cl.id and ce.status = 'active'
            and a.class_id = cl.id and a.academic_period_id = p.id
        ) x
      )
    ) as q
    from public.grade_submissions gs
    join public.classes cl        on cl.id = gs.class_id
    join public.academic_periods p on p.id = gs.academic_period_id
    join public.sections sec      on sec.id = cl.section_id
    join public.grade_levels gl   on gl.id = sec.grade_level_id
    join public.subjects sub      on sub.id = cl.subject_id
    left join public.users u      on u.id = cl.primary_teacher_id
    where cl.academic_year_id = p_year_id
      and gs.status not in ('draft', 'submitted', 'received')
  ) t
$$;

/**
 * The adviser's queue: every class in the sections they advise.
 *
 * Carries no marks and no completeness figure — an adviser cannot read
 * another teacher's scores (see the gap noted above), and a count
 * silently returning 0 would read as "nothing entered" rather than
 * "not visible to you", which is worse than omitting it.
 */
create or replace function rds.adviser_queue(p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(q order by q ->> 'submittedAt' desc nulls last,
                            q ->> 'section', q ->> 'subject'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'submissionId', gs.id,
      'classId',      cl.id,
      'periodId',     p.id,
      'periodName',   p.name,
      'gradeLevel',   gl.name,
      'section',      sec.name,
      'subject',      sub.title,
      'teacher',      nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''),
      'status',       gs.status,
      'submittedAt',  gs.submitted_at,
      'receivedAt',   gs.received_at,
      'forwardedAt',  gs.forwarded_at,
      'registrarReceivedAt', gs.registrar_received_at,
      'returnedAt',   gs.returned_at,
      'returnReason', gs.return_reason
    ) as q
    from public.grade_submissions gs
    join public.classes cl         on cl.id = gs.class_id
    join public.academic_periods p on p.id = gs.academic_period_id
    join public.sections sec       on sec.id = cl.section_id
    join public.grade_levels gl    on gl.id = sec.grade_level_id
    join public.subjects sub       on sub.id = cl.subject_id
    left join public.users u       on u.id = cl.primary_teacher_id
    where cl.academic_year_id = p_year_id
      and gs.status <> 'draft'
  ) t
$$;

create or replace function public.adviser_queue(p_year_id uuid)
returns jsonb language sql stable
set search_path = public, pg_temp
as $$ select rds.adviser_queue(p_year_id) $$;

grant execute on function rds.adviser_queue(uuid), public.adviser_queue(uuid)
  to authenticated, service_role;
revoke execute on function rds.adviser_queue(uuid), public.adviser_queue(uuid)
  from public, anon;
