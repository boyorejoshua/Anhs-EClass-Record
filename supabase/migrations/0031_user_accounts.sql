-- 0031 — Accounts: how a person comes to have a login at all.
--
-- The gap this closes, flagged directly against the live site: every
-- account in the system was seeded. There was no way for a school to
-- add a teacher, no way for anyone to see or edit their own details,
-- and no way to change a password. A demo could only ever be "here are
-- five accounts we made for you", and a real school could never take
-- the system over.
--
-- ── THERE IS NO PUBLIC SIGN-UP, AND THAT IS THE DESIGN ────────────────
--
-- Every account must belong to exactly one school, and the tenant lives
-- in `app_metadata.school_id` on the auth identity, which the client
-- cannot write (0015). A public "create an account" form would have to
-- let the registrant name their own school — and then anyone holding
-- the URL becomes a teacher at ANHS and reads every learner's grades.
-- For a system holding minors' records under RA 10173 that is not a
-- feature with rough edges, it is a disclosure.
--
-- So accounts arrive one of two ways:
--
--   1. MENDTRIX provisions the school and its FIRST administrator. One
--      act, once per school, at implementation time — the thing the
--      implementation fee in docs/14-commercialization.md pays for.
--   2. THE ADMINISTRATOR creates everyone else, here.
--
-- and every person then maintains their own details themselves.
--
-- ── WHAT LIVES HERE AND WHAT LIVES IN THE EDGE FUNCTION ───────────────
--
-- Minting an auth identity needs service_role, so `create_user` and
-- `reset_password` are in the `manage-users` Edge Function — the same
-- split compute-period-grades already uses. EVERYTHING ELSE is ordinary
-- SQL and belongs here: roles, status, and a person's own details are
-- rows in public tables, and routing them through an Edge Function
-- would put authorization in TypeScript that the database can enforce
-- itself.

-- ------------------------------------------------------------
-- must_change_password
-- ------------------------------------------------------------
-- An administrator hands out a temporary password — deliberately, in
-- preference to an emailed invite link. Supabase's invite flow needs
-- SMTP configured and needs every teacher to have working email they
-- read; a DepEd public school reliably has neither. A password read off
-- a slip of paper works on day one.
--
-- The cost of that choice is that the administrator briefly knows the
-- password, so this flag makes the handover one-time: the app refuses
-- to go anywhere until the person sets their own.
alter table public.users
  add column if not exists must_change_password boolean not null default false;

comment on column public.users.must_change_password is
  'Set when an administrator issues a temporary password. Cleared by '
  'clear_must_change_password() once the person has set their own.';

-- ------------------------------------------------------------
-- rds.staff_directory — every account in the school
-- ------------------------------------------------------------
-- `users.read` is held by the registrar as well as the administrator,
-- so this reads for both; only the WRITE paths below check users.write.
-- The `permissions` block lets the screen hide buttons it would only
-- get refused for — a courtesy, never the control.
create or replace function rds.staff_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid := app.current_school_id();
  v_result jsonb;
begin
  if not app.has_permission('users.read') then
    raise exception 'not permitted to view accounts' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('code', r.code, 'name', r.name)
                       order by r.code)
      from public.roles r
      where r.school_id = v_school
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id,
               'email', u.email,
               'employeeId', u.employee_id,
               'firstName', u.first_name,
               'middleName', u.middle_name,
               'lastName', u.last_name,
               'suffix', u.suffix,
               'status', u.status,
               'mustChangePassword', u.must_change_password,
               'lastLoginAt', u.last_login_at,
               'position', sp.position,
               'isSelf', u.id = app.current_user_id(),
               'roles', coalesce((
                 select jsonb_agg(r.code order by r.code)
                 from public.user_roles ur
                 join public.roles r on r.id = ur.role_id
                 where ur.user_id = u.id and ur.school_id = v_school
               ), '[]'::jsonb))
             order by u.last_name, u.first_name)
      from public.users u
      left join public.staff_profiles sp on sp.user_id = u.id
      where u.school_id = v_school and u.deleted_at is null
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canWrite',      app.has_permission('users.write'),
      'canAssignRoles', app.has_permission('roles.assign'),
      'canDeactivate', app.has_permission('users.deactivate')
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.staff_directory()
returns jsonb language sql stable set search_path = public, pg_temp
as $$ select rds.staff_directory() $$;

