-- ============================================================
-- 0015 · Resolving the tenant under Supabase Auth
-- ============================================================
-- app.current_school_id() originally read a top-level `school_id` JWT
-- claim. Stock Supabase Auth does not mint one — that needs a Custom
-- Access Token Hook, which is extra configuration to get wrong and easy
-- to forget when provisioning the next school.
--
-- Supabase DOES embed `auth.users.raw_app_meta_data` in every access
-- token as `app_metadata`. That is the right home for tenancy:
--
--   * app_metadata is SERVER-CONTROLLED. A signed-in user can change
--     their own user_metadata through the client SDK; they cannot touch
--     app_metadata. Putting school_id in user_metadata would let any
--     teacher reassign themselves to another school.
--   * It rides in the verified, signed token, so reading it is exactly
--     as trustworthy as reading `sub`.
--   * No hook to configure, so provisioning a school cannot silently
--     half-work.
--
-- Resolution order below is deliberate: an explicit top-level claim
-- still wins, which keeps the psql test suites working (they set it
-- directly) and leaves the door open for a hook later.

create or replace function app.current_school_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    -- 1. explicit top-level claim (custom hook, or the test suites)
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'school_id', ''),
    -- 2. app_metadata, which Supabase Auth populates and the user cannot edit
    nullif(current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'school_id', '')
  )::uuid
$$;

comment on function app.current_school_id is
  'Tenant of the authenticated request. Reads a top-level school_id claim '
  'if present, else app_metadata.school_id, which Supabase Auth embeds in '
  'the token and the user cannot modify. Never client-supplied.';

-- ------------------------------------------------------------
-- Keep public.users in step with auth.users
-- ------------------------------------------------------------
-- public.users.id mirrors auth.users.id, but nothing enforced it, so a
-- provisioning mistake would produce a signed-in user with no record —
-- which the app can only report as "your account is not set up".
--
-- Deleting the auth user should not delete the academic authorship
-- attached to the public row, so this is ON DELETE RESTRICT: an account
-- is deactivated, never deleted out from under its history.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'auth' and table_name = 'users')
     and not exists (select 1 from pg_constraint where conname = 'users_auth_fk')
  then
    alter table public.users
      add constraint users_auth_fk
      foreign key (id) references auth.users(id) on delete restrict;
  end if;
end $$;
