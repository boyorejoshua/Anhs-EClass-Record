-- =====================================================================
-- 0037  THE IMPORT CENTER CAN ACTUALLY BE RESOLVED
-- =====================================================================
--
-- A teacher imported their real GMRC 9 Edison workbook and got six red
-- errors and no way forward. Three faults, and the last is the one that
-- matters.
--
-- 1. "No grade level here is called 9."
--
--    The official DepEd workbook writes the grade level as a BARE
--    NUMBER — INPUT DATA!E25 holds the integer 9, not "Grade 9". It was
--    matched against `grade_levels.name` ('Grade 9') and `.code` ('G9'),
--    and neither normalises to '9'. So EVERY official workbook failed at
--    the first hurdle. Now matched on the ordinal and on the digits of
--    each side.
--
-- 2. "No subject here matches GMRC."
--
--    Correct — GMRC is genuinely not in this school's subject list. But
--    "Choose one." was a lie, and the message never mentioned the other
--    way out: have an administrator add the subject.
--
-- 3. FOUR MORE ERRORS THAT WERE NOT REAL.
--
--    "The grading scheme for this subject has no WW component", and the
--    same for PT, ST1 and ST2. The teacher's own reply was the
--    diagnosis: the workbook plainly HAS those components, with their
--    highest possible scores. So does the school's scheme.
--
--    They fired because the SUBJECT was unresolved, so no scheme was
--    found, so every component was reported missing. Four consequences
--    of one cause, each dressed as its own failure, all gone the moment
--    the subject is chosen.
--
-- Underneath all three: the resolution now RETURNS THE CHOICES.
-- `import_resolution` has always accepted `overrides` for the year,
-- section and subject. Nothing ever sent them, because the client had
-- no list to offer. It does now, and a grade-level override is honoured
-- for the first time.
--
-- The function below is migration 0026's, with those edits applied to
-- its own text rather than rewritten — the assessments block, the
-- permission names and the learner matching are byte-for-byte what they
-- were.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- The grade number inside whatever a workbook put in the cell
-- ---------------------------------------------------------------------
--
-- 9, '9', 'Grade 9', 'GRADE 9', 'G9', 'Gr. 9' all give 9. Null when
-- there is no digit at all, which is the honest answer for a blank cell
-- and for a level like 'Kinder'.
--
-- Deliberately ONLY the number. Matching the words around it is how a
-- school with a level called "Grade 9 - SPED" quietly imports into
-- plain Grade 9.
create or replace function app.grade_level_number(p text)
returns int
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')::int;
$$;

