-- 0027 — The OFFICIAL DepEd three-term grading data.
--
-- Migration 0023 seeded a transmutation table taken from the school's
-- own workbook, which said of itself: "(Waiting for the Official DepEd
-- Order)". The official Electronic Class Record has now been published
-- on the DepEd Learning Standards guide site, and its HELPER sheet
-- carries the real table. They are NOT the same.
--
-- Source: the two official workbooks, whose HELPER!B8:D48 is identical
-- in both — the table does not vary by subject:
--   Grades_2-10_3Term_EClass_Record_for_EPPTLE_TLE_Music_and_Arts_PE_and_Health.xlsx
--   Grades_2-10_3Term_EClass_Record_for_Science_Math_English_Filipino_GMRCVE_Araling_Panlipunan.xlsx
--
-- WHERE THEY DIVERGE
--
--   Initial   school-supplied (0023)   OFFICIAL      difference
--   grade     transmutes to            transmutes to
--   ------------------------------------------------------------
--   30.00     60                       66            +6
--   50.00     64                       71            +7
--   65.00     72                       74            +2
--   69.99     74                       74            same
--   70.00     75                       75            same  ← the pass line
--   88.50     90                       91            +1
--   99.00     99                       99            same
--
-- The one thing 0023 got right is the thing that mattered most: PASSING
-- STILL BEGINS AT AN INITIAL GRADE OF 70, not 60. That finding stands.
-- Everything below the pass line was wrong, and wrong in the direction
-- that under-reports a struggling learner by up to seven points.
--
-- ✅ NOTHING TO RECOMPUTE. `period_grades` held 0 rows when this was
-- written, so no learner has a grade on record that was produced with
-- the superseded table. Checked, not assumed.
--
-- The 0023 table is kept rather than deleted, renamed so it cannot be
-- picked up by mistake. It is the record of what the school was working
-- from before the order landed, and `period_grades.scheme_snapshot`
-- would need it to explain any grade that had been computed under it.

-- ------------------------------------------------------------
-- The official table
-- ------------------------------------------------------------
do $$
declare
  v_school uuid;
  v_table  uuid;
  v_year   uuid;
begin
  for v_school in
    select s.id from public.schools s
    where exists (
      select 1 from public.academic_years y
      where y.school_id = s.id and y.period_structure = 'three_term')
  loop
    select y.id into v_year
    from public.academic_years y
    where y.school_id = v_school and y.period_structure = 'three_term'
    order by y.start_date
    limit 1;

    insert into public.transmutation_tables (school_id, name, effective_from_year_id, notes)
    values (
      v_school,
      'DO 015 s.2026 — official (three-term)',
      v_year,
      'Transcribed from HELPER!B8:D48 of the official DepEd Electronic '
      || 'Class Record for the three-term calendar. Identical in the '
      || 'EPP/TLE/MAPEH and core-subject workbooks. Passing (75) begins '
      || 'at an initial grade of 70.')
    on conflict (school_id, name) do update set notes = excluded.notes
    returning id into v_table;

    if v_table is null then
      select id into v_table from public.transmutation_tables
      where school_id = v_school and name = 'DO 015 s.2026 — official (three-term)';
    end if;

    delete from public.transmutation_bands where transmutation_table_id = v_table;

    insert into public.transmutation_bands
      (school_id, transmutation_table_id, min_initial, max_initial, output_grade)
    select v_school, v_table, t.lo, t.hi, t.g
    from (values
      (99.50, 100.00, 100), (98.32, 99.49, 99), (97.14, 98.31, 98),
      (95.96, 97.13, 97),   (94.78, 95.95, 96), (93.60, 94.77, 95),
      (92.42, 93.59, 94),   (91.24, 92.41, 93), (90.06, 91.23, 92),
      (88.88, 90.05, 91),   (87.70, 88.87, 90), (86.52, 87.69, 89),
      (85.34, 86.51, 88),   (84.16, 85.33, 87), (82.98, 84.15, 86),
      (81.80, 82.97, 85),   (80.62, 81.79, 84), (79.44, 80.61, 83),
      (78.26, 79.43, 82),   (77.08, 78.25, 81), (75.90, 77.07, 80),
      (74.72, 75.89, 79),   (73.54, 74.71, 78), (72.36, 73.53, 77),
      (71.18, 72.35, 76),   (70.00, 71.17, 75),
      -- Below the pass line the bands widen sharply: the official table
      -- spreads 60-74 across the whole 0-69.99 range, where the
      -- school-supplied one collapsed 0-39.99 onto a flat 60.
      (65.34, 69.99, 74),   (60.67, 65.33, 73), (56.01, 60.66, 72),
      (51.34, 56.00, 71),   (46.67, 51.33, 70), (42.01, 46.66, 69),
      (37.34, 42.00, 68),   (32.68, 37.33, 67), (28.01, 32.67, 66),
      (23.35, 28.00, 65),   (18.68, 23.34, 64), (14.01, 18.67, 63),
      (9.35, 14.00, 62),    (4.68, 9.34, 61),   (0.00, 4.67, 60)
    ) as t(lo, hi, g);

    -- Retire the school's anticipation, do not delete it. It is the
    -- record of what they were working from, and a grade computed under
    -- it could only be explained by keeping it.
    update public.transmutation_tables
    set name = 'Three-term (school anticipation, SUPERSEDED by 0027)',
        notes = 'Superseded by the official DepEd table. Retained for '
             || 'provenance only — nothing references it. See 0027.'
    where school_id = v_school
      and name = 'Three-term (school-supplied, pending DepEd issuance)';

    -- Point every three-term scheme at the official table.
    update public.grading_schemes gs
    set transmutation_table_id = v_table
    where gs.school_id = v_school
      and gs.transmutation_table_id = (
        select id from public.transmutation_tables
        where school_id = v_school
          and name = 'Three-term (school anticipation, SUPERSEDED by 0027)');
  end loop;
end $$;

-- ------------------------------------------------------------
-- Descriptor descriptions
-- ------------------------------------------------------------
-- The five bands themselves were already right — 0023 matched the
-- official file exactly. What the official file adds is the sentence
-- that goes with each one, which belongs on a report card next to the
-- word rather than being paraphrased by whoever prints it.
alter table public.descriptor_bands
  add column if not exists general_description text;

comment on column public.descriptor_bands.general_description is
  'The official DepEd wording for this band, verbatim from HELPER!H of '
  'the three-term Electronic Class Record. Displayed with the label; '
  'never edited locally.';

update public.descriptor_bands set general_description = v.text
from (values
  ('Advancing',
   'Consistently demonstrates skills and understanding that meet or exceed '
   || 'standards with independence, flexibility, and depth.'),
  ('Benchmarking',
   'Demonstrates expected grade-level skills and understanding competently '
   || 'and independently.'),
  ('Connecting',
   'Demonstrates sufficient understanding and application of grade-level '
   || 'standards with occasional guidance and support'),
  ('Developing',
   'Demonstrates partial understanding and inconsistent application of '
   || 'skills, requires targeted support and scaffolding'),
  ('Emerging',
   'Does not yet demonstrate foundational skills and understanding; '
   || 'requires intensive support.')
) as v(label, text)
where public.descriptor_bands.label = v.label
  and public.descriptor_bands.general_description is distinct from v.text;
