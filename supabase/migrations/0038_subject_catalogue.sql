-- 0038 — The school's subject list, editable by its administrator.
--
-- A teacher imported their real GMRC workbook and was told:
--
--   "GMRC" is not in the subject list for this school. Choose the
--   matching subject below, or ask an administrator to add it.
--
-- The second half was false. There was no `create_subject` anywhere —
-- no RPC, no permission, no screen, nothing in the DataSource. The
-- administrator had no way to add it either. Subjects existed only
-- because they were seeded, and the eight seeded ones are all Grade 10.
--
-- That is the third message in this build telling somebody to do a
-- thing the product gives them no way to do (the empty class roster and
-- the import's "Choose one" with no chooser were the first two). The
-- pattern is worth naming: A MESSAGE THAT PRESCRIBES AN ACTION IS A
-- PROMISE THAT THE ACTION EXISTS.
--
-- `ClassesAndSections` states the assumption that left it out —
-- subjects are "a one-time curriculum/onboarding step, not something a
-- registrar does mid-term". Wrong on first contact with a real school:
-- GMRC, Values Education and every Senior High subject are missing, and
-- a school adding an elective should not need us.
--
-- ── WHO OWNS THIS, AND WHY IT MATTERS MORE THAN IT LOOKS ──────────────
--
-- The administrator, at the school's own direction: the registrar
-- creates sections, the administrator holds school-wide configuration.
--
-- It is not a plain CRUD form. `subjects.subject_category_id` is NOT
-- NULL and the category carries the grading scheme, so whoever adds a
-- subject is deciding HOW IT IS GRADED — GMRC under "Core Subject" is
-- 20/50/30, under "MAPEH / EPP-TLE" it is 20/60/20. The form therefore
-- names the weights beside each category rather than showing a bare
-- dropdown of codes.
--
-- ── DEACTIVATE, NEVER DELETE ──────────────────────────────────────────
--
-- `classes.subject_id` references this table ON DELETE RESTRICT, and a
-- deleted subject would orphan every grade ever recorded under it. A
-- subject the school has stopped teaching is `is_active = false`: it
-- disappears from the pickers that create new work and stays wherever
-- it is already referenced, which is what history requires.

begin;

-- ------------------------------------------------------------
-- The permission
-- ------------------------------------------------------------
insert into public.permissions (code, category, description) values
  ('subjects.write', 'school', 'Add and retire subjects in the school''s catalogue')
on conflict (code) do nothing;

-- Administrator only, in every tenant. Written as a select over
-- public.roles rather than literal ids so schools provisioned after
-- this migration get it too.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'subjects.write'
from public.roles r
where r.code = 'school_admin'
on conflict do nothing;

-- ------------------------------------------------------------
-- rds.subject_catalogue — the list, and what may be chosen for a new one
-- ------------------------------------------------------------
create or replace function rds.subject_catalogue()
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
  -- Readable by anyone who may set up a class: the registrar needs to
  -- see the list to know whether to ask for an addition. Writing is a
  -- separate permission, reported below so the screen can hide a form
  -- that would only fail.
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
               -- The weights the category's scheme actually applies, so
               -- the person choosing can see what they are choosing.
               -- Null when the category has no scheme, which is itself
               -- worth showing rather than hiding.
               -- `weight` is stored as a whole percentage (20.000, not
               -- 0.20), so it prints as-is. Multiplying by 100 gave
               -- "WW 2000%", which is the sort of thing that only shows
               -- up when you run the query against real rows.
               'weights', (
                 select string_agg(gc.code || ' ' || round(gc.weight) || '%', ' · '
                                   order by gc.ordinal)
                 from public.grade_components gc
                 where gc.grading_scheme_id = sc.grading_scheme_id
                   and gc.parent_component_id is null))
             order by sc.ordinal, sc.name)
      from public.subject_categories sc
      where sc.school_id = v_school), '[]'::jsonb),

    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',         s.id,
               'code',       s.code,
               'title',      s.title,
               'categoryId', s.subject_category_id,
               'category',   sc.name,
               'units',      s.units,
               'isActive',   s.is_active,
               -- Whether retiring it would strand anything. Shown, not
               -- enforced: a subject with classes can still be retired,
               -- it just stops being offered for new ones.
               'classCount', (select count(*) from public.classes c
                              where c.subject_id = s.id))
             order by lower(s.title))
      from public.subjects s
      join public.subject_categories sc on sc.id = s.subject_category_id
      where s.school_id = v_school), '[]'::jsonb),

    'permissions', jsonb_build_object(
      'canWrite', app.has_permission('subjects.write'))
  );
end;
$fn$;

comment on function rds.subject_catalogue is
  'The school''s subjects and the categories a new one may be filed '
  'under, with each category''s grading weights — because choosing the '
  'category is choosing how the subject is graded.';

-- ------------------------------------------------------------
-- public.create_subject
-- ------------------------------------------------------------
create or replace function public.create_subject(
  p_code        text,
  p_title       text,
  p_category_id uuid,
  p_units       numeric default null
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

  -- The category must belong to THIS school. Without the check a
  -- crafted id would file a subject under another tenant's grading
  -- scheme, and the composite foreign key's own error names a
  -- constraint rather than telling anyone what went wrong.
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

  return v_id;
end;
$fn$;

comment on function public.create_subject is
  'Adds a subject to this school''s catalogue. The category decides the '
  'grading weights, so it is required rather than defaulted.';

-- ------------------------------------------------------------
-- public.set_subject_active — retire, or bring back
-- ------------------------------------------------------------
create or replace function public.set_subject_active(
  p_subject_id uuid,
  p_is_active  boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_was    boolean;
begin
  if not app.has_permission('subjects.write') then
    raise exception 'not permitted to change a subject' using errcode = '42501';
  end if;

  select s.is_active into v_was
  from public.subjects s
  where s.id = p_subject_id and s.school_id = v_school;

  if v_was is null then
    raise exception 'No such subject in this school.' using errcode = 'P0002';
  end if;
  if v_was = p_is_active then
    return;   -- already there; not an error, and not worth an audit row
  end if;

  update public.subjects
     set is_active = p_is_active
   where id = p_subject_id and school_id = v_school;

  perform app.write_audit(
    case when p_is_active then 'restore' else 'retire' end,
    'subject', p_subject_id,
    jsonb_build_object('isActive', v_was),
    jsonb_build_object('isActive', p_is_active));
end;
$fn$;

comment on function public.set_subject_active is
  'Retires a subject or brings it back. Never deletes: classes '
  'reference subjects ON DELETE RESTRICT, and a removed subject would '
  'orphan every grade recorded under it.';

grant execute on function
  rds.subject_catalogue(),
  public.create_subject(text, text, uuid, numeric),
  public.set_subject_active(uuid, boolean)
to authenticated;

-- The client only ever reaches `public`; `rds` is the implementation.
create or replace function public.subject_catalogue()
returns jsonb language sql stable as $fn$ select rds.subject_catalogue() $fn$;

grant execute on function public.subject_catalogue() to authenticated;

commit;