comment on function app.grade_level_number(text) is
  'The grade number inside a workbook grade-level cell. The official '
  'DepEd ECR writes a bare 9 where our grade_levels row is named "Grade 9".';

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
  -- The official workbook writes the grade level as a BARE NUMBER.
  v_gradenum int := app.grade_level_number(v_ident ->> 'gradeLevelText');
  v_gcands   uuid[];
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
  else
    -- An explicit choice from the preview wins over anything the
    -- workbook says. This is the whole point of the choices below.
    v_grade := nullif(v_over ->> 'gradeLevelId', '')::uuid;

    if v_grade is null then
      -- Named or coded exactly, first. An exact 'G9' must not be dragged
      -- into a tie by a second level that merely shares the number.
      select array_agg(gl.id) into v_gcands
      from public.grade_levels gl
      where gl.school_id = v_school
        and (app.normalise_name(gl.name) = app.normalise_name(v_ident ->> 'gradeLevelText')
             or app.normalise_name(gl.code) = app.normalise_name(v_ident ->> 'gradeLevelText'));

      -- Then by number. INPUT DATA!E25 is the integer 9, not "Grade 9",
      -- so neither comparison above can match an official workbook.
      if v_gcands is null and v_gradenum is not null then
        select array_agg(gl.id) into v_gcands
        from public.grade_levels gl
        where gl.school_id = v_school
          and (gl.ordinal = v_gradenum
               or app.grade_level_number(gl.name) = v_gradenum
               or app.grade_level_number(gl.code) = v_gradenum);
      end if;

      -- EXACTLY ONE, or none. A school can genuinely hold two levels
      -- both called "Grade 9" — our own seed does, one of them a prior
      -- year's — and `select ... into` would have taken whichever the
      -- planner returned first. Silently picking a grade level is how a
      -- term of marks lands on the wrong register, so ambiguity is a
      -- question, never a coin toss.
      if array_length(v_gcands, 1) = 1 then
        v_grade := v_gcands[1];
      end if;
    end if;

    if v_grade is not null and v_year is not null then
      select s.id into v_section
      from public.sections s
      where s.school_id = v_school
        and s.academic_year_id = v_year
        and s.grade_level_id = v_grade
        and app.normalise_name(s.name) = app.normalise_name(v_ident ->> 'sectionText');
    end if;
  end if;

  if v_grade is null and coalesce(array_length(v_gcands, 1), 0) > 1 then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'ambiguous-grade-level', 'where', 'INPUT!J7',
      'message', format(
        '"%s" matches %s grade levels in this school, so it is not clear which '
        || 'register these marks belong to. Choose one below.',
        coalesce(v_ident ->> 'gradeLevelText', '(blank)'),
        array_length(v_gcands, 1)));
  elsif v_grade is null then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'no-such-grade-level', 'where', 'INPUT!J7',
      'message', format(
        'This school has no grade level matching "%s". Choose one below.',
        coalesce(v_ident ->> 'gradeLevelText', '(blank)')));
  elsif v_section is null then
    v_issues := v_issues || jsonb_build_object(
      'severity', 'error', 'code', 'no-such-section', 'where', 'INPUT!J7',
      'message', format(
        'Grade level found, but "%s" is not one of its sections for this year. '
        || 'Choose the section below — sections are never created by an import.',
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
      'message', format(
        '"%s" is not in the subject list for this school. Choose the matching '
        || 'subject below, or ask an administrator to add it — an import '
        || 'never creates a subject, because a typo would become one.',
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

    -- ---------- the choices ----------
    -- What the person is being asked to choose FROM. Every message above
    -- says "choose", and until now there was nothing to choose with:
    -- `overrides` was accepted here and never sent, because the client
    -- had no list to offer. That is how a teacher ends up stuck on a
    -- screen that is telling them the truth.
    --
    -- Sections are listed for the RESOLVED grade level only. Offering
    -- every section in the school would invite importing Grade 9 marks
    -- into a Grade 7 register.
    'options', jsonb_build_object(
      'academicYears', coalesce((
        select jsonb_agg(jsonb_build_object('id', y.id, 'label', y.label)
                         order by y.label desc)
        from public.academic_years y where y.school_id = v_school), '[]'::jsonb),
      -- The NAME IS NOT ALWAYS UNIQUE. This school holds two levels both
      -- called "Grade 9", and a dropdown offering "Grade 9" twice is no
      -- better than the ambiguity it exists to resolve. Where the name
      -- repeats, the code goes on the end to tell them apart.
      'gradeLevels', coalesce((
        select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.label)
                         order by g.ordinal, g.code)
        from (
          select gl.id, gl.ordinal, gl.code,
                 case when count(*) over (partition by app.normalise_name(gl.name)) > 1
                      then gl.name || ' · ' || gl.code
                      else gl.name end as label
          from public.grade_levels gl
          where gl.school_id = v_school and gl.is_active
        ) g), '[]'::jsonb),
      -- EVERY section in the year, each carrying its grade level, so the
      -- preview can narrow the list the moment a grade is chosen without
      -- another round trip. Filtering here by a grade that is not yet
      -- resolved just showed some other grade's sections.
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'gradeLevelId', s.grade_level_id)
               order by s.name)
        from public.sections s
        where s.school_id = v_school
          and s.academic_year_id = v_year), '[]'::jsonb),
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', sub.id, 'code', sub.code, 'title', sub.title)
               order by sub.title)
        from public.subjects sub where sub.school_id = v_school), '[]'::jsonb)
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
    -- A component can only be judged against a SCHEME. With none
    -- resolved this reported EVERY component missing — for the real
    -- GMRC workbook that was four extra errors (WW, PT, ST1, ST2), each
    -- phrased as its own failure, none of them true: the workbook has
    -- those components and so does the school. They were four
    -- consequences of one unresolved subject, and all four vanish the
    -- moment it is chosen. Say nothing rather than say that.
    'components', case when v_scheme is null then '[]'::jsonb else coalesce((
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
    ), '[]'::jsonb) end,

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
  'What importing this workbook WOULD do, and what may be chosen when it '
  'cannot be resolved. Reads only — it is the preview, and there is no '
  'path from here to a write.';

commit;
