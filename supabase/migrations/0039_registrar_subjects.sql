-- 0039 — The registrar may add a subject too.
--
-- 0038 gave `subjects.write` to the administrator alone, on the reading
-- that a subject is school-wide configuration. The school's answer is
-- that both hold it: "the registrar and administrator should be able to
-- add a subjects as well".
--
-- It is the better rule, and the reason is where the need arises. A
-- registrar setting up the school year opens Classes & Sections, goes
-- to create a class, and finds the subject missing — GMRC, Values
-- Education, an elective the school added this year. Under 0038 they
-- stopped there and waited for somebody else. The person who is blocked
-- and the person who can unblock them should be the same person unless
-- there is a reason they should not be, and "a subject is configuration"
-- is a category argument, not a reason.
--
-- WHAT DOES NOT CHANGE: the category is still a required choice, and it
-- still decides the grading weights. Widening who may add a subject
-- widens who may set 20/50/30 against 20/60/20 for everyone who takes
-- it. The form names the weights in the option text for exactly this
-- reason, and that mattered less when one careful administrator held
-- the permission than it does now.
--
-- Teachers are still refused. A teacher typing "Math 10" beside the
-- school's "Mathematics 10" is the duplicate the case-insensitive guard
-- in `create_subject` cannot resolve — it can only refuse the second
-- one, which helps nobody standing in front of a class.

-- ── A MIGRATION CANNOT GRANT TO A ROLE THAT DOES NOT EXIST YET ────────
--
-- This matters and it caught me. `public.roles` rows are created by
-- seed.sql, which runs AFTER the migrations on a fresh database — so on
-- a new environment the insert below matches nothing and silently does
-- nothing. On an existing database (production, staging) the roles are
-- already there and it applies.
--
-- Both paths therefore need saying, and the seed's registrar list now
-- carries `subjects.write` too. The administrator never showed the
-- problem because the seed grants that role every permission by
-- cross join, so it picks up anything new for free — which is exactly
-- the kind of asymmetry that hides a bug like this.

begin;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'subjects.write'
from public.roles r
where r.code = 'registrar'
on conflict do nothing;

commit;
