-- ============================================================
-- demo-seed.sql · A controlled demonstration dataset
-- ============================================================
--
-- The school has not given us their learner list, roster or academic
-- records yet. This builds a small, realistic dataset so the whole
-- workflow can be shown end to end — and builds it in a way that could
-- never be mistaken for official records.
--
-- ── HOW DEMO DATA IS MARKED ──────────────────────────────────────────
--
--   section          'Demo 10-A'
--   learners         'Demo Student 01' … 'Demo Student 08'
--   student_number   'DEMO-0001' …
--   lrn              NULL, always. An LRN is a national identifier; a
--                    demo learner must never carry one, and a null LRN
--                    also means these rows can never collide with a
--                    real learner imported later.
--   remarks          'DEMO DATA — not an official record'
--
-- ── HOW TO RUN ───────────────────────────────────────────────────────
--
--   psql "$DATABASE_URL" -f supabase/demo-seed.sql
--
-- Idempotent: re-running removes the previous demo subtree and rebuilds
-- it, so the demonstration always starts from the same place. It never
-- touches anything outside that subtree.
--
-- ── HOW TO REMOVE ────────────────────────────────────────────────────
--
--   psql "$DATABASE_URL" -f supabase/demo-seed-remove.sql
--
-- ── WHY IT CALLS THE RPCs INSTEAD OF INSERTING ROWS ──────────────────
--
-- Admitting and enrolling go through `admit_student` and
-- `enrol_student` with a real registrar's claims set, so the demo data
-- is produced by the same code a registrar uses: the duplicate guards
-- run, `enrollment_events` are written, class rosters are synchronised
-- by the Phase 1 fix, and audit rows are recorded. A seed that INSERTed
-- directly would produce data the product could never have produced,
-- and would hide exactly the defects a demo should surface.
--
-- ⚠️ WHAT THIS SEED DELIBERATELY DOES NOT DO
--
-- It does not write `period_grades`, and it leaves every submission in
-- DRAFT. Computed grades are the canonical engine's output, and the
-- engine lives in `compute-period-grades` — reproducing its arithmetic
-- here would be a second implementation of the grading rules, which is
-- the one thing this project does not allow. So the seed prepares
-- scores and stops; the lifecycle is driven through the product during
-- the demonstration, which is the part worth showing anyway.
--
-- See docs/27-phase-2-demo-readiness.md for the demo script.

\set ON_ERROR_STOP on

begin;

-- ------------------------------------------------------------
-- 0. Look before writing
-- ------------------------------------------------------------
-- This script only ADDS rows, inside a subtree it names itself. It
-- never edits or deletes anything it did not create, so the risk it
-- must guard against is not corruption — it is CONFUSION between demo
-- and official records. The DEMO- marking handles that.
--
-- So the guard is proportionate:
--
--   REFUSE   if the demo subtree already exists in a shape this script
--            did not create, because then it cannot safely rebuild it.
--   WARN     about learners of unknown provenance carrying an LRN, and
--            continue. An LRN is a national identifier, so a row with
--            one deserves a human's attention — but a single unexplained
--            learner should not block a demonstration when nothing this
--            script does can touch it.
--
-- An earlier version refused outright on any unknown LRN. It blocked a
-- harmless additive operation over one inert row, which is a guard
-- protecting itself rather than the data.
do $$
declare
  v_school uuid;
  v_found  text;
  v_n      int;
begin
  select id into v_school from public.schools where code = 'anhs';
  if v_school is null then
    raise exception 'No school with code ''anhs''. Run seed.sql first.';
  end if;

  -- A DEMO- learner that somehow carries an LRN is the one thing that
  -- would make the rebuild unsafe: it means something real acquired a
  -- demo student number.
  select count(*) into v_n
  from public.students st
  where st.school_id = v_school
    and st.student_number like 'DEMO-%'
    and st.lrn is not null;
  if v_n > 0 then
    raise exception
      '% learner(s) carry a DEMO- student number AND an LRN. Refusing to '
      'rebuild the demo subtree — check whether those are real records.', v_n
      using errcode = '42501';
  end if;

  select count(*), string_agg(public.student_display_name(st.*) || ' [' ||
                              coalesce(st.student_number,'no number') || ']', '; ')
    into v_n, v_found
  from public.students st
  where st.school_id = v_school
    and st.deleted_at is null
    and st.lrn is not null
    and coalesce(st.student_number, '') not like 'DEMO-%'
    and st.id::text not like 'a8%'
    and st.id::text not like 'b8%';

  if v_n > 0 then
    raise warning
      E'\n'
      '  ─────────────────────────────────────────────────────────────\n'
      '  % learner(s) here were not put there by seed.sql or by this\n'
      '  script, and they carry an LRN:\n'
      '      %\n'
      '  Nothing below touches them. But an LRN is a national\n'
      '  identifier — confirm these are test rows, not real learners.\n'
      '  ─────────────────────────────────────────────────────────────',
      v_n, v_found;
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Clear any previous demo subtree
-- ------------------------------------------------------------
-- Deletes only what this file created, identified by the demo student
-- number prefix and the demo section name. Nothing else is touched.
do $$
declare
  v_school uuid;
  v_section uuid;
