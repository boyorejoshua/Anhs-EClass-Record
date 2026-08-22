-- ============================================================
-- 0014 · Application data sources
-- ============================================================
-- The screens call these, never tables directly. Each returns the exact
-- payload its screen needs, which keeps the client thin and — more
-- usefully — means the whole contract is verifiable in psql without a
-- browser or an HTTP layer.
--
-- Keys are camelCase because they cross into TypeScript unchanged. That
-- is deliberate: a mapping layer between SQL and TS is one more place
-- for a typo to survive both a typecheck and a test.
--
-- Every function is SECURITY INVOKER (the default), so RLS applies
-- exactly as it would to a direct query. These are a convenience, not a
-- way around the policies.

-- ------------------------------------------------------------
-- Fix: subject_categories.grading_scheme_id
-- ------------------------------------------------------------
-- docs/06-data-architecture.md describes this column as "the join point
-- between the curriculum and the grading engine", and rds.gradebook
-- depends on it — but migration 0003 never created it. The documented
-- model and the implemented one had drifted.
--
-- The resolution order is: the class's own override, else the subject
-- category's scheme. That is what makes DO 015's split possible without
-- setting a scheme on every class by hand: core subjects inherit
-- 20/50/30 and MAPEH/EPP-TLE inherit 20/60/20 from their category.
alter table public.subject_categories
  add column if not exists grading_scheme_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subject_categories_scheme_fk'
  ) then
    alter table public.subject_categories
      add constraint subject_categories_scheme_fk
      foreign key (school_id, grading_scheme_id)
      references public.grading_schemes (school_id, id) on delete restrict;
  end if;
end $$;

comment on column public.subject_categories.grading_scheme_id is
  'Default scheme for subjects in this category. classes.grading_scheme_id '
  'overrides it per class.';

-- ------------------------------------------------------------
-- rds.session_context() — who am I, where am I, what year is it
-- ------------------------------------------------------------
create or replace function rds.session_context()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'user', (
      select jsonb_build_object(
        'id',         u.id,
        'name',       trim(u.first_name || ' ' || u.last_name),
        'initials',   upper(left(u.first_name, 1) || left(u.last_name, 1)),
        'email',      u.email,
        'employeeId', u.employee_id,
        'schoolId',   u.school_id,
        'roles',      coalesce((
                        select jsonb_agg(r.code order by r.code)
                        from public.user_roles ur
                        join public.roles r on r.id = ur.role_id
                        where ur.user_id = u.id), '[]'::jsonb)
      )
      from public.users u
      where u.id = app.current_user_id()
    ),
    'school', (
      select jsonb_build_object(
        'id', s.id, 'code', upper(s.code), 'name', s.name,
        'govtSchoolId', s.govt_school_id,
        'region', s.region, 'division', s.division, 'district', s.district)
      from public.schools s where s.id = app.current_school_id()
    ),
    'academicYears', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',              y.id,
        'label',           y.label,
        'periodStructure', y.period_structure,
        'status',          y.status,
        'periods', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id, 'ordinal', p.ordinal, 'name', p.name,
            'shortName', p.short_name,
            'startDate', p.start_date, 'endDate', p.end_date,
            'status', p.status) order by p.ordinal)
          from public.academic_periods p where p.academic_year_id = y.id
        ), '[]'::jsonb)
      ) order by y.start_date desc)
      from public.academic_years y
      where y.school_id = app.current_school_id()
        and y.status in ('active', 'closed', 'planning')
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_object_agg(key, value)
      from public.school_settings where school_id = app.current_school_id()
    ), '{}'::jsonb)
  )
$$;

-- ------------------------------------------------------------
-- rds.my_classes(academic_year_id) — the teacher dashboard
-- ------------------------------------------------------------
-- Completeness is computed here rather than in the client so the
-- dashboard stays one round trip regardless of class count.
create or replace function rds.my_classes(p_year_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(c order by c ->> 'gradeLevel', c ->> 'section', c ->> 'subject'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',            cl.id,
      'gradeLevel',    gl.name,
      'section',       sec.name,
      'subject',       sub.title,
      'subjectCode',   sub.code,
      'scheduleNote',  cl.schedule_note,
      'room',          cl.room,
      'studentCount',  (select count(*) from public.class_enrollments ce
                        where ce.class_id = cl.id and ce.status = 'active'),
      -- per period, keyed by period id
      'status', coalesce((
        select jsonb_object_agg(p.id::text, coalesce(gs.status, 'draft'))
        from public.academic_periods p
        left join public.grade_submissions gs
          on gs.class_id = cl.id and gs.academic_period_id = p.id
        where p.academic_year_id = cl.academic_year_id
      ), '{}'::jsonb),
      'completeness', coalesce((
        select jsonb_object_agg(p.id::text, jsonb_build_object(
          'scored', coalesce(x.scored, 0), 'total', coalesce(x.total, 0)))
        from public.academic_periods p
        left join lateral (
          select
            count(*) filter (where s.raw_score is not null or s.is_excused) as scored,
            count(*) as total
          from public.class_enrollments ce
          cross join public.assessments a
          left join public.assessment_scores s
            on s.assessment_id = a.id and s.class_enrollment_id = ce.id
          where ce.class_id = cl.id and ce.status = 'active'
            and a.class_id = cl.id and a.academic_period_id = p.id
        ) x on true
        where p.academic_year_id = cl.academic_year_id
      ), '{}'::jsonb)
    ) as c
    from public.classes cl
    join public.sections sec    on sec.id = cl.section_id
    join public.grade_levels gl on gl.id = sec.grade_level_id
    join public.subjects sub    on sub.id = cl.subject_id
    where cl.academic_year_id = p_year_id
      and cl.status = 'active'
  ) t
