-- 0029 — A registrar can create a section and a class.
--
-- The gap this closes: nobody could. `classes.assign` has existed on
-- the registrar and admin roles since the permission catalogue was
-- seeded, and `import_commit` (0026) checks it — but nothing else ever
-- called it, and no screen ever offered to create a class outright. The
-- only way a class came to exist was demo seed data, or an import that
-- happened to name one. A school with no workbook yet had no way to
-- start at all.
--
-- SCOPE, DELIBERATELY NARROW. This adds two things: a SECTION (grade
-- level + name + adviser, for a school year) and a CLASS (section +
-- subject + teacher). It does NOT add creating a grade level, a
-- subject, an academic year, or a user account — those are one-time
-- curriculum/onboarding facts a school sets up once with Mendtrix, not
-- a per-term operational task, and building them here would be a much
-- larger, separate piece (docs/13-onboarding-and-discovery.md already
-- names it). This is the part that recurs every term: which sections
-- exist, and which classes run in them.
--
-- Same two-function shape as the Import Center, for the same reason:
-- a REAL screen, not a stub, needs identity resolved from names typed
-- into a form (grade level, adviser, subject, teacher) before it can
-- write — so this gets an "options" reader the form populates from,
-- and plain write RPCs that take ids only, never free text.

-- ------------------------------------------------------------
-- rds.section_setup_options — what a "create section/class" form offers
-- ------------------------------------------------------------
create or replace function rds.section_setup_options(p_year_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'gradeLevels', coalesce((
      select jsonb_agg(jsonb_build_object('id', gl.id, 'name', gl.name, 'ordinal', gl.ordinal)
                       order by gl.ordinal)
      from public.grade_levels gl
      where gl.school_id = app.current_school_id() and gl.is_active
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'title', s.title)
                       order by s.title)
      from public.subjects s
      where s.school_id = app.current_school_id() and s.is_active
    ), '[]'::jsonb),
    -- Anyone holding a teaching role — 'teacher' or 'adviser' — is a
    -- candidate for either dropdown. A section's adviser and a class's
    -- teacher are the same pool of people; DO 015's "a teacher can also
    -- advise" is exactly why this is not two separate lists.
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id,
               'displayName', concat_ws(', ', u.last_name, u.first_name))
             order by u.last_name, u.first_name)
      from (
        select distinct u.id, u.last_name, u.first_name
        from public.users u
        join public.user_roles ur on ur.user_id = u.id
        join public.roles r on r.id = ur.role_id
        where u.school_id = app.current_school_id()
          and u.status = 'active'
          and r.code in ('teacher', 'adviser')
      ) u
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sec.id, 'name', sec.name,
               'gradeLevelId', sec.grade_level_id, 'gradeLevel', gl.name,
               'adviserUserId', sec.adviser_user_id,
               'adviserName', nullif(concat_ws(', ', au.last_name, au.first_name), ''),
               'room', sec.room, 'capacity', sec.capacity,
               'classCount', (select count(*) from public.classes cl
                              where cl.section_id = sec.id and cl.status = 'active'))
             order by gl.ordinal, sec.name)
      from public.sections sec
      join public.grade_levels gl on gl.id = sec.grade_level_id
      left join public.users au on au.id = sec.adviser_user_id
      where sec.academic_year_id = p_year_id
        and sec.school_id = app.current_school_id()
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cl.id, 'sectionId', cl.section_id,
               'subjectId', cl.subject_id, 'subject', sub.title,
               'teacherId', cl.primary_teacher_id,
               'teacherName', nullif(concat_ws(', ', tu.last_name, tu.first_name), ''))
             order by sub.title)
      from public.classes cl
      join public.subjects sub on sub.id = cl.subject_id
      left join public.users tu on tu.id = cl.primary_teacher_id
      where cl.academic_year_id = p_year_id
        and cl.school_id = app.current_school_id()
        and cl.status = 'active'
    ), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'canAssign', app.has_permission('classes.assign')
    )
  )
$$;