begin
  select id into v_school from public.schools where code = 'anhs';
  select id into v_section from public.sections
   where school_id = v_school and name = 'Demo 10-A';

  if v_section is not null then
    delete from public.assessment_scores s
     using public.class_enrollments ce, public.classes cl
     where s.class_enrollment_id = ce.id and ce.class_id = cl.id
       and cl.section_id = v_section;

    delete from public.period_grades pg
     using public.class_enrollments ce, public.classes cl
     where pg.class_enrollment_id = ce.id and ce.class_id = cl.id
       and cl.section_id = v_section;

    delete from public.grade_submissions gs
     using public.classes cl
     where gs.class_id = cl.id and cl.section_id = v_section;

    delete from public.assessments a
     using public.classes cl
     where a.class_id = cl.id and cl.section_id = v_section;

    delete from public.class_enrollments ce
     using public.classes cl
     where ce.class_id = cl.id and cl.section_id = v_section;

    delete from public.classes where section_id = v_section;
  end if;

  delete from public.enrollment_events ev
   using public.enrollments e, public.students st
   where ev.enrollment_id = e.id and e.student_id = st.id
     and st.school_id = v_school and st.student_number like 'DEMO-%';

  delete from public.enrollments e
   using public.students st
   where e.student_id = st.id
     and st.school_id = v_school and st.student_number like 'DEMO-%';

  -- Unlink before deleting, or the portal account's FK holds the row.
  update public.students set portal_user_id = null
   where school_id = v_school and student_number like 'DEMO-%';

  delete from public.students
   where school_id = v_school and student_number like 'DEMO-%';

  if v_section is not null then
    delete from public.sections where id = v_section;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Build the demo section, classes, learners and scores
-- ------------------------------------------------------------
do $$
declare
  v_school   uuid;
  v_year     uuid;
  v_g10      uuid;
  v_reg      uuid;
  v_teacher  uuid;
  v_adviser  uuid;
  v_section  uuid;
  v_terms    uuid[];
  v_subject  uuid;
  v_class    uuid;
  v_res      jsonb;
  v_st       uuid;
  v_enr      uuid;
  v_ww       uuid;
  v_pt       uuid;
  v_rows     jsonb;
  v_scores   jsonb;
  v_cls      record;
  v_as       record;
  v_ce       record;
  i          int;
  t          int;
  v_code     text;
  v_raw      numeric;