-- ------------------------------------------------------------
-- rds.my_account — the signed-in person's own details
-- ------------------------------------------------------------
-- Distinct from `my_profile`, which is the STUDENT portal's and reads
-- app.current_student_id(). Staff had no equivalent at all: a teacher
-- could not see, let alone correct, their own name on the records they
-- sign.
create or replace function rds.my_account()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'employeeId', u.employee_id,
    'firstName', u.first_name,
    'middleName', u.middle_name,
    'lastName', u.last_name,
    'suffix', u.suffix,
    'status', u.status,
    'mustChangePassword', u.must_change_password,
    'position', sp.position,
    'employmentStatus', sp.employment_status,
    'dateHired', sp.date_hired,
    'qualifications', sp.qualifications,
    'ancillaryAssignments', sp.ancillary_assignments,
    'schoolName', s.name,
    'roles', coalesce((
      select jsonb_agg(r.code order by r.code)
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = u.id and ur.school_id = u.school_id
    ), '[]'::jsonb)
  )
  from public.users u
  left join public.staff_profiles sp on sp.user_id = u.id
  left join public.schools s on s.id = u.school_id
  where u.id = app.current_user_id()
$$;

create or replace function public.my_account()
returns jsonb language sql stable set search_path = public, pg_temp
as $$ select rds.my_account() $$;

