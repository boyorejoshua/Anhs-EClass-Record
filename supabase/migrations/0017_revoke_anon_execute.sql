-- 0017 — Take EXECUTE away from anon.
--
-- 0016 revoked EXECUTE from PUBLIC and the linter's warnings persisted.
-- The reason, from pg_default_acl:
--
--   grantor    schema   acl
--   postgres   public   {postgres=X/postgres, anon=X/postgres,
--                        authenticated=X/postgres, service_role=X/postgres}
--
-- Supabase ships a default-privileges rule that grants EXECUTE to `anon`
-- on every function created in `public`. So each of our functions carries
-- a direct grant to anon, stamped at creation time. Revoking from PUBLIC
-- is orthogonal to it and leaves it standing — which is why the probe
-- still reported anon_publish = true after 0016 succeeded.
--
-- A rule that grants a role by default is not something you undo once;
-- it has to be turned off, or the next migration silently re-opens
-- everything it creates.

-- Existing functions: drop anon's direct grant.
-- Extension-owned routines are skipped — citext's operators live in
-- public and back every citext column in the schema.
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
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %I.%I(%s) from anon',
                   f.sch, f.fn, f.args);
  end loop;
end $$;

-- Future functions: stop the default rule from granting anon at all.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema app    revoke execute on functions from anon;
alter default privileges in schema rds    revoke execute on functions from anon;

-- Nothing in this platform is meant to be callable before signing in.
-- There is no public catalogue, no anonymous lookup, no unauthenticated
-- report. A request without a session has no tenant —
-- app.current_school_id() resolves NULL — so it could never have read a
-- row regardless. This makes the refusal happen at the door rather than
-- inside the function, and, more usefully, makes it the default for
-- every function written from here on.
--
-- The `supabase_admin` default-privileges row still lists anon. It
-- governs functions created BY supabase_admin — platform internals such
-- as graphql and storage — not ours, and it is not ours to change.