begin
  select id into v_school from public.schools where code = 'anhs';
  select id into v_year   from public.academic_years
   where school_id = v_school and status = 'active' and period_structure = 'three_term';
  if v_year is null then
    raise exception 'No active three-term academic year for this school.';
  end if;

  select array(select id from public.academic_periods
                where academic_year_id = v_year order by ordinal)
    into v_terms;
  if array_length(v_terms, 1) <> 3 then
    raise exception 'Expected three terms, found %.', array_length(v_terms, 1);
  end if;

  select id into v_g10 from public.grade_levels
   where school_id = v_school and ordinal = 10;

  select u.id into v_reg     from public.users u where u.email = 'registrar@anhs.test';
  select u.id into v_teacher from public.users u where u.email = 'maria@anhs.test';
  select u.id into v_adviser from public.users u where u.email = 'juan@anhs.test';

  -- ---- the section, with a real adviser so the custody chain works --
  insert into public.sections
    (school_id, academic_year_id, grade_level_id, name, adviser_user_id, room, capacity)
  values (v_school, v_year, v_g10, 'Demo 10-A', v_adviser, 'Demo Room 1', 40)
  returning id into v_section;

  -- ---- four classes: three Core (20/50/30) and one MAPEH (20/60/20),
  --      so the demonstration shows both grading schemes side by side.
  foreach v_code in array array['MATH10', 'ENG10', 'SCI10', 'MAPEH10'] loop
    select id into v_subject from public.subjects
     where school_id = v_school and code = v_code;
    continue when v_subject is null;

    insert into public.classes
      (school_id, academic_year_id, section_id, subject_id, primary_teacher_id,
       schedule_note, room)
    values (v_school, v_year, v_section, v_subject, v_teacher,
            case v_code
              when 'MATH10'  then 'MWF 8:00-9:00'
              when 'ENG10'   then 'MWF 9:00-10:00'
              when 'SCI10'   then 'TTh 10:00-11:30'
              else 'TTh 13:00-14:00' end,
            case v_code when 'MAPEH10' then 'Gym' else 'Demo Room 1' end);
  end loop;

  -- ---- the learners, through the registrar's own RPCs ---------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id', v_school, 'sub', v_reg)::text, true);

  for i in 1..8 loop
    v_res := public.admit_student(
      jsonb_build_object(
        'firstName',     'Demo',
        'lastName',      'Student ' || lpad(i::text, 2, '0'),
        'studentNumber', 'DEMO-' || lpad(i::text, 4, '0'),
        -- No LRN. Ever. See the header.
        'sex',           case when i % 2 = 0 then 'female' else 'male' end),
      jsonb_build_object(
        'academicYearId', v_year,
        'gradeLevelId',   v_g10,
        'sectionId',      v_section,
        'remarks',        'DEMO DATA — not an official record'),
      -- Every one of these IS a namesake of the last, by design. The
      -- guard is doing its job; the seed is the one caller that can
      -- honestly say "yes, a different person".
      true);
    if v_res ->> 'status' <> 'created' then
      raise exception 'demo learner % was not created: %', i, v_res::text;
    end if;
  end loop;

  -- ---- assessments and scores, as the teacher -----------------------
  perform set_config('request.jwt.claims',
    jsonb_build_object('school_id', v_school, 'sub', v_teacher)::text, true);

  for v_cls in
    select cl.id as class_id, sub.code as subject_code, sub.subject_category_id as cat
    from public.classes cl
    join public.subjects sub on sub.id = cl.subject_id
    where cl.section_id = v_section
  loop
    select gc.id into v_ww from public.grade_components gc
      join public.subject_categories sc on sc.grading_scheme_id = gc.grading_scheme_id
     where sc.id = v_cls.cat and gc.code = 'WW' and gc.parent_component_id is null;
    select gc.id into v_pt from public.grade_components gc
      join public.subject_categories sc on sc.grading_scheme_id = gc.grading_scheme_id
     where sc.id = v_cls.cat and gc.code = 'PT' and gc.parent_component_id is null;

    -- TERM 1 and TERM 2 get work; TERM 3 is deliberately left empty so
    -- the demonstration can show an untouched term beside finished ones.
    for t in 1..2 loop
      v_rows := jsonb_build_array(
        jsonb_build_object('componentId', v_ww, 'ordinal', 1,
                           'title', 'Written Work 1', 'highestPossibleScore', 20),
        jsonb_build_object('componentId', v_ww, 'ordinal', 2,
                           'title', 'Written Work 2', 'highestPossibleScore', 25),
        jsonb_build_object('componentId', v_pt, 'ordinal', 1,
                           'title', 'Performance Task 1', 'highestPossibleScore', 30),
        jsonb_build_object('componentId', v_pt, 'ordinal', 2,
                           'title', 'Performance Task 2', 'highestPossibleScore', 40));
      perform public.save_assessments(v_cls.class_id, v_terms[t], v_rows);
    end loop;

    -- Scores. Spread across the band so Analytics and the LOA have
    -- something to show: most learners passing comfortably, a couple
    -- near the pass mark, and — in TERM 2 ONLY — one deliberate gap so
    -- the "missing score" state is visible during the demonstration.
    for t in 1..2 loop
      v_scores := '[]'::jsonb;
      for v_ce in
        select ce.id, row_number() over (order by st.last_name) as rn
        from public.class_enrollments ce
        join public.enrollments e on e.id = ce.enrollment_id
        join public.students st   on st.id = e.student_id
        where ce.class_id = v_cls.class_id and ce.status = 'active'
      loop
        for v_as in
          select a.id, a.highest_possible_score as hps, a.ordinal
          from public.assessments a
          where a.class_id = v_cls.class_id and a.academic_period_id = v_terms[t]
        loop
          -- A deterministic spread: learner 1 strongest, learner 8
          -- weakest, never below 60% so nothing looks broken.
          v_raw := round(v_as.hps * (0.95 - (v_ce.rn - 1) * 0.045), 0);
          continue when t = 2 and v_ce.rn = 3 and v_as.ordinal = 2;
          v_scores := v_scores || jsonb_build_object(
            'assessmentId', v_as.id, 'classEnrollmentId', v_ce.id, 'raw', v_raw);
        end loop;
      end loop;
      if jsonb_array_length(v_scores) > 0 then
        perform public.save_scores(v_scores);
      end if;
    end loop;
  end loop;
end $$;

commit;

\echo ''
\echo '  Demo dataset ready.'
\echo '  Section  : Demo 10-A (Grade 10, ANHS, SY 2026-2027)'
\echo '  Learners : Demo Student 01..08, student numbers DEMO-0001.., no LRN'
\echo '  Classes  : Mathematics 10, English 10, Science 10, MAPEH 10'
\echo '  Terms    : Term 1 and Term 2 have scores; Term 3 is empty on purpose'
\echo '  Grades   : NOT seeded. The canonical engine computes them when a'
\echo '             teacher submits, which is what the demonstration shows.'
\echo ''