$$;

-- ------------------------------------------------------------
-- rds.gradebook(class_id, period_id) — the screen that matters
-- ------------------------------------------------------------
-- Returns the scheme, the assessments, the roster and every score in a
-- single payload, shaped exactly as the grading engine consumes it.
create or replace function rds.gradebook(p_class_id uuid, p_period_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_scheme_id uuid;
  v_payload   jsonb;
begin
  -- Scheme comes from the class override, else the subject's category.
  select coalesce(cl.grading_scheme_id, sc.grading_scheme_id)
    into v_scheme_id
  from public.classes cl
  join public.subjects sub on sub.id = cl.subject_id
  join public.subject_categories sc on sc.id = sub.subject_category_id
  where cl.id = p_class_id;

  if v_scheme_id is null then
    raise exception 'no grading scheme resolves for class %', p_class_id
      using errcode = '23502';
  end if;

  select jsonb_build_object(
    'classId',  p_class_id,
    'periodId', p_period_id,

    'scheme', (
      select jsonb_build_object(
        'id',             g.id,
        'name',           g.name,
        'passMark',       g.pass_mark,
        'roundingMode',   g.rounding_mode,
        'decimalPlaces',  g.decimal_places,
        'components', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', comp.id, 'code', comp.code, 'name', comp.name,
            'weight', comp.weight, 'parentId', comp.parent_component_id,
            'ordinal', comp.ordinal) order by comp.ordinal)
          from public.grade_components comp
          where comp.grading_scheme_id = g.id
        ), '[]'::jsonb),
        -- NULL transmutation table = direct rounding, i.e. zero-based
        -- grading. Returned as null, not an empty array, so the engine's
        -- "no table" branch is unambiguous.
        'transmutation', (
          select jsonb_agg(jsonb_build_object(
            'minInitial', b.min_initial, 'maxInitial', b.max_initial,
            'outputGrade', b.output_grade) order by b.min_initial)
          from public.transmutation_bands b
          where b.transmutation_table_id = g.transmutation_table_id
        ),
        'descriptors', coalesce((
          select jsonb_agg(jsonb_build_object(
            'minGrade', d.min_grade, 'maxGrade', d.max_grade,
            'label', d.label, 'remark', d.remark) order by d.ordinal)
          from public.descriptor_bands d
          where d.grading_scheme_id = g.id
        ), '[]'::jsonb)
      )
      from public.grading_schemes g where g.id = v_scheme_id
    ),

    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'componentId', a.grade_component_id,
        'ordinal', a.ordinal, 'title', a.title,
        'highestPossibleScore', a.highest_possible_score)
        order by comp.ordinal, a.ordinal)
      from public.assessments a
      join public.grade_components comp on comp.id = a.grade_component_id
      where a.class_id = p_class_id
        and a.academic_period_id = p_period_id
        and a.status = 'active'
    ), '[]'::jsonb),

    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'classEnrollmentId', ce.id,
        'studentId',         st.id,
        'displayName',       public.student_display_name(st.*))
        order by st.last_name, st.first_name)
      from public.class_enrollments ce
      join public.enrollments e on e.id = ce.enrollment_id
      join public.students st   on st.id = e.student_id
      where ce.class_id = p_class_id and ce.status = 'active'
    ), '[]'::jsonb),

    -- classEnrollmentId -> assessmentId -> { raw, isExcused }
    'scores', coalesce((
      select jsonb_object_agg(ce_id, items)
      from (
        select s.class_enrollment_id::text as ce_id,
               jsonb_object_agg(s.assessment_id::text, jsonb_build_object(
                 'raw', s.raw_score, 'isExcused', s.is_excused)) as items
        from public.assessment_scores s
        join public.assessments a on a.id = s.assessment_id
        where a.class_id = p_class_id and a.academic_period_id = p_period_id
        group by s.class_enrollment_id
      ) g
    ), '{}'::jsonb),

    'status',   coalesce((select gs.status from public.grade_submissions gs
                          where gs.class_id = p_class_id
                            and gs.academic_period_id = p_period_id), 'draft'),
    'editable', app.submission_is_editable(p_class_id, p_period_id)
  ) into v_payload;

  return v_payload;
