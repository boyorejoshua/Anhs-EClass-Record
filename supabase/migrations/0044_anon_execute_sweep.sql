-- ============================================================
-- 0044 · Close the last two anon EXECUTE grants
-- ============================================================
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so
-- every migration that creates a `public.` function has to revoke it.
-- 0017 revoked everything that existed then; 0041 restored the posture
-- for the migrations that had skipped it. A sweep of the whole schema
-- in Phase 2.1 found two still open:
--
--   public.students_directory(uuid, text, uuid, uuid, integer)
--   public.grade_level_census(uuid)
--
-- Both read learner data. NEITHER LEAKED: both are SECURITY INVOKER, so
-- an anon caller carries no school claim, and the call is refused at the
-- rds schema boundary before any row is considered. Verified by calling
-- them as `anon` against a database built from every migration —
-- "permission denied for schema rds".
--
-- Revoked anyway, because the thing that makes them safe is two other
-- decisions holding: SECURITY INVOKER, and rds staying unreachable. Both
-- are one edit away from changing, and neither edit would look like it
-- was granting the public access to a student directory.
--
-- This is a sweep, not a fix for a breach. Nothing about the running
-- system changes.

begin;

revoke execute on function
  public.students_directory(uuid, text, uuid, uuid, integer),
  public.grade_level_census(uuid)
from public, anon;

commit;
