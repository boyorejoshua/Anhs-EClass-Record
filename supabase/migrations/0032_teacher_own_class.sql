-- 0032 — A teacher can create the class they themselves teach.
--
-- Asked for three separate times against the live site, and the third
-- time settled it. The earlier answer — registrar/admin only, migration
-- 0029 — was right about DATA INTEGRITY and wrong about AUTHORITY, and
-- those are two different questions that got answered as one.
--
-- The integrity worry was duplicate sections from typos: "PEARL",
-- "Pearl" and "pearl" becoming three Grade 7 sections. But that is
-- already handled, and not by the permission — `create_section` (0029)
-- lower-cases and compares before inserting, and the table carries a
-- unique key on (academic_year_id, grade_level_id, name). Gating the
-- act behind the registrar never was what prevented the duplicate.
--
-- What is left is authority, and on a DepEd class record the subject
-- teacher IS the authority for their own class. They are the one who
-- signs it. Making them wait for a registrar to click a button before
-- they can enter a single mark is the friction that keeps the school on
-- Excel — which is the entire thing this product exists to end.
--
-- ── WHAT A TEACHER STILL CANNOT DO ────────────────────────────────────
--
-- The boundary moves; it does not disappear.
--
--   · The class is ALWAYS theirs. primary_teacher_id is forced to
--     app.current_user_id() and is not a parameter, so "create a class
--     for somebody else" is not a request this function can express.
--   · They cannot become the section's ADVISER. Creating a class in
--     Pearl must not make you Pearl's adviser — that carries the right
--     to read every subject's grades for that section (0030), and it is
--     the registrar's appointment to make. `adviser_user_id` is left
--     exactly as it was found.
--   · They cannot invent a SUBJECT or a GRADE LEVEL. Those are the
--     school's curriculum, set up once with Mendtrix, and a teacher
--     typing "Math 10" next to an existing "Mathematics 10" is a real
--     duplicate this cannot dedupe by lower-casing.
--   · They cannot ADMIT a learner. Enrolment stays registrar work
--     (0025); the roster fills from the section's existing enrolment.

-- ------------------------------------------------------------
-- The permission
-- ------------------------------------------------------------
insert into public.permissions (code, category, description) values
  ('classes.create.own', 'classes', 'Create a class they teach themselves')
on conflict (code) do nothing;

-- Granted to every teaching role, in every tenant. Written as a select
-- over public.roles rather than as literal ids so it applies to schools
-- provisioned after this migration too.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'classes.create.own'
from public.roles r
where r.code in ('teacher', 'adviser')
on conflict do nothing;

-- ------------------------------------------------------------
-- rds.my_class_setup_options — what a teacher's own form offers
-- ------------------------------------------------------------
-- Distinct from `section_setup_options` (0029), which is the
-- registrar's: that one offers a TEACHER dropdown, because a registrar
-- assigns somebody else. This one has no teacher field at all — the
-- answer is always "you" — and it exposes existing section names so the
-- form can steer a teacher onto the section that already exists instead
-- of letting them type a near-miss.
create or replace function rds.my_class_setup_options(p_year_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_result jsonb;
begin
  if not app.has_permission('classes.create.own') then
    raise exception 'not permitted to create your own classes' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'gradeLevels', coalesce((
      select jsonb_agg(jsonb_build_object('id', gl.id, 'name', gl.name, 'ordinal', gl.ordinal)
                       order by gl.ordinal)
      from public.grade_levels gl
      where gl.school_id = v_school and gl.is_active
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title)
                       order by s.title)
      from public.subjects s
      where s.school_id = v_school and s.is_active
    ), '[]'::jsonb),
    -- Every section in the year, so the form can autocomplete rather
    -- than invite a fresh spelling of one that exists.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sec.id, 'name', sec.name,
               'gradeLevelId', sec.grade_level_id, 'gradeLevel', gl.name,
               'learnerCount', (select count(*) from public.enrollments e
                                where e.section_id = sec.id
                                  and e.status in ('enrolled', 'transferred_in')))
             order by gl.ordinal, sec.name)
      from public.sections sec
      join public.grade_levels gl on gl.id = sec.grade_level_id
      where sec.school_id = v_school and sec.academic_year_id = p_year_id
    ), '[]'::jsonb),
    -- What they already teach, so the form can say "you already teach
    -- this" rather than silently resolving to the existing class.
    'myClasses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cl.id, 'sectionId', cl.section_id, 'subjectId', cl.subject_id))
      from public.classes cl
      where cl.school_id = v_school and cl.academic_year_id = p_year_id
        and cl.primary_teacher_id = app.current_user_id()
        and cl.status = 'active'
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canCreateOwn', app.has_permission('classes.create.own')
    )
  ) into v_result;

  return v_result;
end;
$fn$;