create or replace function public.section_setup_options(p_year_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp
as $$ select rds.section_setup_options(p_year_id) $$;

-- ------------------------------------------------------------
-- create_section
-- ------------------------------------------------------------
-- The registrar names the section directly — never inferred from a
-- workbook string, never auto-created by anything else. That is what
-- makes "no duplicate section from a typo" an invariant rather than a
-- hope: the ONLY path to a new section is a person typing its name
-- here and confirming it.
create or replace function public.create_section(
  p_academic_year_id uuid,
  p_grade_level_id   uuid,
  p_name             text,
  p_adviser_user_id  uuid default null,
  p_room             text default null,
  p_capacity         int  default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid := app.current_school_id();
  v_id     uuid;
  v_name   text := nullif(btrim(p_name), '');
begin
  if not app.has_permission('classes.assign') then
    raise exception 'not permitted to create sections' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'a section needs a name' using errcode = '22023';
  end if;

  -- The unique constraint (academic_year_id, grade_level_id, name) is
  -- what actually prevents a duplicate; this just turns the generic
  -- constraint-violation error into a sentence a registrar wrote for a
  -- registrar rather than a Postgres error code.
  if exists (
    select 1 from public.sections s
    where s.academic_year_id = p_academic_year_id
      and s.grade_level_id = p_grade_level_id
      and lower(s.name) = lower(v_name)
  ) then
    raise exception 'a section named "%" already exists for this grade level', v_name
      using errcode = '23505';
  end if;

  insert into public.sections
    (school_id, academic_year_id, grade_level_id, name, adviser_user_id, room, capacity)
  values (v_school, p_academic_year_id, p_grade_level_id, v_name, p_adviser_user_id, p_room, p_capacity)
  returning id into v_id;

  perform app.write_audit('sections.create', 'sections', v_id, null,
    jsonb_build_object('name', v_name, 'gradeLevelId', p_grade_level_id));

  return v_id;
end;
$$;

comment on function public.create_section is
  'Creates a section for a school year. The only path a section is '
  'created through — never inferred from an import or any other text.';

-- ------------------------------------------------------------
-- create_class
-- ------------------------------------------------------------
-- ON CONFLICT DO NOTHING, the same pattern import_commit already uses,
-- for the same reason: the unique key (year, section, subject) is what
-- actually prevents a duplicate, so two registrars submitting the same
-- form at once still produce one class, not a race.
create or replace function public.create_class(
  p_academic_year_id uuid,
  p_section_id       uuid,
  p_subject_id       uuid,
  p_teacher_user_id  uuid default null,
  p_schedule_note    text default null,
  p_room             text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school  uuid := app.current_school_id();
  v_id      uuid;
  v_existed boolean;
begin
  if not app.has_permission('classes.assign') then
    raise exception 'not permitted to create classes' using errcode = '42501';
  end if;

  insert into public.classes
    (school_id, academic_year_id, section_id, subject_id, primary_teacher_id,
     schedule_note, room)
  values (v_school, p_academic_year_id, p_section_id, p_subject_id, p_teacher_user_id,
          p_schedule_note, p_room)
  on conflict (academic_year_id, section_id, subject_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.classes
    where academic_year_id = p_academic_year_id
      and section_id = p_section_id and subject_id = p_subject_id;
    v_existed := true;
  end if;

  -- Auto-populate the roster from the section's current enrolment —
  -- the whole point of a class being keyed to a section, and the one
  -- thing that makes this better than a spreadsheet: nobody types a
  -- student list twice. sync_class_roster (0010) already does exactly
  -- this for the "class already exists, add anyone new" case.
  perform public.sync_class_roster(v_id);

  if not v_existed then
    perform app.write_audit('classes.create', 'classes', v_id, null,
      jsonb_build_object('sectionId', p_section_id, 'subjectId', p_subject_id));
  end if;

  return v_id;
end;
$$;

comment on function public.create_class is
  'Creates a class (section + subject + teacher) for a school year and '
  'auto-populates its roster from the section''s enrolment. Idempotent: '
  'the same section+subject resolves to the same class.';

grant execute on function
  rds.section_setup_options(uuid), public.section_setup_options(uuid),
  public.create_section(uuid, uuid, text, uuid, text, int),
  public.create_class(uuid, uuid, uuid, uuid, text, text)
to authenticated;

revoke execute on function
  rds.section_setup_options(uuid), public.section_setup_options(uuid),
  public.create_section(uuid, uuid, text, uuid, text, int),
  public.create_class(uuid, uuid, uuid, uuid, text, text)
from public, anon;
