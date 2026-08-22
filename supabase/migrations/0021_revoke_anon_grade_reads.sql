-- 0021 — Take SELECT on the grade tables away from `anon`.
--
-- Migration 0020 removed the project-default INSERT/UPDATE/DELETE grants
-- from `authenticated` and `anon` and left SELECT alone, on the grounds
-- that the read policies are the intended control. That reasoning holds
-- for `authenticated`. It does not hold for `anon`.
--
-- Every SELECT policy on both tables is scoped to `{authenticated}`:
--
--   period_grades         read_all / read_teacher / read_student
--   final_subject_grades  read_staff / read_student
--
-- With FORCE ROW LEVEL SECURITY on and no policy naming `anon`, an
-- anonymous request already reads zero rows. Nothing is exploitable
-- today. But the only thing standing between an unauthenticated caller
-- and a learner's grades is, once again, the ABSENCE of a policy — and
-- a future policy written as `for select using (...)` with no `to`
-- clause defaults to PUBLIC and would hand `anon` the lot in silence.
--
-- Remove the privilege so it has to be granted deliberately.

revoke select on public.period_grades, public.final_subject_grades from anon;

-- The same default grant reaches the rest of the academic record. A
-- grade is not the only thing that must never be readable anonymously.
revoke select on
    public.assessment_scores,
    public.assessments,
    public.class_enrollments,
    public.enrollments,
    public.students
  from anon;
