-- 0033 — A teacher puts learners into the class they teach.
--
-- ⚠️ THIS CLOSES A DEAD END MIGRATION 0032 CREATED, and the dead end is
-- worth writing down because it was introduced by a change that passed
-- every test it had.
--
-- 0032 let a teacher create their own class, including in a section
-- they name themselves. The class's roster is filled by
-- `sync_class_roster`, which copies from `enrollments` matching the
-- section. A section the teacher just invented has NO enrolments. So
-- the happy path of the feature was: create a class, land in an empty
-- gradebook, and find no way whatsoever to put a learner in it. Every
-- test passed because every test created a class in a SEEDED section
-- that already had learners.
--
-- Reported plainly by the user, for the fourth time: "there's no way
-- how to add an student".
--
-- ── WHAT THIS DOES NOT REOPEN ─────────────────────────────────────────
--
-- V0's defining defect was that a STUDENT was owned by a CLASS —
-- `students.class_id` — so one learner in six subjects was six
-- unrelated rows, with the NAME as the key. Nothing here goes back
-- there. The three tables stay three tables:
--
--   students          the PERSON. One row per school, for as long as
--                     they attend. Created here only when the person is
--                     genuinely new to the school.
--   enrollments       one SCHOOL YEAR of that person's attendance,
--                     carrying their grade level and section.
--   class_enrollments their participation in ONE subject class.
--
-- Adding a learner to a class is therefore a `class_enrollments` row in
-- the ordinary case, and only reaches `students` when nobody by that
-- name is on file yet.
--
-- ── THE DUPLICATE GUARD ───────────────────────────────────────────────
--
-- The real risk of letting teachers type learner names is two records
-- for one child — the thing an LRN exists to prevent and the thing V0
-- got wrong. So `add_learner_to_my_class` REFUSES a name that already
-- matches an active learner in the school, and names them in the
-- refusal, unless the caller passes p_confirm_new_person. A teacher who
-- genuinely has two learners called Santos, Maria says so once; a
-- teacher who was about to create a duplicate is stopped.
--
-- ── PROVISIONAL LEARNERS ──────────────────────────────────────────────
--
-- A learner a teacher adds has NO LRN. `students.lrn` has been nullable
-- since 0005 ("learners arrive without one"), so this is an anticipated
-- state rather than a hack — but an LRN is what the division office
-- reconciles on, so the registrar has to finish the record. A null LRN
-- IS the flag; no extra column is needed, and the Students directory
-- already shows it.

insert into public.permissions (code, category, description) values
  ('students.write.own_classes', 'students',
   'Add a learner to a class they teach, creating a provisional record if new')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select r.id, 'students.write.own_classes'
from public.roles r
where r.code in ('teacher', 'adviser')
on conflict do nothing;

-- ------------------------------------------------------------
-- rds.my_class_roster — who is in this class, and who could be
-- ------------------------------------------------------------
-- `candidates` is the important half. A teacher typing a name that
-- already exists is how duplicates happen, so the form offers the
-- school's existing learners FIRST and treats typing as the fallback.
create or replace function rds.my_class_roster(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school  uuid := app.current_school_id();
  v_year    uuid;
  v_section uuid;
  v_result  jsonb;
begin
  if not app.teaches_class(p_class_id) then
    raise exception 'you do not teach this class' using errcode = '42501';
  end if;

  select cl.academic_year_id, cl.section_id into v_year, v_section
  from public.classes cl where cl.id = p_class_id;

  select jsonb_build_object(
    'classId', p_class_id,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
               'classEnrollmentId', ce.id,
               'studentId', st.id,
               'displayName', public.student_display_name(st.*),
               'firstName', st.first_name,
               'lastName', st.last_name,
               'sex', st.sex,
               'lrn', st.lrn,
               -- Whether removing them would discard recorded work.
               'hasScores', exists (
                 select 1 from public.assessment_scores sc
                 where sc.class_enrollment_id = ce.id and sc.raw_score is not null))
             order by st.last_name, st.first_name)
      from public.class_enrollments ce
      join public.enrollments e on e.id = ce.enrollment_id
      join public.students st on st.id = e.student_id
      where ce.class_id = p_class_id and st.deleted_at is null
    ), '[]'::jsonb),
    -- Everyone in the school NOT already in this class. Offered before
    -- the free-text field, so the cheap path is the correct one.
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'studentId', st.id,
               'displayName', public.student_display_name(st.*),
               'lrn', st.lrn,
               'enrolledHere', e.id is not null)
             order by st.last_name, st.first_name)
      from public.students st
      left join public.enrollments e
        on e.student_id = st.id and e.academic_year_id = v_year
      where st.school_id = v_school
        and st.deleted_at is null
        and st.status = 'active'
        and not exists (
          select 1 from public.class_enrollments ce2
          join public.enrollments e2 on e2.id = ce2.enrollment_id
          where ce2.class_id = p_class_id and e2.student_id = st.id
        )
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canWrite', app.has_permission('students.write.own_classes')
    )
  ) into v_result;

  return v_result;
