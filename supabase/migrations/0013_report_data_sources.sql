-- ============================================================
-- 0013 · Report data sources (Layer 2)
-- ============================================================
-- The contract layer between core academic data and school-owned
-- templates. A template NEVER queries a table directly; it binds to one
-- of these named, versioned functions and receives a stable JSON
-- payload. That boundary is what lets a school with a slightly
-- different SF10 get a new TEMPLATE rather than a code change.

create schema if not exists rds;
comment on schema rds is
  'Report data sources. One named, versioned contract per form. '
  'Templates bind to these, never to tables.';

grant usage on schema rds to authenticated;

-- ------------------------------------------------------------
-- rds.sf10_jhs(student_id) -> jsonb
-- ------------------------------------------------------------
-- Shaped directly from the school's blank SF10-JHS (SFRT Revised 2017):
--
--   learner            LEARNER'S INFORMATION
--   eligibility        ELIGIBILITY FOR JHS ENROLMENT
--   scholastic_records one block per school year, each with its own
--                      school details, learning areas (MAPEH nesting
--                      its children), period ratings, final rating,
--                      general average and remedial block
--   certification      CERTIFICATION footer
--
-- `periods` is returned as an ORDERED ARRAY rather than fixed q1..q4
-- keys, because the number of periods is a property of the school year.
-- The template decides how many columns to print. This is the seam
-- where a three-term school meets a four-column form.
create or replace function rds.sf10_jhs(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, rds, pg_temp
as $$
declare
  v_school_id uuid := app.current_school_id();
  v_payload   jsonb;
begin
  -- Authorisation: registrar-level access, or the learner's own record.
  if not (app.has_permission('students.read.all')
          or p_student_id = app.current_student_id()) then
    raise exception 'not authorised to read this learner''s permanent record'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'form',    'SF10-JHS',
    'revision','SFRT Revised 2017',

    'learner', (
      select jsonb_build_object(
        'last_name',   s.last_name,
        'first_name',  s.first_name,
        'middle_name', s.middle_name,
        'name_extension', s.suffix,
        'lrn',         s.lrn,
        'birthdate',   to_char(s.birth_date, 'MM/DD/YYYY'),
        'sex',         initcap(coalesce(s.sex, ''))
      )
      from public.students s
      where s.id = p_student_id and s.school_id = v_school_id
    ),

    'eligibility', (
      select jsonb_build_object(
        'type',                 e.eligibility_type,
        'general_average',      e.general_average,
        'citation',             e.citation,
        'prev_school_name',     e.prev_school_name,
        'prev_school_govt_id',  e.prev_school_govt_id,
        'prev_school_address',  e.prev_school_address,
        'credential_presented', e.credential_presented,
        'exam_rating',          e.exam_rating,
        'exam_date',            to_char(e.exam_date, 'MM/DD/YYYY')
      )
      from public.student_eligibility e
      where e.student_id = p_student_id
    ),

    'scholastic_records', coalesce((
      select jsonb_agg(block order by block ->> 'school_year')
      from (
        select jsonb_build_object(
          'school_year',    ay.label,
          'grade_level',    gl.name,
          'section',        sec.name,
          -- The recording school. NULL overrides mean this tenant's own
          -- school; a value means the learner spent that year elsewhere.
          'school_name',    coalesce(en.recording_school_name,    sch.name),
          'school_govt_id', coalesce(en.recording_school_govt_id, sch.govt_school_id),
          'district',       coalesce(en.recording_district,       sch.district),
          'division',       coalesce(en.recording_division,       sch.division),
          'region',         coalesce(en.recording_region,         sch.region),
          'adviser',        coalesce(en.adviser_name,
                                     nullif(trim(adv.first_name || ' ' || adv.last_name), '')),

          -- Column headers come from the year's own period rows, so a
          -- three-term year yields three and a four-quarter year four.
          'periods', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'ordinal', p.ordinal, 'name', p.name, 'short_name', p.short_name)
                     order by p.ordinal), '[]'::jsonb)
            from public.academic_periods p
            where p.academic_year_id = ay.id
          ),

          'learning_areas', (
            select coalesce(jsonb_agg(la order by (la ->> 'ordinal')::int, la ->> 'title'), '[]'::jsonb)
            from (
              select jsonb_build_object(
                'subject_id',   sub.id,
                'title',        sub.title,
                'is_child',     sub.parent_subject_id is not null,
                'parent_id',    sub.parent_subject_id,
                'ordinal',      coalesce(sc.ordinal, 99),
                'period_ratings', (
                  select coalesce(jsonb_agg(jsonb_build_object(
                           'ordinal', p2.ordinal, 'rating', pg.period_grade)
                           order by p2.ordinal), '[]'::jsonb)
                  from public.academic_periods p2
                  left join public.period_grades pg
                    on pg.class_enrollment_id = ce.id
                   and pg.academic_period_id = p2.id
                   and pg.is_current
                  where p2.academic_year_id = ay.id
                ),
                'final_rating', (
                  select fsg.final_grade from public.final_subject_grades fsg
                  where fsg.class_enrollment_id = ce.id and fsg.is_current
                ),
                'remarks', (
                  select fsg.remark from public.final_subject_grades fsg
                  where fsg.class_enrollment_id = ce.id and fsg.is_current
                )
              ) as la
              from public.class_enrollments ce
              join public.classes cl  on cl.id = ce.class_id
              join public.subjects sub on sub.id = cl.subject_id
              left join public.subject_categories sc on sc.id = sub.subject_category_id
              where ce.enrollment_id = en.id
            ) areas
          ),

          'general_average', en.general_average,
          'promotion_status', upper(coalesce(en.promotion_status, '')),

          'remedial', (
            select jsonb_build_object(
              'conducted_from', to_char(rc.conducted_from, 'MM/DD/YYYY'),
              'conducted_to',   to_char(rc.conducted_to,   'MM/DD/YYYY'),
              'marks', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'subject',                sub2.title,
                  'final_rating',           rm.final_rating,
                  'remedial_class_mark',    rm.remedial_class_mark,
                  'recomputed_final_grade', rm.recomputed_final_grade,
                  'remarks',                rm.remarks))
                from public.remedial_marks rm
                join public.subjects sub2 on sub2.id = rm.subject_id
                where rm.remedial_class_id = rc.id), '[]'::jsonb)
            )
            from public.remedial_classes rc where rc.enrollment_id = en.id
          )
        ) as block
        from public.enrollments en
        join public.academic_years ay on ay.id = en.academic_year_id
        join public.grade_levels gl   on gl.id = en.grade_level_id
        join public.schools sch       on sch.id = en.school_id
        left join public.sections sec on sec.id = en.section_id
        left join public.users adv    on adv.id = sec.adviser_user_id
        where en.student_id = p_student_id
      ) blocks
    ), '[]'::jsonb),

    'certification', (
      select jsonb_build_object(
        'school_name',    sch.name,
        'school_govt_id', sch.govt_school_id,
        'principal_name', (select value #>> '{}' from public.school_settings
                           where school_id = v_school_id and key = 'principal_name'),
        'generated_on',   to_char(current_date, 'MM/DD/YYYY')
      )
      from public.schools sch where sch.id = v_school_id
    )
  ) into v_payload;

  return v_payload;
end;
$$;

comment on function rds.sf10_jhs is
  'SF10-JHS data source. Returns periods as an ordered array, not fixed '
  'q1..q4 keys — the count is a property of the school year, and the '
  'template decides how many columns to print.';

grant execute on function rds.sf10_jhs(uuid) to authenticated;
