-- 0016 — Close the gap between "fails closed" and "cannot be called".
--
-- Raised by Supabase's database linter against the live project, and
-- confirmed by probing rather than assumed:
--
--   anon → public.publish_grades     blocked: not permitted to publish grades
--   anon → public.sync_class_roster  blocked: not permitted
--   anon → public.session_context    blocked: permission denied for schema rds
--
-- So nothing was reachable. But the reason nothing was reachable is that
-- every function's first act is a permission check — the grant itself was
-- wide open, because PostgreSQL grants EXECUTE on new functions to PUBLIC
-- and migration 0011 never took it back. One future function that forgets
-- its guard would be exposed to the internet on the day it is written.
--
-- Two changes, neither of which alters what a signed-in user can do.
--
-- ⚠️ Both operate on OUR functions only. `citext` installs into public,
-- and its comparison functions back the operators on every citext column
-- in the schema. Revoking PUBLIC's execute on those, or trying to pin
-- their search_path, breaks ordinary queries and fails outright — the
-- migration role does not own them. Extension-owned routines are
-- excluded by pg_depend, not by name.

-- ---------------------------------------------------------------------
-- 1. EXECUTE is granted, not inherited
-- ---------------------------------------------------------------------

do $$
declare f record;
begin
  for f in
    select n.nspname as sch, p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'rds', 'public')
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'   -- owned by an extension
      )
  loop
    execute format('revoke execute on function %I.%I(%s) from public',
                   f.sch, f.fn, f.args);
    execute format('grant execute on function %I.%I(%s) to authenticated, service_role',
                   f.sch, f.fn, f.args);
  end loop;
end $$;

-- Anything created from here on starts closed rather than open.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app    revoke execute on functions from public;
alter default privileges in schema rds    revoke execute on functions from public;

alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema app    grant execute on functions to authenticated;
alter default privileges in schema rds    grant execute on functions to authenticated;

-- anon keeps nothing. It has no tenant: app.current_school_id() resolves
-- NULL for an unauthenticated request, so every policy fails closed
-- anyway — this just means the call is refused before it starts.

-- ---------------------------------------------------------------------
-- 2. Pin search_path on every function that lacks one
-- ---------------------------------------------------------------------
--
-- A function without a fixed search_path resolves unqualified names
-- against the caller's path. For the SECURITY DEFINER helpers that is the
-- classic privilege-escalation vector; for the trigger functions, which
-- run as the invoker, it is a smaller risk but the same class of bug.
-- Done by introspection rather than a hand-written list, so a function
-- added later cannot be missed by a stale enumeration.

do $$
declare f record;
begin
  for f in
    select n.nspname as sch, p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'rds', 'public')
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) as c
        where c like 'search_path=%'
      )
  loop
    execute format('alter function %I.%I(%s) set search_path = public, pg_temp',
                   f.sch, f.fn, f.args);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. document_number_sequences has no policy on purpose
-- ---------------------------------------------------------------------
--
-- The linter reports it as "RLS enabled, no policy". That is the intent,
-- not an oversight: the table is a counter, and the only correct way to
-- move it is app.next_document_number(), which is SECURITY DEFINER and
-- allocates atomically. FORCE RLS with no policy means no client can read
-- or write it directly under any role — a stronger guarantee than any
-- policy could express. Recorded here so the next person to see the
-- warning does not "fix" it by adding one.

comment on table public.document_number_sequences is
  'Document number counters. Deliberately has RLS enabled and NO policy: '
  'the only sanctioned access is app.next_document_number(), which is '
  'SECURITY DEFINER and allocates atomically. Do not add a policy.';

-- ---------------------------------------------------------------------
-- Not fixed here, and why
-- ---------------------------------------------------------------------
--
-- citext installed in public — the linter suggests moving it. Doing so
--   means re-typing every citext column and rebuilding their indexes on a
--   live database, to remove a warning that describes a namespace
--   preference rather than a vulnerability. Left as it is.
--
-- Leaked-password protection disabled — a Supabase Auth dashboard
--   setting, not SQL. Turn it on under Authentication → Policies before
--   any real account exists.
