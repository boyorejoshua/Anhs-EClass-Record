-- 0040 — Which subjects are taught at which grade: the curriculum map.
--
-- The school asked where to enter a subject for a particular grade,
-- "since we have grade7 to 12 and it has different subject". The honest
-- answer was: nowhere. A subject carried code, title, category and
-- units. The grade only ever entered through the CLASS —
-- `classes.section_id` → `sections.grade_level_id` — so "Mathematics
-- 10" was a subject whose NAME implied Grade 10 while the database knew
-- nothing about it.
--
-- That holds for eight seeded subjects. It does not hold for a school
-- running Grades 7 to 12:
--
--   · roughly sixty subjects in one flat dropdown; and
--   · `AddClass` filtered that list only by "not already in this
--     section", so creating a GRADE 7 class cheerfully offered
--     "Mathematics 10" — and accepted it.
--
-- ── THE TABLE FOR THIS ALREADY EXISTED ────────────────────────────────
--
-- `public.grade_level_subjects (school_id, academic_year_id,
-- grade_level_id, subject_id)` has been in the schema since migration
-- 0003, described in its own comment as "the curriculum map", with RLS,
-- grants and four seeded rows.
--
-- NOTHING HAS EVER READ IT. Not one function, not one screen. It is the
-- second structure in this build found seeded and unused — the
-- `school.config.*` permissions were the first, and they turned out to
-- be exactly what School Setup needed. This is the same story.
--
-- The first draft of this migration added a `grade_level_id` column to
-- `subjects` instead, which would have been a worse duplicate of a
-- concept already modelled properly. The map wins on both counts:
--
--   · ONE subject row can be taught at MANY grades. "Mathematics" maps
--     to 7, 8, 9 and 10 rather than becoming MATH7, MATH8, MATH9 and
--     MATH10 — four rows describing one subject and four chances for
--     them to drift.
--   · It is PER ACADEMIC YEAR. A curriculum change next June is new
--     rows for the new year, and last year's SF10 still reads the way
--     it was actually taught.
--
-- ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────
--
-- It does not constrain a class. A class takes its grade from its
-- section, which is the only place a grade can be authoritative — a
-- section IS a grade level and a name. The map narrows a dropdown and
-- labels a list. Enforcing it in `create_class` would be a second,
-- weaker source of truth for a fact the section already holds, and
-- would refuse the school deliberately running a Grade 9 subject for a
-- Grade 10 retake group.
--
-- A subject mapped to NO grade level is offered everywhere. That is the
-- honest reading of an empty map — and it is what keeps every existing
-- class working the moment this ships, before anybody has entered a
-- curriculum.

begin;

