-- 0026 — The Import Center.
--
-- The school asked for this directly: import the three-term workbook and
-- have the system "recognize" the class, "update and create a class",
-- and not produce a duplicate "unless the teacher remove that class".
--
-- The whole design follows from three facts about that workbook, all of
-- them established by reading the real file (docs/three-term-import-mapping.md):
--
--   1. ONE WORKBOOK IS ONE CLASS. `classes` is already unique on
--      (academic_year_id, section_id, subject_id), so resolving a
--      workbook to a class is a lookup, and re-importing the same file
--      updates the same class. A duplicate is not prevented by a check
--      here — it is IMPOSSIBLE, by the constraint that was already
--      there. Delete the class and import again and you get a new one,
--      which is exactly the behaviour asked for.
--
--   2. THE WORKBOOK HAS NO LEARNER IDENTIFIER. No LRN, no student
--      number, nothing but a name and a row. So matching is a proposal
--      that a person confirms, never a silent join. This is the brief's
--      "Do NOT use name alone as the primary matching key", honoured by
--      refusing to treat a name as a key at all.
--
--   3. EVERY GRADE IN THE WORKBOOK IS A FORMULA. Nothing derived is
--      imported. Marks and structure go in; the Edge Function and the
--      canonical engine produce every grade, as they already do.
--
-- ------------------------------------------------------------------
-- WHY TWO FUNCTIONS
-- ------------------------------------------------------------------
-- `import_resolution` READS and cannot write: it is stable, it is
-- SECURITY INVOKER, and it returns what an import WOULD do.
-- `import_commit` WRITES and cannot match: it accepts only ids that a
-- person has confirmed, and does no name matching of its own.
--
-- That split is what makes "nothing is written until you confirm" a
-- structural property rather than a promise. If commit could match
-- names, the preview would be advisory — a second, unreviewed matching
-- run would decide the outcome, and the user would have approved
-- something else.
--
-- ------------------------------------------------------------------
-- WHO MAY DO WHAT
-- ------------------------------------------------------------------
-- The permission gates the ACT, not the file. `imports.execute` says
-- "may run an import" and is now held by teachers too, because the
-- teacher is the person holding the workbook. What the import may then
-- DO is gated by the permissions that already govern those acts:
--
--   create a class      classes.assign        registrar / admin
--   create a learner    students.write        registrar / admin
--   enrol a learner     enrollments.write     registrar / admin
--   write assessments   assessments.write     teacher of the class
--   write marks         grades.encode         teacher of the class
--
-- So a teacher importing marks into a class they teach just works; a
-- teacher importing a workbook for a class nobody has created is told
-- the registrar must create it. No new authority is invented.

-- ------------------------------------------------------------
-- Name normalisation — for COMPARISON only
-- ------------------------------------------------------------
-- The stored name always keeps its original form. This exists so
-- "Dela Cruz,  Juan" and "dela cruz, juan" compare equal, and for no
-- other purpose.
--
-- `unaccent` is an extension that may not be installed, and the import
-- must not depend on one being available in a school's project. The
-- accents that actually occur in Filipino and Spanish-derived names are
-- folded explicitly instead.
create or replace function app.fold_accents(p text)
returns text
language sql
immutable
as $$
  select translate(coalesce(p, ''),
    'áàâäãéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC');
$$;

