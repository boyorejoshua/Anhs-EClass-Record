-- 0042 — Giving a learner a way in.
--
-- The Phase 0 audit found the student portal's read path correct and
-- safe — no student id is accepted from a client anywhere, and the
-- publication gate lives in RLS rather than in application code — and
-- then found that NOBODY CAN GET AN ACCOUNT.
--
-- `students.portal_user_id` has been the link between a learner and a
-- login since migration 0005. Nothing in the product sets it. The
-- `manage-users` Edge Function creates staff accounts; the Users screen
-- offers staff roles; no RPC exists. On production, two of eight
-- learners have an account and both came from seed data.
--
-- So an entire ROLE is unreachable. That is the same defect this build
-- has now recorded five times — a message, a menu or a permission that
-- promises something the product cannot do — one level larger.
--
-- ── WHY THE LINK IS A DATABASE FUNCTION AND NOT EDGE-FUNCTION CODE ────
--
-- Minting an auth identity needs service_role and must happen in the
-- Edge Function. Deciding WHETHER this person may be linked to that
-- learner is a business rule, and business rules belong where the data
-- is. So `manage-users` creates the identity with service_role and then
-- calls this function THROUGH THE CALLER'S OWN JWT, which means:
--
--   · `students.write` is checked by the permission catalogue, not by
--     a second opinion written in TypeScript; and
--   · the tenant comes from the caller's verified token on both sides.
--
-- ── ONE LEARNER, ONE LOGIN, BOTH WAYS ─────────────────────────────────
--
-- 0005 gave `students.portal_user_id` a partial unique index, so one
-- auth user cannot be two learners. The reverse — one learner having
-- two accounts — was possible: the column would simply be overwritten
-- and the previous account would still exist, still be able to sign in,
-- and resolve to NOBODY. `app.current_student_id()` would return null
-- and every policy would deny, so the learner would meet a portal that
-- says nothing is available and no one could explain why.
--
-- This function refuses instead, and says which account already holds
-- the place.

begin;