-- ------------------------------------------------------------
-- update_my_profile — anyone, their own row, the safe fields only
-- ------------------------------------------------------------
-- Takes NO user id. The row updated is always app.current_user_id(),
-- which comes from the verified token, so "edit someone else's profile"
-- is not a permission this function refuses — it is a request it has no
-- way to express.
--
-- EMAIL IS NOT EDITABLE HERE. It is the sign-in credential and lives on
-- the auth identity; changing it in public.users alone would leave the
-- two disagreeing and the person still signing in with the old address.
-- Same for status and roles: a teacher promoting themselves to
-- administrator is exactly what this function must not permit.
create or replace function public.update_my_profile(
  p_first_name  text,
  p_last_name   text,
  p_middle_name text default null,
  p_suffix      text default null,
  p_position    text default null,
  p_qualifications text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := app.current_user_id();
  v_school uuid := app.current_school_id();
  v_first  text := nullif(btrim(p_first_name), '');
  v_last   text := nullif(btrim(p_last_name), '');
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_first is null or v_last is null then
    raise exception 'a first and last name are both required' using errcode = '22023';
  end if;

  update public.users
     set first_name  = v_first,
         last_name   = v_last,
         middle_name = nullif(btrim(p_middle_name), ''),
         suffix      = nullif(btrim(p_suffix), '')
   where id = v_user;

  -- The staff profile is optional data about a post, so it is created
  -- on first edit rather than required to exist up front.
  insert into public.staff_profiles (user_id, school_id, position, qualifications)
  values (v_user, v_school, nullif(btrim(p_position), ''), nullif(btrim(p_qualifications), ''))
  on conflict (user_id) do update
    set position       = excluded.position,
        qualifications = excluded.qualifications;

  perform app.write_audit('users.update_self', 'users', v_user, null,
    jsonb_build_object('firstName', v_first, 'lastName', v_last));
end;
$$;

comment on function public.update_my_profile is
  'Self-service. Updates the caller''s OWN name and staff profile. '
  'Cannot reach another user, and cannot touch email, status or roles.';

-- ------------------------------------------------------------
-- clear_must_change_password
-- ------------------------------------------------------------
-- Called after supabase.auth.updateUser() has actually accepted the new
-- password. Deliberately separate from the password change itself: the
-- credential lives in auth.users and only the Auth API may set it, so
-- this records the CONSEQUENCE rather than pretending to do the work.
create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.current_user_id() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.users
     set must_change_password = false
   where id = app.current_user_id();
end;
$$;

-- ------------------------------------------------------------
-- set_user_roles — the administrator's role assignment
-- ------------------------------------------------------------
-- Takes the WHOLE set, not add/remove, because that is how the screen
-- presents it (a row of checkboxes) and a set-valued write cannot drift
-- from a set-valued form the way a sequence of deltas can.
--
-- Roles are composable by design: Teacher + Adviser is two rows. V0's
-- schema had a mutually exclusive role CHECK and literally could not
-- express the most common arrangement in a Philippine high school.
create or replace function public.set_user_roles(
  p_user_id uuid,
  p_role_codes text[]
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid := app.current_school_id();
  v_self   uuid := app.current_user_id();
  v_before jsonb;
begin
  if not app.has_permission('roles.assign') then
    raise exception 'not permitted to assign roles' using errcode = '42501';
  end if;

  -- Tenant check before anything else. Without it, a valid uuid from
  -- another school would be edited by an administrator who cannot even
  -- see that school — the one failure RLS cannot catch here, because
  -- this function is SECURITY DEFINER and runs with it bypassed.
  if not exists (
    select 1 from public.users u
    where u.id = p_user_id and u.school_id = v_school and u.deleted_at is null
  ) then
    raise exception 'no such account in this school' using errcode = '42501';
  end if;

  -- Locking yourself out is the classic way an administration screen
  -- bricks a tenant: one administrator, one careless save, and nobody
  -- can create accounts or assign roles ever again. Refuse it here
  -- rather than leaving the school to phone Mendtrix.
  if p_user_id = v_self
     and not ('school_admin' = any (p_role_codes)) then
    raise exception
      'you cannot remove your own administrator role — ask another administrator'
      using errcode = '42501';
  end if;

  select jsonb_agg(r.code order by r.code) into v_before
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id and ur.school_id = v_school;

  delete from public.user_roles
   where user_id = p_user_id and school_id = v_school;

  -- Joining to public.roles rather than trusting the codes is what
  -- keeps a role from another tenant, or a typo, out of the table.
  insert into public.user_roles (user_id, role_id, school_id, granted_by)
  select p_user_id, r.id, v_school, v_self
  from public.roles r
  where r.school_id = v_school
    and r.code = any (p_role_codes);

  perform app.write_audit('users.set_roles', 'users', p_user_id,
    jsonb_build_object('roles', v_before),
    jsonb_build_object('roles', to_jsonb(p_role_codes)));
end;
$$;

-- ------------------------------------------------------------
-- set_user_status — deactivate, reactivate
-- ------------------------------------------------------------
-- Never a delete. `users.id` is the author of every grade submission,
-- receipt and audit row in the school's history; removing it would
-- either cascade that away or fail on a foreign key. 0015 made the
-- auth-identity link ON DELETE RESTRICT for the same reason. An account
-- ends by going inactive and staying in the record.
create or replace function public.set_user_status(
  p_user_id uuid,
  p_status  text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid := app.current_school_id();
  v_before text;
begin
  if not app.has_permission('users.deactivate') then
    raise exception 'not permitted to change account status' using errcode = '42501';
  end if;
  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'unknown account status "%"', p_status using errcode = '22023';
  end if;
  if p_user_id = app.current_user_id() and p_status <> 'active' then
    raise exception 'you cannot deactivate your own account' using errcode = '42501';
  end if;

  select u.status into v_before
  from public.users u
  where u.id = p_user_id and u.school_id = v_school and u.deleted_at is null;

  if v_before is null then
    raise exception 'no such account in this school' using errcode = '42501';
  end if;

  update public.users set status = p_status where id = p_user_id;

  perform app.write_audit('users.set_status', 'users', p_user_id,
    jsonb_build_object('status', v_before),
    jsonb_build_object('status', p_status));
end;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
-- `authenticated` only. anon holds nothing here: an unauthenticated
-- caller must not be able to enumerate a school's staff, and 0017
-- established that revoking from anon is done explicitly rather than
-- assumed from the absence of a grant.
revoke all on function
  rds.staff_directory(), public.staff_directory(),
  rds.my_account(), public.my_account(),
  public.update_my_profile(text, text, text, text, text, text),
  public.clear_must_change_password(),
  public.set_user_roles(uuid, text[]),
  public.set_user_status(uuid, text)
  from public, anon;

grant execute on function
  public.staff_directory(),
  public.my_account(),
  public.update_my_profile(text, text, text, text, text, text),
  public.clear_must_change_password(),
  public.set_user_roles(uuid, text[]),
  public.set_user_status(uuid, text)
  to authenticated;