create or replace function app.normalise_name(p text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(lower(app.fold_accents(coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g')),
    '');
$$;

comment on function app.normalise_name is
  'Case-folded, punctuation-stripped form of a name, for COMPARISON '
  'only. Never stored, never displayed.';

-- ------------------------------------------------------------
-- import_batches — the table 0008 already built for this
-- ------------------------------------------------------------
-- Migration 0008 created `import_batches` with import_type, filename,
-- uploaded_by, a status enum that already includes 'previewed' and
-- 'failed', row/success/error counts and a `report` jsonb. That is this
-- table. It has simply never had a row in it, because nothing imported
-- anything yet.
--
-- One column is missing: which CLASS the workbook resolved to. Adding
-- it is the whole change.
alter table public.import_batches
  add column if not exists class_id uuid;

-- A single-column reference on purpose. Deleting a class must not erase
-- the record that it was once imported — and the composite
-- (school_id, class_id) form used elsewhere cannot express that,
-- because ON DELETE SET NULL would try to null a NOT NULL school_id.
-- Tenancy here is carried by the tenant trigger 0008 already attached.
alter table public.import_batches
  drop constraint if exists import_batches_class_fk;
alter table public.import_batches
  add constraint import_batches_class_fk
  foreign key (class_id) references public.classes (id) on delete set null;

create index if not exists import_batches_school_idx
  on public.import_batches (school_id, created_at desc);
create index if not exists import_batches_class_idx
  on public.import_batches (school_id, class_id);

-- ⚠️ 0009 gave this table the baseline `tenant_read` policy, which lets
-- EVERY authenticated user in the school read it — learners included.
-- That leaked nothing while the table was empty. It is about to hold
-- file names, class names and who imported them, so narrow it now.
drop policy if exists tenant_read on public.import_batches;
drop policy if exists import_batches_read on public.import_batches;
create policy import_batches_read on public.import_batches
  for select to authenticated
  using (
    school_id = app.current_school_id()
    and (app.has_permission('audit.read')
         or (app.has_permission('imports.execute')
             and uploaded_by = app.current_user_id()))
  );

-- No write policy, and 0009 forces RLS. Rows arrive only through
-- import_commit, which is security definer — there is no path for a
-- client to forge import history.

-- ------------------------------------------------------------
-- rds.import_resolution — what this workbook WOULD do
-- ------------------------------------------------------------
create or replace function rds.import_resolution(p_workbook jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_school   uuid := app.current_school_id();
  v_ident    jsonb := coalesce(p_workbook -> 'identity', '{}'::jsonb);
  v_over     jsonb := coalesce(p_workbook -> 'overrides', '{}'::jsonb);
  v_year     uuid;
  v_struct   text;
  v_grade    uuid;
  v_section  uuid;
  v_subject  uuid;
  v_class    uuid;
  v_scheme   uuid;
  v_issues   jsonb := '[]'::jsonb;
  v_result   jsonb;
begin
  if v_school is null then
    raise exception 'no school in session' using errcode = '42501';
  end if;

  -- ---------- school year ----------
  v_year := nullif(v_over ->> 'academicYearId', '')::uuid;
  if v_year is null then
    select y.id, y.period_structure into v_year, v_struct
    from public.academic_years y
    where y.school_id = v_school
      and app.normalise_name(y.label) = app.normalise_name(v_ident ->> 'schoolYear');
  else
    select y.period_structure into v_struct
    from public.academic_years y where y.id = v_year and y.school_id = v_school;
  end if;

  if v_year is null then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'no-such-year',
      'where', 'INPUT!Y5',
      'message', format(
        'This school has no school year called "%s". Create the year first, or '
        || 'choose one.', coalesce(v_ident ->> 'schoolYear', '(blank)')));
  elsif v_struct is distinct from 'three_term' then
    -- Refusing here is the point. A three-term workbook loaded into a
    -- four-quarter year would map TERM1..3 onto Q1..3 and silently
    -- leave Q4 out, producing a year that looks complete and is not.
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'wrong-period-structure',
      'where', 'INPUT!Y5',
      'message', format(
        'SY %s is configured as a %s year. A three-term workbook cannot be '
        || 'imported into it.', v_ident ->> 'schoolYear', coalesce(v_struct, 'unknown')));
  end if;

  -- ---------- grade level and section ----------
  -- Neither is ever created. A typo must not be able to spawn
  -- "Masipag", "masipag" and "Masipag " as three sections.
  v_section := nullif(v_over ->> 'sectionId', '')::uuid;
  if v_section is not null then
    select s.grade_level_id into v_grade
    from public.sections s where s.id = v_section and s.school_id = v_school;
  elsif v_year is not null then
    select gl.id into v_grade
    from public.grade_levels gl
    where gl.school_id = v_school
      and (app.normalise_name(gl.name) = app.normalise_name(v_ident ->> 'gradeLevelText')
           or app.normalise_name(gl.code) = app.normalise_name(v_ident ->> 'gradeLevelText'));

    if v_grade is not null then
      select s.id into v_section
      from public.sections s
      where s.school_id = v_school
        and s.academic_year_id = v_year
        and s.grade_level_id = v_grade
        and app.normalise_name(s.name) = app.normalise_name(v_ident ->> 'sectionText');
    end if;
  end if;

  if v_grade is null then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'no-such-grade-level', 'where', 'INPUT!J7',
      'message', format('No grade level here is called "%s". Choose one.',
        coalesce(v_ident ->> 'gradeLevelText', '(blank)')));
  elsif v_section is null then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'no-such-section', 'where', 'INPUT!J7',
      'message', format(
        'Grade level found, but "%s" is not one of its sections for this year. '
        || 'Choose the section — sections are never created by an import.',
        coalesce(v_ident ->> 'sectionText', '(blank)')));
  end if;

  -- ---------- subject ----------
  v_subject := nullif(v_over ->> 'subjectId', '')::uuid;
  if v_subject is null then
    select sub.id into v_subject
    from public.subjects sub
    where sub.school_id = v_school
      and (app.normalise_name(sub.code) = app.normalise_name(v_ident ->> 'subjectText')
           or app.normalise_name(sub.title) = app.normalise_name(v_ident ->> 'subjectText'));
  end if;

  if v_subject is null then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'no-such-subject', 'where', 'INPUT!Y7',
      'message', format('No subject here matches "%s". Choose one.',
        coalesce(v_ident ->> 'subjectText', '(blank)')));
  end if;

  -- ---------- the class ----------
  if v_year is not null and v_section is not null and v_subject is not null then
    select cl.id, coalesce(cl.grading_scheme_id, sc.grading_scheme_id)
      into v_class, v_scheme
    from public.classes cl
    join public.subjects sub on sub.id = cl.subject_id
    join public.subject_categories sc on sc.id = sub.subject_category_id
    where cl.academic_year_id = v_year
      and cl.section_id = v_section
      and cl.subject_id = v_subject;

    if v_class is null then
      -- The class does not exist yet. What WOULD be created still needs
      -- a scheme, so resolve it from the subject's category now — a
      -- subject with no scheme is a configuration gap, and the preview
      -- is where the user should learn that.
      select sc.grading_scheme_id into v_scheme
      from public.subjects sub
      join public.subject_categories sc on sc.id = sub.subject_category_id
      where sub.id = v_subject;
    end if;

    if v_scheme is null then
      v_issues := v_issues || jsonb_build_object(
        'severity', 'error', 'code', 'no-grading-scheme', 'where', 'INPUT!Y7',
        'message',
          'This subject has no grading scheme, so there is nothing to attach '
          || 'assessments to. Set one on the subject category first.');
    end if;
  end if;

  select jsonb_build_object(
    'class', jsonb_build_object(
      'status', case
        when v_class is not null then 'matched'
        when v_year is not null and v_section is not null and v_subject is not null
          then 'willCreate'
        else 'unresolved' end,
      'classId',        v_class,
      'academicYearId', v_year,
      'gradeLevelId',   v_grade,
      'sectionId',      v_section,
      'subjectId',      v_subject,
      'gradingSchemeId', v_scheme,
      'label', (
        select concat_ws(' · ',
          concat_ws(' – ', gl.name, s.name),
          sub.title)
        from public.sections s
        join public.grade_levels gl on gl.id = s.grade_level_id
        left join public.subjects sub on sub.id = v_subject
        where s.id = v_section),
      'teacher', (
        -- A name match only, offered for confirmation. The importer
        -- never reassigns a class to a different teacher on the
        -- strength of a spelling.
        select jsonb_build_object('userId', u.id,
                                  'displayName', concat_ws(', ', u.last_name, u.first_name))
        from public.users u
        where u.school_id = v_school
          and app.normalise_name(concat_ws(', ', u.last_name, u.first_name))
              = app.normalise_name(v_ident ->> 'teacherName'))
    ),

    -- ---------- periods ----------
    -- Term N maps to the period with ordinal N. Editability is read
    -- here so the preview can refuse a term the registrar already has,
    -- rather than discovering it at commit time.
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ordinal',  p.ordinal,
               'periodId', p.id,
               'name',     p.name,
               'editable', case when v_class is null then true
                           else app.submission_is_editable(v_class, p.id) end)
             order by p.ordinal)
      from public.academic_periods p
      where p.academic_year_id = v_year
        and p.ordinal in (
          select (t ->> 'ordinal')::int
          from jsonb_array_elements(coalesce(p_workbook -> 'terms', '[]'::jsonb)) t)
    ), '[]'::jsonb),

    -- ---------- components ----------
    -- WW / PT / EX, and EX's children ST1 / ST2 / TE. A component that
    -- the scheme does not declare is an error, never something to
    -- create: sibling weights must sum to 100, and injecting one would
    -- silently rewrite the school's grading policy.
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key',      k.key,
               'itemCode', k.item_code,
               'componentId', gc.id,
               'weight',   gc.weight,
               'status',   case when gc.id is null then 'missing' else 'matched' end)
             order by k.key, k.item_code nulls first)
      from (
        select distinct
          c ->> 'key' as key,
          case when (i ->> 'childComponentCode') is null then null
               else i ->> 'childComponentCode' end as item_code
        from jsonb_array_elements(coalesce(p_workbook -> 'terms', '[]'::jsonb)) t,
             jsonb_array_elements(coalesce(t -> 'components', '[]'::jsonb)) c,
             jsonb_array_elements(coalesce(c -> 'items', '[]'::jsonb)) i
      ) k
      left join public.grade_components gc
        on gc.grading_scheme_id = v_scheme
       and gc.code = coalesce(k.item_code, k.key)
    ), '[]'::jsonb),

    -- ---------- learners ----------
    'learners', coalesce((
      select jsonb_agg(l.entry order by l.row)
      from (
        select
          (r ->> 'row')::int as row,
          jsonb_build_object(
            'row',  (r ->> 'row')::int,
            'raw',  r ->> 'raw',
            'sex',  r ->> 'sex',
            'candidates', coalesce(m.candidates, '[]'::jsonb),
            'status', case
              when jsonb_array_length(coalesce(m.candidates, '[]'::jsonb)) = 1 then 'matched'
              when jsonb_array_length(coalesce(m.candidates, '[]'::jsonb)) > 1 then 'ambiguous'
              else 'new' end
          ) as entry
        from jsonb_array_elements(coalesce(p_workbook -> 'roster', '[]'::jsonb)) r
        left join lateral (
          -- Matched against the SECTION's enrolment for this year, not
          -- the whole school: two learners called Santos, Carlo in
          -- different sections are not a candidate pair.
          select jsonb_agg(jsonb_build_object(
                   'studentId',    st.id,
                   'enrollmentId', e.id,
                   'displayName',  public.student_display_name(st),
                   'lrn',          st.lrn,
                   'studentNumber', st.student_number)) as candidates
          from public.enrollments e
          join public.students st on st.id = e.student_id
          where e.school_id = v_school
            and e.academic_year_id = v_year
            and e.section_id is not distinct from v_section
            and e.status in ('enrolled', 'transferred_in')
            and app.normalise_name(concat_ws(', ', st.last_name, st.first_name))
                = app.normalise_name(r ->> 'raw')
        ) m on true
      ) l
    ), '[]'::jsonb),

    -- ---------- assessments ----------
    -- Natural key: class + period + component + ordinal. For ST1/ST2/TE
    -- the child component IS the identity, so the ordinal is 1.
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'termOrdinal',  x.term_ordinal,
               'componentKey', x.key,
               'itemCode',     x.item_code,
               'ordinal',      x.ordinal,
               'newHps',       x.hps,
               'assessmentId', a.id,
               'currentHps',   a.highest_possible_score,
               'status', case
                 when a.id is null then 'willCreate'
                 when a.highest_possible_score is distinct from x.hps then 'hpsChanged'
                 else 'unchanged' end)
             order by x.term_ordinal, x.key, x.ordinal)
      from (
        select
          (t ->> 'ordinal')::int as term_ordinal,
          c ->> 'key'            as key,
          i ->> 'childComponentCode' as child_code,
          i ->> 'code'           as item_code,
          case when (i ->> 'childComponentCode') is not null then 1
               else row_number() over (
                 partition by (t ->> 'ordinal')::int, c ->> 'key'
                 order by (i ->> 'column')::int)::int end as ordinal,
          (i ->> 'highestPossibleScore')::numeric as hps
        from jsonb_array_elements(coalesce(p_workbook -> 'terms', '[]'::jsonb)) t,
             jsonb_array_elements(coalesce(t -> 'components', '[]'::jsonb)) c,
             jsonb_array_elements(coalesce(c -> 'items', '[]'::jsonb)) i
      ) x
      left join public.academic_periods p
        on p.academic_year_id = v_year and p.ordinal = x.term_ordinal
      left join public.grade_components gc
        on gc.grading_scheme_id = v_scheme
       and gc.code = coalesce(x.child_code, x.key)
      left join public.assessments a
        on a.class_id = v_class
       and a.academic_period_id = p.id
       and a.grade_component_id = gc.id
       and a.ordinal = x.ordinal
    ), '[]'::jsonb),

    -- ---------- what this account may actually do ----------
    'permissions', jsonb_build_object(
      'runImport',     app.has_permission('imports.execute'),
      'createClass',   app.has_permission('classes.assign'),
      'createStudent', app.has_permission('students.write')
                       and app.has_permission('enrollments.write'),
      'writeMarks',    app.has_permission('grades.encode')
                       and app.has_permission('assessments.write')
    ),

    'issues', v_issues
  ) into v_result;

  return v_result;