-- ------------------------------------------------------------
-- rds.subject_catalogue — subjects, and where each is taught
-- ------------------------------------------------------------
-- Takes a year, because the curriculum map is per year. `subject_
-- catalogue()` from 0038 is dropped below rather than kept as an
-- overload: two signatures differing by one defaulted argument make an
-- unqualified call ambiguous.
create or replace function rds.subject_catalogue(p_year_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
begin
  if v_school is null then
    raise exception 'no school in session' using errcode = '42501';
  end if;
  if not (app.has_permission('subjects.write')
          or app.has_permission('classes.assign')
          or app.has_permission('school.config.read')) then
    raise exception 'not permitted to view the subject list' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',   sc.id,
               'code', sc.code,
               'name', sc.name,
               -- `weight` is stored as a whole percentage (20.000, not
               -- 0.20), so it prints as-is.
               'weights', (
                 select string_agg(gc.code || ' ' || round(gc.weight) || '%', ' · '
                                   order by gc.ordinal)
                 from public.grade_components gc
                 where gc.grading_scheme_id = sc.grading_scheme_id
                   and gc.parent_component_id is null))
             order by sc.ordinal, sc.name)
      from public.subject_categories sc
      where sc.school_id = v_school), '[]'::jsonb),

    -- Where a subject may be taught. Disambiguated the same way the
    -- import's picker is: where two levels share a name, the code goes
    -- on the end so they can be told apart.
    'gradeLevels', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.label, 'ordinal', g.ordinal)
                       order by g.ordinal, g.code)
      from (
        select gl.id, gl.ordinal, gl.code,
               case when count(*) over (partition by app.normalise_name(gl.name)) > 1
                    then gl.name || ' · ' || gl.code
                    else gl.name end as label
        from public.grade_levels gl
        where gl.school_id = v_school and gl.is_active
      ) g), '[]'::jsonb),

    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',         s.id,
               'code',       s.code,
               'title',      s.title,
               'categoryId', s.subject_category_id,
               'category',   sc.name,
               'units',      s.units,
               'isActive',   s.is_active,
               'classCount', (select count(*) from public.classes c
                              where c.subject_id = s.id),
               -- The map, for THIS year. Empty means "every grade",
               -- which is what an unmapped subject honestly is.
               'gradeLevelIds', coalesce((
                 select jsonb_agg(gls.grade_level_id order by gl2.ordinal)
                 from public.grade_level_subjects gls
                 join public.grade_levels gl2 on gl2.id = gls.grade_level_id
                 where gls.subject_id = s.id
                   and gls.academic_year_id = p_year_id), '[]'::jsonb),
               'gradeLevels', (
                 select string_agg(gl2.name, ', ' order by gl2.ordinal)
                 from public.grade_level_subjects gls
                 join public.grade_levels gl2 on gl2.id = gls.grade_level_id
                 where gls.subject_id = s.id
                   and gls.academic_year_id = p_year_id))
             order by lower(s.title))
      from public.subjects s
      join public.subject_categories sc on sc.id = s.subject_category_id
      where s.school_id = v_school), '[]'::jsonb),

    'permissions', jsonb_build_object(
      'canWrite', app.has_permission('subjects.write'))
  );
end;
$fn$;

drop function if exists rds.subject_catalogue();
drop function if exists public.subject_catalogue();

create or replace function public.subject_catalogue(p_year_id uuid)
returns jsonb language sql stable as $fn$ select rds.subject_catalogue(p_year_id) $fn$;

comment on function rds.subject_catalogue(uuid) is
  'The school''s subjects, the categories they may be filed under, and '
  'the grade levels each is taught at in the given year.';

-- ------------------------------------------------------------
-- public.set_subject_grade_levels — the whole set, per year
-- ------------------------------------------------------------
-- A whole-set write, like `set_user_roles` in 0031: the caller sends
-- what the answer should BE, not a delta. Add-one/remove-one pairs
-- drift the moment two people edit the same subject, and there is no
-- sensible "partially applied" state for a curriculum.
create or replace function public.set_subject_grade_levels(
  p_subject_id      uuid,
  p_year_id         uuid,
  p_grade_level_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_before jsonb;
begin
  if not app.has_permission('subjects.write') then
    raise exception 'not permitted to change the curriculum' using errcode = '42501';
  end if;

  if not exists (select 1 from public.subjects s
                 where s.id = p_subject_id and s.school_id = v_school) then
    raise exception 'No such subject in this school.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.academic_years y
                 where y.id = p_year_id and y.school_id = v_school) then
    raise exception 'No such school year.' using errcode = 'P0002';
  end if;

  -- Every id must be this school's. A crafted one would otherwise map a
  -- subject onto another tenant's grade level.
  if exists (
    select 1 from unnest(coalesce(p_grade_level_ids, '{}')) gid
    where not exists (select 1 from public.grade_levels gl
                      where gl.id = gid and gl.school_id = v_school)
  ) then
    raise exception 'One of those grade levels does not belong to this school.'
      using errcode = '23503';
  end if;

  select jsonb_agg(gls.grade_level_id) into v_before
  from public.grade_level_subjects gls
  where gls.subject_id = p_subject_id and gls.academic_year_id = p_year_id;

  delete from public.grade_level_subjects
   where subject_id = p_subject_id
     and academic_year_id = p_year_id
     and school_id = v_school;

  insert into public.grade_level_subjects
    (school_id, academic_year_id, grade_level_id, subject_id)
  select v_school, p_year_id, gid, p_subject_id
  from unnest(coalesce(p_grade_level_ids, '{}')) gid
  on conflict do nothing;

  perform app.write_audit('update', 'subject_curriculum', p_subject_id,
    jsonb_build_object('gradeLevelIds', v_before),
    jsonb_build_object('gradeLevelIds', to_jsonb(coalesce(p_grade_level_ids, '{}')),
                       'academicYearId', p_year_id));