end;
$$;

-- ------------------------------------------------------------
-- public.save_scores(jsonb) — batch upsert of edited cells
-- ------------------------------------------------------------
-- The gradebook sends only dirty cells. RLS on assessment_scores still
-- applies (SECURITY INVOKER), so a teacher can only write to classes
-- they teach, and only while the period is editable.
--
-- Input: [{ "assessmentId": uuid, "classEnrollmentId": uuid,
--           "raw": number|null, "isExcused": bool }]
create or replace function public.save_scores(p_scores jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_written int := 0;
begin
  if jsonb_typeof(p_scores) <> 'array' then
    raise exception 'save_scores expects an array' using errcode = '22023';
  end if;

  with incoming as (
    select
      (x ->> 'assessmentId')::uuid       as assessment_id,
      (x ->> 'classEnrollmentId')::uuid  as class_enrollment_id,
      nullif(x ->> 'raw', '')::numeric   as raw_score,
      coalesce((x ->> 'isExcused')::boolean, false) as is_excused
    from jsonb_array_elements(p_scores) x
  ),
  resolved as (
    select i.*, a.school_id
    from incoming i
    join public.assessments a on a.id = i.assessment_id
  ),
  upserted as (
    insert into public.assessment_scores
      (school_id, assessment_id, class_enrollment_id, raw_score, is_excused, encoded_by)
    select r.school_id, r.assessment_id, r.class_enrollment_id,
           r.raw_score, r.is_excused, app.current_user_id()
    from resolved r
    on conflict (assessment_id, class_enrollment_id) do update
      set raw_score  = excluded.raw_score,
          is_excused = excluded.is_excused,
          encoded_by = excluded.encoded_by,
          updated_at = now()
    returning 1
  )
  select count(*) into v_written from upserted;

  return jsonb_build_object('written', v_written);
end;
$$;

grant execute on function
  rds.session_context(),
  rds.my_classes(uuid),
  rds.gradebook(uuid, uuid),
  public.save_scores(jsonb)
to authenticated;

-- ------------------------------------------------------------
-- Fix: teachers and advisers could not read enrollments
-- ------------------------------------------------------------
-- Migration 0009 gave teachers `students.read.own_classes` on the
-- students table and scoped access to class_enrollments, but left
-- enrollments readable only by staff holding `enrollments.read` or
-- `students.read.all` — neither of which a teacher has.
--
-- The roster join is class_enrollments -> enrollments -> students, so a
-- teacher opening their own gradebook got an EMPTY roster while their
-- learners' scores sat right there. Caught by querying as a real
-- authenticated teacher; the isolation suite could not see it, because
-- returning too FEW rows is invisible to a test that only asserts no
-- foreign rows leak.
drop policy if exists enrollments_read_own_classes on public.enrollments;
create policy enrollments_read_own_classes on public.enrollments
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and app.has_permission('students.read.own_classes')
    and app.student_in_my_classes(student_id)
  );

drop policy if exists enrollments_read_advised on public.enrollments;
create policy enrollments_read_advised on public.enrollments
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and app.has_permission('students.read.section')
    and app.advises_student(student_id)
  );

-- ------------------------------------------------------------
-- PostgREST surface
-- ------------------------------------------------------------
-- PostgREST exposes `public` only, so the client cannot reach `rds.*`
-- directly. Rather than exposing the whole schema — which would publish
-- every future contract the moment it is written — publish a thin
-- wrapper per function that is actually meant to be callable.
--
-- SECURITY INVOKER (the default) throughout, so RLS applies exactly as
-- it would to a direct query. These wrappers add reachability, never
-- authority.

create or replace function public.session_context()
returns jsonb language sql stable as $$ select rds.session_context() $$;

create or replace function public.my_classes(p_year_id uuid)
returns jsonb language sql stable as $$ select rds.my_classes(p_year_id) $$;

create or replace function public.gradebook(p_class_id uuid, p_period_id uuid)
returns jsonb language sql stable as $$ select rds.gradebook(p_class_id, p_period_id) $$;

create or replace function public.sf10_jhs(p_student_id uuid)
returns jsonb language sql stable as $$ select rds.sf10_jhs(p_student_id) $$;

grant execute on function
  public.session_context(),
  public.my_classes(uuid),
  public.gradebook(uuid, uuid),
  public.sf10_jhs(uuid)
to authenticated;

comment on function public.session_context is
  'PostgREST-reachable wrapper over rds.session_context().';