end;
$$;

comment on function rds.import_resolution is
  'What importing this workbook WOULD do. Reads only — it is the '
  'preview, and there is no path from here to a write.';

create or replace function public.import_resolution(p_workbook jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select rds.import_resolution(p_workbook); $$;

-- ------------------------------------------------------------
-- import_commit — execute a plan a person confirmed
-- ------------------------------------------------------------
-- Takes IDS, not names. Everything ambiguous was decided in the
-- preview; this function's job is to apply that decision atomically,
-- and to refuse anything the caller is not entitled to do.
create or replace function public.import_commit(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school    uuid := app.current_school_id();
  v_class     uuid := nullif(p_plan ->> 'classId', '')::uuid;
  v_year      uuid := nullif(p_plan ->> 'academicYearId', '')::uuid;
  v_section   uuid := nullif(p_plan ->> 'sectionId', '')::uuid;
  v_subject   uuid := nullif(p_plan ->> 'subjectId', '')::uuid;
  v_grade     uuid := nullif(p_plan ->> 'gradeLevelId', '')::uuid;
  v_teacher   uuid := nullif(p_plan ->> 'teacherId', '')::uuid;
  v_file      text := coalesce(nullif(p_plan ->> 'fileName', ''), 'workbook.xlsx');
  v_created_class boolean := false;
  v_students  int := 0;
  v_enrolled  int := 0;
  v_assess    int := 0;
  v_marks     int := 0;
  v_batch     uuid;
  r           record;
  v_enrol     uuid;
  -- workbook row -> enrolment id, filled in as learners are resolved
  v_rows      jsonb := '{}'::jsonb;
begin
  if not app.has_permission('imports.execute') then
    raise exception 'not permitted to run imports' using errcode = '42501';
  end if;

  -- ---------- the class ----------
  if v_class is null then
    if v_year is null or v_section is null or v_subject is null then
      raise exception 'the plan does not resolve a class' using errcode = '22023';
    end if;
    if not app.has_permission('classes.assign') then
      raise exception
        'this workbook is for a class that does not exist yet, and your account '
        'cannot create classes. Ask the registrar to create it, then import again'
        using errcode = '42501';
    end if;

    -- ON CONFLICT, not a pre-check: two imports racing must produce one
    -- class, and the unique constraint is the only thing that can
    -- guarantee that. This is also why re-importing cannot duplicate.
    insert into public.classes
      (school_id, academic_year_id, section_id, subject_id, primary_teacher_id)
    values (v_school, v_year, v_section, v_subject, v_teacher)
    on conflict (academic_year_id, section_id, subject_id) do nothing
    returning id into v_class;

    if v_class is null then
      select cl.id into v_class from public.classes cl
      where cl.academic_year_id = v_year and cl.section_id = v_section
        and cl.subject_id = v_subject;
    else
      v_created_class := true;
    end if;
  else
    select cl.school_id, cl.section_id, cl.academic_year_id
      into v_school, v_section, v_year
    from public.classes cl where cl.id = v_class;
    if v_school is distinct from app.current_school_id() then
      raise exception 'class not found' using errcode = 'P0002';
    end if;
  end if;

  if not (app.teaches_class(v_class) or app.has_permission('classes.assign')) then
    raise exception 'you do not teach this class' using errcode = '42501';
  end if;

  -- A learner created by this import is enrolled into the section the
  -- class belongs to, so the grade level comes from the section rather
  -- than being trusted from the plan.
  if v_grade is null and v_section is not null then
    select s.grade_level_id into v_grade
    from public.sections s where s.id = v_section;
  end if;

  -- ---------- learners ----------
  -- Two actions only, both decided in the preview: `link` an existing
  -- enrolment, or `create` a learner the school does not have. There is
  -- no third action, and in particular no matching.
  -- ⚠️ Marks reference the WORKBOOK ROW, not an enrolment id, and this
  -- loop is what makes that possible. A learner being created has no
  -- enrolment id at the moment the plan is written, so a plan that
  -- keyed marks by enrolment id would silently drop every mark
  -- belonging to a new learner — the rows would simply fail to join.
  -- The row number is the only identifier the workbook has, and it is
  -- the one thing that is stable from the file all the way to here.
  for r in
    select
      x ->> 'action'                        as action,
      x ->> 'row'                           as row_key,
      nullif(x ->> 'enrollmentId', '')::uuid as enrollment_id,
      x -> 'student'                        as student
    from jsonb_array_elements(coalesce(p_plan -> 'learners', '[]'::jsonb)) x
  loop
    v_enrol := null;
    if r.action = 'create' then
      if not (app.has_permission('students.write')
              and app.has_permission('enrollments.write')) then
        raise exception
          'this workbook contains learners the school does not have, and your '
          'account cannot create learners. Ask the registrar to admit them first'
          using errcode = '42501';
      end if;
      select (public.admit_student(
                r.student,
                jsonb_build_object('academicYearId', v_year,
                                   'gradeLevelId',   v_grade,
                                   'sectionId',      v_section)
              ) ->> 'enrollmentId')::uuid
        into v_enrol;
      v_students := v_students + 1;
    elsif r.action = 'link' then
      v_enrol := r.enrollment_id;
    else
      continue;
    end if;

    if v_enrol is not null then
      insert into public.class_enrollments (school_id, class_id, enrollment_id)
      values (v_school, v_class, v_enrol)
      on conflict (class_id, enrollment_id) do nothing;
      v_enrolled := v_enrolled + 1;
      if r.row_key is not null then
        v_rows := v_rows || jsonb_build_object(r.row_key, v_enrol);
      end if;
    end if;
  end loop;

  -- ---------- assessments and marks, per period ----------
  -- Delegated to save_assessments and save_scores rather than
  -- reimplemented. Those functions already refuse a period that has
  -- left the teacher's hands, already refuse to delete an assessment
  -- that carries marks, and already carry the audit write. An import
  -- that wrote its own upserts would be a second set of rules for the
  -- same act, and the two would drift.
  for r in
    select
      nullif(x ->> 'periodId', '')::uuid as period_id,
      coalesce(x -> 'assessments', '[]'::jsonb) as assessments,
      coalesce(x -> 'marks', '[]'::jsonb)       as marks
    from jsonb_array_elements(coalesce(p_plan -> 'periods', '[]'::jsonb)) x
  loop
    if r.period_id is null then continue; end if;

    -- ⚠️ THIS FUNCTION IS SECURITY DEFINER, SO RLS IS NOT ENFORCING
    -- ANYTHING BELOW. save_scores relies entirely on the
    -- assessment_scores policies for both permission and editability,
    -- and those policies do not run for the definer. Without these two
    -- checks an import could write marks into a period the registrar
    -- already holds — the one thing the whole chain of custody exists
    -- to prevent. save_assessments raises on its own, but it is checked
    -- here too so the refusal happens before any period is touched.
    if not (app.has_permission('grades.encode')
            and app.has_permission('assessments.write')) then
      raise exception 'your account cannot record marks' using errcode = '42501';
    end if;

    if not app.submission_is_editable(v_class, r.period_id) then
      raise exception
        'that grading period has already been submitted, so it cannot be '
        'overwritten by an import. Take the record back first'
        using errcode = '42501';
    end if;

    -- save_assessments treats its payload as the COMPLETE set for the
    -- period and removes anything absent. The plan therefore carries
    -- every assessment the period should end up with, existing ones
    -- included, and the preview shows exactly that set.
    v_assess := v_assess + coalesce(
      (public.save_assessments(v_class, r.period_id, r.assessments) ->> 'written')::int, 0);

    -- Marks reference assessments by their natural key, because a
    -- brand-new assessment has no id until the line above ran.
    v_marks := v_marks + coalesce((
      public.save_scores((
        select coalesce(jsonb_agg(jsonb_build_object(
                 'assessmentId',      a.id,
                 'classEnrollmentId', ce.id,
                 'raw',               m ->> 'raw')), '[]'::jsonb)
        from jsonb_array_elements(r.marks) m
        join public.assessments a
          on a.class_id = v_class
         and a.academic_period_id = r.period_id
         and a.grade_component_id = (m ->> 'componentId')::uuid
         and a.ordinal = (m ->> 'ordinal')::int
        join public.class_enrollments ce
          on ce.class_id = v_class
         and ce.enrollment_id = (v_rows ->> (m ->> 'row'))::uuid
      )) ->> 'written')::int, 0);
  end loop;

  insert into public.import_batches
    (school_id, import_type, filename, class_id, status,
     row_count, success_count, error_count, report, uploaded_by)
  values (
    v_school, 'three_term_class_record', v_file, v_class, 'committed',
    v_marks, v_marks, 0,
    jsonb_build_object(
      'createdClass', v_created_class,
      'studentsCreated', v_students,
      'learnersOnRoster', v_enrolled,
      'assessments', v_assess,
      'marks', v_marks),
    app.current_user_id())
  returning id into v_batch;

  perform app.write_audit(
    'import.commit', 'classes', v_class, null,
    jsonb_build_object('batchId', v_batch, 'fileName', v_file,
                       'createdClass', v_created_class,
                       'studentsCreated', v_students,
                       'assessments', v_assess, 'marks', v_marks));

  return jsonb_build_object(
    'batchId', v_batch,
    'classId', v_class,
    'createdClass', v_created_class,
    'studentsCreated', v_students,
    'learnersOnRoster', v_enrolled,
    'assessments', v_assess,
    'marks', v_marks);
end;
$$;

comment on function public.import_commit is
  'Applies a confirmed import plan in one transaction. Accepts ids '
  'only — it does no name matching, so the preview is binding.';

-- ------------------------------------------------------------
-- rds.import_history — what has been imported into this school
-- ------------------------------------------------------------
create or replace function rds.import_history(p_limit int default 50)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(t.row order by t.at desc), '[]'::jsonb)
  from (
    select b.created_at as at, jsonb_build_object(
      'id',        b.id,
      'fileName',  b.filename,
      'at',        b.created_at,
      'classId',   b.class_id,
      'className', (
        select concat_ws(' · ', concat_ws(' – ', gl.name, s.name), sub.title)
        from public.classes cl
        join public.sections s on s.id = cl.section_id
        join public.grade_levels gl on gl.id = s.grade_level_id
        join public.subjects sub on sub.id = cl.subject_id
        where cl.id = b.class_id),
      'importedBy', concat_ws(', ', u.last_name, u.first_name),
      'summary',   b.report
    ) as row
    from public.import_batches b
    left join public.users u on u.id = b.uploaded_by
    order by b.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) t;
$$;

create or replace function public.import_history(p_limit int default 50)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select rds.import_history(p_limit); $$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
-- `imports.execute` now reaches teachers. It means "may run an import";
-- what an import may DO is gated by classes.assign / students.write /
-- enrollments.write / assessments.write / grades.encode, all checked
-- inside import_commit. See the header.
insert into public.role_permissions (role_id, permission_code)
select r.id, 'imports.execute'
from public.roles r
where r.code in ('teacher', 'adviser')
on conflict do nothing;

grant execute on function
  rds.import_resolution(jsonb),
  public.import_resolution(jsonb),
  public.import_commit(jsonb),
  rds.import_history(int),
  public.import_history(int),
  app.normalise_name(text),
  app.fold_accents(text)
to authenticated;

revoke execute on function
  rds.import_resolution(jsonb),
  public.import_resolution(jsonb),
  public.import_commit(jsonb),
  rds.import_history(int),
  public.import_history(int)
from public, anon;
