-- 0034 — A teacher corrects the spelling of a learner's name.
--
-- Asked for directly, alongside the legacy Student List screenshot: the
-- old system let a teacher retype any name in place. That is the right
-- capability and the wrong mechanism, and the difference is the whole
-- point of this migration.
--
-- ── WHY A RENAME IS SAFE HERE AND WAS NOT IN V0 ───────────────────────
--
-- In V0 the NAME WAS THE KEY: `grades[term][studentName]`,
-- `att[date][studentName]`. Correcting a spelling there did not rename
-- a learner — it created a new one, and orphaned every mark filed under
-- the old spelling. That is why a rename felt dangerous.
--
-- Here identity is a uuid. `class_enrollments` → `enrollments` →
-- `students`, and every score hangs off the class-enrolment id. Editing
-- `students.first_name` changes a display string and touches nothing
-- else. The rename is now the cheap, obvious operation it always should
-- have been.
--
-- ── WHAT A TEACHER MAY CHANGE, AND WHAT THEY MAY NOT ──────────────────
--
-- Name parts only: first, middle, last, suffix. NOT the LRN, birth
-- date, sex, status or enrolment — those are identity and registry
-- facts the registrar owns, and a subject teacher fixing a typo has no
-- business near them. The function takes no parameter for any of them,
-- so this is not a rule it enforces but a request it cannot express.
--
-- Scope: a learner in a class the CALLER TEACHES. Not the school
-- directory. A teacher cannot rename a child they have never taught.
--
-- Every rename writes an audit row with the old and new name, because
-- "who changed this learner's name, and when" is a question a registrar
-- will eventually need answered.

-- ------------------------------------------------------------
-- app.learner_in_my_classes
-- ------------------------------------------------------------
create or replace function app.learner_in_my_classes(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.class_enrollments ce
    join public.enrollments e on e.id = ce.enrollment_id
    join public.classes cl on cl.id = ce.class_id
    where e.student_id = p_student_id
      and cl.school_id = app.current_school_id()
      and app.teaches_class(cl.id)
  )
$fn$;

comment on function app.learner_in_my_classes is
  'True when the learner sits in at least one class the caller teaches.';

-- ------------------------------------------------------------
-- correct_learner_name
-- ------------------------------------------------------------
create or replace function public.correct_learner_name(
  p_student_id  uuid,
  p_first_name  text,
  p_last_name   text,
  p_middle_name text    default null,
  p_suffix      text    default null,
  -- Renaming INTO a name somebody else already has looks exactly like
  -- creating a duplicate, so it is refused the same way and for the
  -- same reason — unless the teacher says it really is a namesake.
  p_confirm_namesake boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_first  text := nullif(btrim(p_first_name), '');
  v_last   text := nullif(btrim(p_last_name), '');
  v_before jsonb;
  v_clash  text;
begin
  if not app.has_permission('students.write.own_classes') then
    raise exception 'not permitted to edit learner names' using errcode = '42501';
  end if;
  if not app.learner_in_my_classes(p_student_id) then
    raise exception 'that learner is not in any class you teach' using errcode = '42501';
  end if;
  if v_first is null or v_last is null then
    raise exception 'a first and last name are both required' using errcode = '22023';
  end if;

  if not p_confirm_namesake then
    select public.student_display_name(st.*) into v_clash
    from public.students st
    where st.school_id = v_school
      and st.id <> p_student_id
      and st.deleted_at is null
      and st.status = 'active'
      and lower(regexp_replace(st.first_name, '\s+', ' ', 'g')) = lower(regexp_replace(v_first, '\s+', ' ', 'g'))
      and lower(regexp_replace(st.last_name,  '\s+', ' ', 'g')) = lower(regexp_replace(v_last,  '\s+', ' ', 'g'))
    limit 1;

    if v_clash is not null then
      raise exception
        'Another learner at this school is already called %. Confirm they are different people if that is correct.',
        v_clash
        using errcode = '23505';
    end if;
  end if;

  select jsonb_build_object(
    'firstName', st.first_name, 'middleName', st.middle_name,
    'lastName', st.last_name, 'suffix', st.suffix)
  into v_before
  from public.students st where st.id = p_student_id;

  update public.students
     set first_name  = v_first,
         last_name   = v_last,
         middle_name = nullif(btrim(p_middle_name), ''),
         suffix      = nullif(btrim(p_suffix), '')
   where id = p_student_id and school_id = v_school;

  -- Old AND new, because the question a registrar asks later is not
  -- "what is this learner called" but "what were they called before".
  perform app.write_audit('students.rename', 'students', p_student_id, v_before,
    jsonb_build_object('firstName', v_first, 'middleName', nullif(btrim(p_middle_name), ''),
                       'lastName', v_last, 'suffix', nullif(btrim(p_suffix), ''),
                       'byTeacher', true));
end;
$fn$;

comment on function public.correct_learner_name is
  'Corrects the spelling of a learner in a class the CALLER teaches. '
  'Name parts only — never LRN, sex, birth date, status or enrolment. '
  'Audited with the previous name.';

revoke all on function
  app.learner_in_my_classes(uuid),
  public.correct_learner_name(uuid, text, text, text, text, boolean)
  from public, anon;

grant execute on function
  public.correct_learner_name(uuid, text, text, text, text, boolean)
  to authenticated;