-- ------------------------------------------------------------
-- public.link_student_portal_account
-- ------------------------------------------------------------
create or replace function public.link_student_portal_account(
  p_student_id uuid,
  p_user_id    uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school  uuid := app.current_school_id();
  v_name    text;
  v_holder  text;
  v_taken   uuid;
begin
  -- Provisioning an account is a registrar or administrator act. A
  -- teacher holds `students.read.own_classes`, never `students.write`,
  -- so this refuses them without a separate rule saying so.
  if not app.has_permission('students.write') then
    raise exception 'not permitted to give a learner a portal account'
      using errcode = '42501';
  end if;

  select public.student_display_name(st.*) into v_name
  from public.students st
  where st.id = p_student_id and st.school_id = v_school and st.deleted_at is null;
  if v_name is null then
    raise exception 'No such learner in this school.' using errcode = 'P0002';
  end if;

  -- The account must be this school's too. Both sides are checked
  -- because either one being foreign is a tenancy breach, and the
  -- Edge Function that calls this holds service_role on the other side
  -- of the wire.
  if not exists (select 1 from public.users u
                 where u.id = p_user_id and u.school_id = v_school
                   and u.deleted_at is null) then
    raise exception 'No such account in this school.' using errcode = 'P0002';
  end if;

  -- Already linked to THIS learner: not an error. The Edge Function may
  -- retry after a network failure, and a retry that raises would send
  -- the registrar to create a second account for a learner who has one.
  if exists (select 1 from public.students st
             where st.id = p_student_id and st.portal_user_id = p_user_id) then
    return jsonb_build_object('status', 'already_linked', 'studentId', p_student_id);
  end if;

  -- This learner already has a DIFFERENT account.
  select u.email into v_holder
  from public.students st
  join public.users u on u.id = st.portal_user_id
  where st.id = p_student_id and st.portal_user_id is not null;

  if v_holder is not null then
    raise exception
      '% already has a portal account (%). Reset that password rather than '
      'creating a second one — a second account would sign in and see nothing.',
      v_name, v_holder
      using errcode = '23505';
  end if;

  -- This account is already somebody else's learner.
  select st.id into v_taken
  from public.students st
  where st.portal_user_id = p_user_id and st.school_id = v_school;

  if v_taken is not null then
    raise exception 'That account is already the portal login for another learner.'
      using errcode = '23505';
  end if;

  update public.students
     set portal_user_id = p_user_id, updated_at = now()
   where id = p_student_id and school_id = v_school;

  perform app.write_audit('students.link_portal_account', 'students', p_student_id,
    jsonb_build_object('portalUserId', null),
    jsonb_build_object('portalUserId', p_user_id));

  return jsonb_build_object('status', 'linked', 'studentId', p_student_id);
end;
$fn$;

comment on function public.link_student_portal_account is
  'Links a learner to the auth account that signs in as them. Refuses a '
  'second account for a learner already linked, because the second one '
  'would sign in and resolve to nobody.';

-- ------------------------------------------------------------
-- public.unlink_student_portal_account
-- ------------------------------------------------------------
-- Unlinking does not delete the account or the learner. It is what a
-- registrar does when an account was attached to the wrong person: the
-- academic record is untouched and the login simply stops resolving to
-- a learner, which is the safe direction to fail in.
create or replace function public.unlink_student_portal_account(
  p_student_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_was    uuid;
begin
  if not app.has_permission('students.write') then
    raise exception 'not permitted to change a learner''s portal account'
      using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to unlink a portal account.'
      using errcode = '23514';
  end if;

  select st.portal_user_id into v_was
  from public.students st
  where st.id = p_student_id and st.school_id = v_school and st.deleted_at is null;

  if v_was is null then
    raise exception 'That learner has no portal account to unlink.'
      using errcode = 'P0002';
  end if;

  update public.students set portal_user_id = null, updated_at = now()
   where id = p_student_id and school_id = v_school;

  -- The ACCOUNT is left alone deliberately. Suspending it is a separate
  -- decision made on the Users screen, and doing both here would hide
  -- one act inside another.
  perform app.write_audit('students.unlink_portal_account', 'students', p_student_id,
    jsonb_build_object('portalUserId', v_was),
    jsonb_build_object('portalUserId', null),
    p_reason);
end;
$fn$;

-- ------------------------------------------------------------
-- public.may_provision_portal_accounts
-- ------------------------------------------------------------
-- A yes/no the SCREEN reads, so it can hide a button that would only be
-- refused — and that the Edge Function reads BEFORE minting an auth
-- identity, so an unauthorized caller never leaves an orphan identity
-- holding an email address the registrar then cannot reuse.
--
-- `students.write`, not `users.write`. Giving a learner access to their
-- own record is a student-record act and belongs to whoever owns the
-- student master record — the registrar, who does not hold the staff
-- account permissions and should not need them for this.
create or replace function public.may_provision_portal_accounts()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$ select app.has_permission('students.write') $fn$;

-- ------------------------------------------------------------
-- rds.portal_account_candidates — who still needs one
-- ------------------------------------------------------------
-- The screen this serves is a section at a time, not a school at a
-- time: a registrar provisions Grade 10 Pearl on a Monday, not 1,500
-- learners at once. Returning a section keeps the printable credential
-- list to one page and keeps the query bounded.
create or replace function rds.portal_account_candidates(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
begin
  if not app.has_permission('students.write') then
    raise exception 'not permitted to view portal accounts' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'section', (select jsonb_build_object(
                    'id', sec.id, 'name', sec.name, 'gradeLevel', gl.name)
                  from public.sections sec
                  join public.grade_levels gl on gl.id = sec.grade_level_id
                  where sec.id = p_section_id and sec.school_id = v_school),
      'learners', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'studentId',   st.id,
                 'displayName', public.student_display_name(st.*),
                 'lrn',         st.lrn,
                 'email',       u.email,
                 'hasAccount',  st.portal_user_id is not null)
               order by st.last_name, st.first_name)
        from public.enrollments e
        join public.students st on st.id = e.student_id
        left join public.users u on u.id = st.portal_user_id
        where e.section_id = p_section_id
          and e.school_id = v_school
          and e.status in ('enrolled', 'transferred_in')
          and st.deleted_at is null
      ), '[]'::jsonb))
  );
end;
$fn$;

create or replace function public.portal_account_candidates(p_section_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $fn$ select rds.portal_account_candidates(p_section_id) $fn$;

grant execute on function
  public.may_provision_portal_accounts(),
  public.link_student_portal_account(uuid, uuid),
  public.unlink_student_portal_account(uuid, text),
  rds.portal_account_candidates(uuid),
  public.portal_account_candidates(uuid)
to authenticated;

revoke execute on function
  public.may_provision_portal_accounts(),
  public.link_student_portal_account(uuid, uuid),
  public.unlink_student_portal_account(uuid, text),
  rds.portal_account_candidates(uuid),
  public.portal_account_candidates(uuid)
from public, anon;

commit;
