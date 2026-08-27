-- =====================================================================
-- 0036  SENIOR HIGH GRADE LEVELS, AND A DIRECTORY THAT IS NOT A DUMP
-- =====================================================================
--
-- Two things a registrar found by using the product.
--
-- 1. GRADES 11 AND 12 DID NOT EXIST.
--
--    `grade_levels` has been rows rather than a fixed <select> since
--    migration 0003, and 0003 says so in a comment — the schema was
--    never the limit. But only G7-G10 were ever seeded, so every grade
--    level dropdown in the product (add a section, add a class, admit a
--    learner) stopped at Grade 10. A school running Senior High could
--    not enter Senior High. "Configurable" is worth nothing to the
--    person in front of the screen if nobody configured it.
--
--    Seeded here for every existing school, and for every school that
--    already reaches Grade 10 — which is the honest test for "this is a
--    secondary school", the only kind we sell to today.
--
--    NOT done here, and deliberately: DepEd Senior High runs on
--    SEMESTERS with two quarters each, carries tracks and strands
--    (Academic/STEM, TVL, and the rest), and grades Core, Applied and
--    Specialized subjects on different weights than the Grades 4-10
--    order. `academic_periods` are already rows, so a semestral year is
--    data entry rather than a rewrite; tracks and strands are not
--    modelled at all yet. Recorded in the assumptions register rather
--    than half-built here.
--
-- 2. OPENING "STUDENTS" SHIPPED THE ENTIRE DIRECTORY TO THE BROWSER.
--
--    `rds.students` took a year and an optional search, and the screen
--    called it with no search on mount. Grade level and section then
--    filtered CLIENT-SIDE, over rows already delivered. For the seven
--    learners in the demo that reads as instant. For a real school of
--    1,500 it is a slow screen that has also handed every learner's LRN
--    to anyone who opens devtools — RLS permitted the read, so this is
--    not a hole, but there was no reason to make it either.
--
--    So the filter moves into the database, and the screen gets
--    something to filter BY before it asks for anything: a census of
--    grade levels with a count each, which is one small row per grade
--    rather than every learner in the school.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Senior High grade levels
-- ---------------------------------------------------------------------
--
-- `key_stage` is 'SHS' rather than a KS number: Grades 11-12 are not a
-- continuation of the junior high key stage, they are a separate cycle
-- with their own curriculum and their own grading weights. Anything
-- that later needs to ask "is this Senior High?" should ask this column
-- rather than `ordinal >= 11`, because ordinal is a school's own
-- numbering and need not mean what we assume.
insert into public.grade_levels (school_id, code, name, ordinal, key_stage)
select s.id, v.code, v.name, v.ordinal, 'SHS'
from public.schools s
cross join (values ('G11','Grade 11',11), ('G12','Grade 12',12)) as v(code, name, ordinal)
where exists (
  select 1 from public.grade_levels g
  where g.school_id = s.id and g.ordinal = 10
)
on conflict (school_id, code) do nothing;

-- ---------------------------------------------------------------------
-- 2. The grade level census
-- ---------------------------------------------------------------------
--
-- Every grade level the school HAS, with how many learners sit in it
-- this year. Levels with nobody in them are still returned, with zero —
-- a registrar setting up Grade 11 for the first time needs to see that
-- Grade 11 exists and is empty, not to wonder where it went.
create or replace function rds.grade_level_census(p_year_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(t order by t.ordinal), '[]'::jsonb)
  from (
    select
      gl.id,
      gl.name,
      gl.code,
      gl.ordinal,
      gl.key_stage as "keyStage",
      (select count(*)
         from public.enrollments e
        where e.grade_level_id = gl.id
          and e.academic_year_id = p_year_id
          -- 'enrolled' and 'transferred_in' are both "here now". A
          -- transferee who arrived in October is a learner the registrar
          -- has to find, and counting only 'enrolled' would hide them.
          and e.status in ('enrolled','transferred_in')) as enrolled,
      (select count(*)
         from public.sections sec
        where sec.grade_level_id = gl.id
          and sec.academic_year_id = p_year_id) as sections
    from public.grade_levels gl
    where gl.is_active
  ) t
$$;

comment on function rds.grade_level_census(uuid) is
  'Grade levels with an enrolled count, so the directory can be entered '
  'one level at a time instead of loading every learner in the school.';

-- ---------------------------------------------------------------------
-- 3. rds.students, narrowed in the database
-- ---------------------------------------------------------------------
--
-- Dropped and recreated rather than replaced: adding defaulted
-- parameters to a `create or replace` leaves the old signature in place,
-- and a two-argument call would then match both and fail as ambiguous.
drop function if exists rds.students(uuid, text);

create or replace function rds.students(
  p_year_id        uuid,
  p_search         text default null,
  p_grade_level_id uuid default null,
  p_section_id     uuid default null,
  p_limit          int  default 500
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(s order by s ->> 'displayName'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'studentId',      st.id,
      'displayName',    public.student_display_name(st.*),
      'studentNumber',  st.student_number,
      'lrn',            st.lrn,
      'sex',            st.sex,
      'gradeLevelId',   gl.id,
      'gradeLevel',     gl.name,
      'sectionId',      sec.id,
      'section',        sec.name,
      'enrollmentStatus', e.status,
      'generalAverage', e.general_average
    ) as s
    from public.students st
    join public.enrollments e   on e.student_id = st.id and e.academic_year_id = p_year_id
    join public.grade_levels gl on gl.id = e.grade_level_id
    left join public.sections sec on sec.id = e.section_id
    where st.deleted_at is null
      and (p_grade_level_id is null or e.grade_level_id = p_grade_level_id)
      and (p_section_id     is null or e.section_id     = p_section_id)
      and (
        p_search is null or btrim(p_search) = ''
        or public.student_display_name(st.*) ilike '%' || btrim(p_search) || '%'
        or coalesce(st.lrn, '')            ilike '%' || btrim(p_search) || '%'
        or coalesce(st.student_number, '') ilike '%' || btrim(p_search) || '%'
      )
    -- Ordered before the cap so the cap takes the first N alphabetically
    -- rather than whatever the planner happened to emit first.
    order by public.student_display_name(st.*)
    limit greatest(coalesce(p_limit, 500), 1)
  ) t
$$;

comment on function rds.students(uuid, text, uuid, uuid, int) is
  'Learner directory for one school year. Grade level and section filter '
  'HERE rather than in the browser: a school of 1,500 should not ship '
  'every LRN to the client so the client can hide most of them.';

-- ---------------------------------------------------------------------
-- 4. Public wrappers
-- ---------------------------------------------------------------------
--
-- The client only ever reaches `public`; `rds` is the implementation.
-- `students_directory` has to be dropped and recreated for the same
-- reason as the function beneath it — a defaulted parameter added to a
-- replace leaves the narrower signature callable and ambiguous.
drop function if exists public.students_directory(uuid, text);

create or replace function public.students_directory(
  p_year_id        uuid,
  p_search         text default null,
  p_grade_level_id uuid default null,
  p_section_id     uuid default null,
  p_limit          int  default 500
)
returns jsonb language sql stable as $$
  select rds.students(p_year_id, p_search, p_grade_level_id, p_section_id, p_limit)
$$;

create or replace function public.grade_level_census(p_year_id uuid)
returns jsonb language sql stable as $$ select rds.grade_level_census(p_year_id) $$;

grant execute on function
  rds.grade_level_census(uuid), public.grade_level_census(uuid),
  rds.students(uuid, text, uuid, uuid, int),
  public.students_directory(uuid, text, uuid, uuid, int)
to authenticated;

commit;