end;
$fn$;

-- ------------------------------------------------------------
-- public.create_subject — set the curriculum at the same time
-- ------------------------------------------------------------
create or replace function public.create_subject(
  p_code            text,
  p_title           text,
  p_category_id     uuid,
  p_units           numeric  default null,
  p_year_id         uuid     default null,
  p_grade_level_ids uuid[]   default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_title  text := btrim(coalesce(p_title, ''));
  v_id     uuid;
  v_clash  text;
begin
  if not app.has_permission('subjects.write') then
    raise exception 'not permitted to add a subject' using errcode = '42501';
  end if;
  if v_code = '' then
    raise exception 'A subject needs a code.' using errcode = '23514';
  end if;
  if v_title = '' then
    raise exception 'A subject needs a title.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.subject_categories sc
    where sc.id = p_category_id and sc.school_id = v_school
  ) then
    raise exception 'That subject category does not belong to this school.'
      using errcode = '23503';
  end if;

  -- Duplicate guard in the school's own words. `unique (school_id,
  -- code)` would catch the exact repeat, but not "GMRC" against "gmrc",
  -- and a registrar reading a raw constraint name learns nothing.
  select s.code || ' — ' || s.title into v_clash
  from public.subjects s
  where s.school_id = v_school
    and (app.normalise_name(s.code) = app.normalise_name(v_code)
         or app.normalise_name(s.title) = app.normalise_name(v_title));

  if v_clash is not null then
    raise exception 'This school already has that subject (%).', v_clash
      using errcode = '23505';
  end if;

  insert into public.subjects (school_id, code, title, subject_category_id, units)
  values (v_school, v_code, v_title, p_category_id, p_units)
  returning id into v_id;

  perform app.write_audit('create', 'subject', v_id, null,
    jsonb_build_object('code', v_code, 'title', v_title,
                       'subjectCategoryId', p_category_id, 'units', p_units));

  -- The curriculum, if the caller said. Reuses the setter so the
  -- validation and the audit row are written in exactly one place.
  if p_year_id is not null and p_grade_level_ids is not null then
    perform public.set_subject_grade_levels(v_id, p_year_id, p_grade_level_ids);
  end if;

  return v_id;
end;
$fn$;

-- 0038's four-argument signature would otherwise stay callable beside
-- the new one, and a four-argument call would be ambiguous between them.
drop function if exists public.create_subject(text, text, uuid, numeric);

-- ------------------------------------------------------------
-- The class picker learns which grade each subject is for
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
      -- `gradeLevelIds` added by 0040, from the curriculum map for this
      -- year. AddClass filtered subjects only by "not already in this
      -- section", so a Grade 7 section was offered Mathematics 10 — it
      -- cannot narrow what it is not told. An EMPTY array means the
      -- subject is unmapped and therefore offered at every grade.
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'code', s.code, 'title', s.title,
               'gradeLevelIds', coalesce((
                 select jsonb_agg(gls.grade_level_id)
                 from public.grade_level_subjects gls
                 where gls.subject_id = s.id
                   and gls.academic_year_id = p_year_id), '[]'::jsonb))
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

-- ------------------------------------------------------------
-- And so does the teacher's own class form
-- ------------------------------------------------------------
-- Same defect, same fix, one function further along. `AddMyClass`
-- (0032) offers every active subject in the school; a Grade 7 adviser
-- creating their own class is shown Mathematics 10 alongside
-- everything else. Derived from 0032 verbatim — only the `subjects`
-- block below differs.
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
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'code', s.code, 'title', s.title,
               'gradeLevelIds', coalesce((
                 select jsonb_agg(gls.grade_level_id)
                 from public.grade_level_subjects gls
                 where gls.subject_id = s.id
                   and gls.academic_year_id = p_year_id), '[]'::jsonb))
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

grant execute on function
  rds.subject_catalogue(uuid),
  public.subject_catalogue(uuid),
  public.create_subject(text, text, uuid, numeric, uuid, uuid[]),
  public.set_subject_grade_levels(uuid, uuid, uuid[])
to authenticated;

commit;