end;
$fn$;

create or replace function public.my_class_roster(p_class_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $fn$ select rds.my_class_roster(p_class_id) $fn$;

-- ------------------------------------------------------------
-- add_learner_to_my_class
-- ------------------------------------------------------------
-- Two ways in, one outcome. Pass p_student_id to attach somebody
-- already on file; pass a name to create a provisional record. The
-- second path is guarded against creating a second record for a learner
-- who is already there.
create or replace function public.add_learner_to_my_class(
  p_class_id           uuid,
  p_student_id         uuid    default null,
  p_first_name         text    default null,
  p_last_name          text    default null,
  p_sex                text    default null,
  -- "Yes, this really is a different person with the same name."
  p_confirm_new_person boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school   uuid := app.current_school_id();
  v_year     uuid;
  v_section  uuid;
  v_level    uuid;
  v_student  uuid := p_student_id;
  v_enrol    uuid;
  v_ce       uuid;
  v_first    text := nullif(btrim(p_first_name), '');
  v_last     text := nullif(btrim(p_last_name), '');
  v_clash    text;
begin
  if not app.has_permission('students.write.own_classes') then
    raise exception 'not permitted to add learners' using errcode = '42501';
  end if;
  if not app.teaches_class(p_class_id) then
    raise exception 'you do not teach this class' using errcode = '42501';
  end if;

  select cl.academic_year_id, cl.section_id, sec.grade_level_id
    into v_year, v_section, v_level
  from public.classes cl
  join public.sections sec on sec.id = cl.section_id
  where cl.id = p_class_id;

  if v_section is null then
    raise exception 'this class has no section, so it has nobody to enrol'
      using errcode = '22023';
  end if;

  /* ---- 1. resolve or create the PERSON ----------------------------- */
  if v_student is null then
    if v_first is null or v_last is null then
      raise exception 'choose a learner, or give a first and last name'
        using errcode = '22023';
    end if;

    -- The duplicate guard. Case- and space-insensitive, because
    -- "dela cruz" and "Dela  Cruz" are the same child.
    if not p_confirm_new_person then
      select public.student_display_name(st.*) into v_clash
      from public.students st
      where st.school_id = v_school
        and st.deleted_at is null
        and st.status = 'active'
        and lower(regexp_replace(st.first_name, '\s+', ' ', 'g')) = lower(regexp_replace(v_first, '\s+', ' ', 'g'))
        and lower(regexp_replace(st.last_name,  '\s+', ' ', 'g')) = lower(regexp_replace(v_last,  '\s+', ' ', 'g'))
      limit 1;

      if v_clash is not null then
        raise exception
          '% is already on file at this school. Add them from the list instead, or confirm this is a different learner with the same name.',
          v_clash
          using errcode = '23505';
      end if;
    end if;

    -- No LRN. The registrar completes the record; a null LRN is the
    -- flag, and the Students directory already surfaces it.
    insert into public.students (school_id, first_name, last_name, sex)
    values (v_school, v_first, v_last, nullif(p_sex, ''))
    returning id into v_student;

    perform app.write_audit('students.create', 'students', v_student, null,
      jsonb_build_object('firstName', v_first, 'lastName', v_last,
                         'provisional', true, 'byTeacher', true));
  else
    -- A student id from another school simply is not found, which is
    -- the tenant check as well as the existence check.
    if not exists (
      select 1 from public.students st
      where st.id = v_student and st.school_id = v_school and st.deleted_at is null
    ) then
      raise exception 'no such learner at this school' using errcode = '42501';
    end if;
  end if;

  /* ---- 2. the YEAR enrolment --------------------------------------- */
  -- One per person per year (unique (student_id, academic_year_id)), so
  -- a learner already enrolled elsewhere in this year is REUSED. This
  -- is the line that keeps a learner in six subjects one person rather
  -- than six, which is exactly what V0 could not do.
  select e.id into v_enrol
  from public.enrollments e
  where e.student_id = v_student and e.academic_year_id = v_year;

  if v_enrol is null then
    insert into public.enrollments
      (school_id, student_id, academic_year_id, grade_level_id, section_id)
    values (v_school, v_student, v_year, v_level, v_section)
    returning id into v_enrol;
  end if;

  /* ---- 3. the CLASS enrolment -------------------------------------- */
  insert into public.class_enrollments (school_id, class_id, enrollment_id)
  values (v_school, p_class_id, v_enrol)
  on conflict (class_id, enrollment_id) do nothing
  returning id into v_ce;

  if v_ce is null then
    select ce.id into v_ce from public.class_enrollments ce
    where ce.class_id = p_class_id and ce.enrollment_id = v_enrol;
  else
    perform app.write_audit('class_enrollments.create', 'class_enrollments', v_ce, null,
      jsonb_build_object('classId', p_class_id, 'studentId', v_student));
  end if;

  return v_ce;
end;
$fn$;

comment on function public.add_learner_to_my_class is
  'Enrols a learner in a class the CALLER teaches. Reuses the person and '
  'their year enrolment when they exist; creates a provisional student '
  '(no LRN) only when nobody by that name is on file. Refuses a '
  'same-name match unless explicitly confirmed.';

-- ------------------------------------------------------------
-- remove_learner_from_my_class
-- ------------------------------------------------------------
-- Removes the CLASS enrolment and nothing else. Never the person, never
-- their year enrolment, never another subject's roster. A teacher
-- correcting "this learner is not in my class" must not be able to
-- withdraw a child from the school by accident.
--
-- Refuses outright once anything has been scored: deleting the class
-- enrolment cascades the scores with it, and losing a term of recorded
-- work to a misclick is not a risk worth taking for a convenience.
create or replace function public.remove_learner_from_my_class(
  p_class_enrollment_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_class uuid;
  v_name  text;
  v_marks int;
begin
  select ce.class_id, public.student_display_name(st.*) into v_class, v_name
  from public.class_enrollments ce
  join public.enrollments e on e.id = ce.enrollment_id
  join public.students st on st.id = e.student_id
  where ce.id = p_class_enrollment_id
    and ce.school_id = app.current_school_id();

  if v_class is null then
    raise exception 'no such learner in this class' using errcode = '42501';
  end if;
  if not app.teaches_class(v_class) then
    raise exception 'you do not teach this class' using errcode = '42501';
  end if;

  select count(*) into v_marks
  from public.assessment_scores sc
  where sc.class_enrollment_id = p_class_enrollment_id and sc.raw_score is not null;

  if v_marks > 0 then
    raise exception
      '% has % recorded score(s) in this class. Removing them would delete that work — ask the registrar to transfer them instead.',
      v_name, v_marks
      using errcode = '23503';
  end if;

  delete from public.class_enrollments where id = p_class_enrollment_id;

  perform app.write_audit('class_enrollments.delete', 'class_enrollments',
    p_class_enrollment_id,
    jsonb_build_object('classId', v_class, 'learner', v_name), null);
end;
$fn$;

comment on function public.remove_learner_from_my_class is
  'Removes a learner from ONE class. Never deletes the person or their '
  'year enrolment. Refuses once any score has been recorded.';

revoke all on function
  rds.my_class_roster(uuid), public.my_class_roster(uuid),
  public.add_learner_to_my_class(uuid, uuid, text, text, text, boolean),
  public.remove_learner_from_my_class(uuid)
  from public, anon;

grant execute on function
  public.my_class_roster(uuid),
  public.add_learner_to_my_class(uuid, uuid, text, text, text, boolean),
  public.remove_learner_from_my_class(uuid)
  to authenticated;
