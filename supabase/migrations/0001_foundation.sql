-- ============================================================
-- 0001 · Foundation: extensions, tenancy helpers, shared triggers
-- Mendtrix School Academic Records & Grading Platform
-- ============================================================
-- Every tenant-scoped table in later migrations depends on the
-- helpers defined here. Nothing in this file is school-specific.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;
comment on schema app is 'Internal helpers and RPCs. Not exposed via PostgREST.';

-- ------------------------------------------------------------
-- Tenant identity
-- ------------------------------------------------------------
-- The tenant NEVER comes from client input. It is read from a
-- verified JWT claim set at token issuance from the user's role
-- assignment. No API accepts a school_id parameter that changes
-- what is returned.

create or replace function app.current_school_id()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'school_id',
    ''
  )::uuid
$$;

comment on function app.current_school_id is
  'Tenant of the authenticated request, from a verified JWT claim. Never client-supplied.';

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;

-- Platform staff (Mendtrix) carry no standing access to learner data.
-- Support access is a separate, time-boxed, audited grant.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'platform_admin')::boolean,
    false
  )
$$;

-- ------------------------------------------------------------
-- Shared triggers
-- ------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Stamps school_id from the caller's tenant when the client omits it,
-- and rejects any attempt to write a row into another tenant.
create or replace function app.enforce_school_id()
returns trigger
language plpgsql
as $$
declare
  caller_school uuid := app.current_school_id();
begin
  if caller_school is null then
    -- service_role / migrations / seeding: require an explicit value
    if new.school_id is null then
      raise exception 'school_id required when no tenant claim is present';
    end if;
    return new;
  end if;

  if new.school_id is null then
    new.school_id := caller_school;
  elsif new.school_id <> caller_school then
    raise exception 'cross-tenant write rejected (row school_id=%, caller=%)',
      new.school_id, caller_school
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Academic rows in a closed or archived academic year are read-only.
-- This is a data-integrity control, not a permission: it holds even
-- for a school administrator.
create or replace function app.reject_write_to_archived_year()
returns trigger
language plpgsql
as $$
declare
  yr_status text;
  yr_id uuid;
begin
  yr_id := coalesce(
    to_jsonb(new) ->> 'academic_year_id',
    to_jsonb(old) ->> 'academic_year_id'
  )::uuid;

  if yr_id is null then
    return coalesce(new, old);
  end if;

  select status into yr_status from public.academic_years where id = yr_id;

  if yr_status = 'archived' then
    raise exception 'academic year % is archived and read-only', yr_id
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- Convenience: attach the standard trigger set to a tenant table.
create or replace function app.attach_tenant_triggers(tbl regclass)
returns void
language plpgsql
as $$
declare
  t text := tbl::text;
  n text := replace(replace(t, 'public.', ''), '"', '');
begin
  execute format(
    'create trigger %I before insert or update on %s
       for each row execute function app.enforce_school_id()',
    n || '_school_id', t);
end;
$$;