create or replace function public.my_class_setup_options(p_year_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $fn$ select rds.my_class_setup_options(p_year_id) $fn$;

-- ------------------------------------------------------------
-- create_my_class
-- ------------------------------------------------------------
-- Takes a section EITHER by id (picked from the list) OR by name (typed
-- because it does not exist yet). Both paths converge on the same
-- case-insensitive lookup, so typing "pearl" when "Pearl" exists finds
-- Pearl rather than creating a second one — the invariant 0029 was
-- protecting, now enforced by the lookup instead of by the permission.
create or replace function public.create_my_class(
  p_academic_year_id uuid,
  p_subject_id       uuid,
  p_section_id       uuid default null,
  p_grade_level_id   uuid default null,
  p_section_name     text default null,
  p_schedule_note    text default null,
  p_room             text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school  uuid := app.current_school_id();
  v_self    uuid := app.current_user_id();
  v_section uuid := p_section_id;
  v_name    text := nullif(btrim(p_section_name), '');
  v_id      uuid;
  v_existed boolean := false;
  v_owner   uuid;
begin
  if not app.has_permission('classes.create.own') then
    raise exception 'not permitted to create classes' using errcode = '42501';
  end if;

  -- The year must be this school's. Without this the insert still fails
  -- — a foreign key catches it — but the teacher is shown
  -- "violates foreign key constraint sections_school_id_academic_year_id_fkey",
  -- which is a sentence written for a database, not a person.
  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.school_id = v_school
  ) then
    raise exception 'that school year does not belong to this school' using errcode = '42501';
  end if;

  -- The subject must be one the school actually offers. A teacher may
  -- not invent curriculum, and this is also the tenant check: a subject
  -- id from another school simply is not found.
  if not exists (
    select 1 from public.subjects s
    where s.id = p_subject_id and s.school_id = v_school and s.is_active
  ) then
    raise exception 'that subject is not offered by this school' using errcode = '42501';
  end if;

  /* ---- resolve the section ---------------------------------------- */
  if v_section is null then
    if p_grade_level_id is null or v_name is null then
      raise exception 'choose a section, or give a grade level and a section name'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.grade_levels gl
      where gl.id = p_grade_level_id and gl.school_id = v_school and gl.is_active
    ) then
      raise exception 'that grade level is not used by this school' using errcode = '42501';
    end if;

    -- Case-insensitive, so "pearl" lands on the existing "Pearl".
    select sec.id into v_section
    from public.sections sec
    where sec.academic_year_id = p_academic_year_id
      and sec.grade_level_id = p_grade_level_id
      and lower(sec.name) = lower(v_name);

    if v_section is null then
      -- adviser_user_id deliberately left null: teaching a class in a
      -- section is not the same authority as advising it.
      insert into public.sections
        (school_id, academic_year_id, grade_level_id, name, adviser_user_id)
      values (v_school, p_academic_year_id, p_grade_level_id, v_name, null)
      returning id into v_section;

      perform app.write_audit('sections.create', 'sections', v_section, null,
        jsonb_build_object('name', v_name, 'gradeLevelId', p_grade_level_id,
                           'createdByTeacher', true));
    end if;
  else
    if not exists (
      select 1 from public.sections sec
      where sec.id = v_section and sec.school_id = v_school
        and sec.academic_year_id = p_academic_year_id
    ) then
      raise exception 'no such section in this school year' using errcode = '42501';
    end if;
  end if;

  /* ---- the class --------------------------------------------------- */
  insert into public.classes
    (school_id, academic_year_id, section_id, subject_id, primary_teacher_id,
     schedule_note, room)
  -- v_self, NOT a parameter. A teacher creates their OWN class.
  values (v_school, p_academic_year_id, v_section, p_subject_id, v_self,
          nullif(btrim(p_schedule_note), ''), nullif(btrim(p_room), ''))
  on conflict (academic_year_id, section_id, subject_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Somebody already teaches this subject in this section. Silently
    -- handing the teacher a class that belongs to a colleague would let
    -- them open a gradebook they have no business in, so say whose it
    -- is instead — and hand back their own class unchanged if it is
    -- already theirs, which keeps the form idempotent.
    select cl.id, cl.primary_teacher_id into v_id, v_owner
    from public.classes cl
    where cl.academic_year_id = p_academic_year_id
      and cl.section_id = v_section and cl.subject_id = p_subject_id;

    if v_owner is distinct from v_self then
      raise exception
        'that subject is already taught in this section by %. Ask the registrar to reassign it.',
        coalesce((select concat_ws(' ', u.first_name, u.last_name)
                  from public.users u where u.id = v_owner), 'another teacher')
        using errcode = '23505';
    end if;
    v_existed := true;
  end if;

  -- Fill the roster from the section's enrolment. The whole reason a
  -- class is keyed to a section: nobody types a student list twice.
  perform public.sync_class_roster(v_id);

  if not v_existed then
    perform app.write_audit('classes.create', 'classes', v_id, null,
      jsonb_build_object('sectionId', v_section, 'subjectId', p_subject_id,
                         'selfServe', true));
  end if;

  return v_id;
end;
$fn$;

comment on function public.create_my_class is
  'Creates a class the CALLER teaches, in a new or existing section. '
  'primary_teacher_id is forced to the caller and is not a parameter. '
  'Never sets the section adviser, and never creates a subject.';

revoke all on function
  rds.my_class_setup_options(uuid), public.my_class_setup_options(uuid),
  public.create_my_class(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon;

grant execute on function
  public.my_class_setup_options(uuid),
  public.create_my_class(uuid, uuid, uuid, uuid, text, text, text)
  to authenticated;
