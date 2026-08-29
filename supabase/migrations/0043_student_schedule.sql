-- 0043 — The learner's own schedule.
--
-- ── WHAT THE SCHEMA ACTUALLY HOLDS ────────────────────────────────────
--
-- There is no schedule model in this database. Searched for day,
-- start_time, end_time, timetable, meeting, time_slot: none exist. What
-- exists is `classes.schedule_note` — a free-typed string, 'MWF
-- 8:00-9:00' by convention and nothing by constraint — and
-- `classes.room`, also free text.
--
-- So this function REUSES what is there rather than inventing a
-- structure. Every field it returns comes from a real column:
--
--   subject        subjects.title / .code
--   teacher        users, via classes.primary_teacher_id
--   when           classes.schedule_note, VERBATIM
--   room           classes.room
--
-- ⚠️ IT DOES NOT PARSE `schedule_note`. Turning 'MWF 8:00-9:00' into a
-- Monday 08:00 row would be inventing structure the database does not
-- hold, from a string nothing validates. A learner shown a confidently
-- wrong start time is worse served than one shown the note their
-- teacher actually wrote. A real timetable needs a `class_meetings`
-- table; that is a Phase 2 decision and is deliberately not made here.
--
-- ── HOW THE LEARNER IS RESOLVED ───────────────────────────────────────
--
-- No parameter. Not a student id, not an enrolment id, not a class id.
-- The chain is entirely server-side:
--
--   verified JWT → app.current_student_id() → the ACTIVE year's
--   enrolment → class_enrollments with status 'active' → classes
--
-- A client that could name an enrolment could name somebody else's, and
-- no amount of care in the screen would prevent it.
--
-- SECURITY INVOKER, deliberately. The RLS policies on students,
-- enrollments, class_enrollments and classes are what decide this, and
-- they already do — a definer would be a second, weaker opinion about a
-- question the policies answer correctly.
--
-- ── WHY 'active' TWICE ────────────────────────────────────────────────
--
--   academic_years.status = 'active'   the CURRENT year, so last year's
--                                      timetable is not shown as though
--                                      it were this morning's.
--   class_enrollments.status = 'active' the classes they are in NOW.
--                                      Phase 1 made this column mean
--                                      something: a learner transferred
--                                      out of Pearl keeps their marks
--                                      there and stops appearing on its
--                                      roster, and their schedule has to
--                                      agree with the roster.

begin;

create or replace function rds.my_schedule()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'enrollment', (
      select jsonb_build_object(
        'academicYear', ay.label,
        'gradeLevel',   gl.name,
        'section',      sec.name,
        'status',       e.status)
      from public.enrollments e
      join public.academic_years ay on ay.id = e.academic_year_id
      join public.grade_levels gl   on gl.id = e.grade_level_id
      left join public.sections sec on sec.id = e.section_id
      where e.student_id = app.current_student_id()
        and ay.status = 'active'
      order by e.date_enrolled desc
      limit 1
    ),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'classId',      cl.id,
               'subject',      sub.title,
               'subjectCode',  sub.code,
               -- Null rather than an empty string when unassigned, so
               -- the screen can say "no teacher assigned" instead of
               -- rendering a blank the reader has to interpret.
               'teacher',      nullif(concat_ws(', ', u.last_name, u.first_name), ''),
               -- Verbatim. Not parsed, not normalised, not guessed.
               'when',         nullif(btrim(coalesce(cl.schedule_note, '')), ''),
               'room',         nullif(btrim(coalesce(cl.room, '')), ''))
             order by sub.title)
      from public.enrollments e
      join public.academic_years ay  on ay.id = e.academic_year_id
      join public.class_enrollments ce on ce.enrollment_id = e.id
      join public.classes cl          on cl.id = ce.class_id
      join public.subjects sub        on sub.id = cl.subject_id
      left join public.users u        on u.id = cl.primary_teacher_id
      where e.student_id = app.current_student_id()
        and ay.status = 'active'
        and ce.status = 'active'
        and cl.status = 'active'
    ), '[]'::jsonb)
  )
$fn$;

comment on function rds.my_schedule is
  'The signed-in learner''s current classes: subject, teacher, the '
  'schedule note as written, and room. Takes no parameters — the '
  'learner comes from the verified JWT. Does NOT parse schedule_note '
  'into days and times; this database has no timetable model.';

create or replace function public.my_schedule()
returns jsonb language sql stable
set search_path = public, pg_temp
as $fn$ select rds.my_schedule() $fn$;

grant execute on function rds.my_schedule(), public.my_schedule() to authenticated;
revoke execute on function rds.my_schedule(), public.my_schedule() from public, anon;

commit;
