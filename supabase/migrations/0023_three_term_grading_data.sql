-- 0023 — The grading data the three-term calendar actually uses.
--
-- The school supplied its live three-term class record,
-- `EClassRecordEditableEPPandTLE.xlsx`. Comparing it against what this
-- database holds turned up a correctness gap, not a cosmetic one:
--
--   • The seeded transmutation table is the FOUR-QUARTER one. The
--     three-term sheets use a different table, named `NewTransmu` in the
--     workbook, which is materially harsher — a learner needs an initial
--     grade of 70 to reach 75, where the old table needed 60.
--
--   • The descriptors are new. "Did Not Meet Expectations / Fairly
--     Satisfactory / Satisfactory / Very Satisfactory / Outstanding"
--     become "Emerging / Developing / Connecting / Benchmarking /
--     Advancing".
--
-- The component weights the workbook carries — 20/50/30 for core
-- subjects and 20/60/20 for EPP and TLE — MATCH what was already
-- implemented from DO 015 s. 2026. That part needs no change, and the
-- agreement is worth recording: it is independent confirmation from a
-- real artifact.
--
-- ⚠️ NOT YET OFFICIAL. Two pieces of evidence agree:
--
--   1. The workbook's own cell INPUT!A3 reads
--      "(Waiting for the Official DepEd Order)".
--   2. DO 009 s. 2026, the three-term calendar order, states:
--      "A separate issuance on classroom assessments, grading system,
--      and awards and recognition shall be released."
--
-- So this is the school's anticipation of an order DepEd had not issued
-- as of 16 April 2026. That is precisely the case this schema was built
-- for: transmutation tables and grading schemes carry
-- effective_from_year_id, so adopting a table is a data operation and
-- superseding it later is another one. No computed grade is disturbed,
-- because period_grades.scheme_snapshot records the rules each grade was
-- issued under.
--
-- Tracked as F20-F22 in docs/20-assumptions-register.md.

-- =====================================================================
-- SCOPED BY CALENDAR, NOT BY SCHOOL
-- =====================================================================
--
-- Every school running a THREE-TERM year gets this table; a school still
-- on four quarters keeps the old one. Written as a set operation over
-- academic_years rather than against a hard-coded ANHS id, because the
-- rule really is "this is how three-term years are graded" — nothing
-- about it is specific to one school.

do $$
declare
  v_year   record;
  v_table  uuid;
  v_scheme record;
begin
  for v_year in
    select ay.id, ay.school_id, ay.label
    from public.academic_years ay
    where ay.period_structure = 'trimester'      -- renamed to three_term in 0024
  loop
    -- One table per school+year, idempotent on re-run.
    select tt.id into v_table
    from public.transmutation_tables tt
    where tt.school_id = v_year.school_id
      and tt.effective_from_year_id = v_year.id
      and tt.name = 'Three-term (school-supplied, pending DepEd issuance)';

    if v_table is null then
      insert into public.transmutation_tables (school_id, name, effective_from_year_id, notes)
      values (
        v_year.school_id,
        'Three-term (school-supplied, pending DepEd issuance)',
        v_year.id,
        'Transcribed from the named range NewTransmu in the school''s own '
        || 'EClassRecordEditableEPPandTLE.xlsx. The workbook itself is marked '
        || '"(Waiting for the Official DepEd Order)", and DO 009 s.2026 says a '
        || 'separate issuance on the grading system will follow. Supersede this '
        || 'when that order lands; do NOT edit it in place, or grades already '
        || 'issued will silently change meaning.'
      )
      returning id into v_table;

      insert into public.transmutation_bands
        (school_id, transmutation_table_id, min_initial, max_initial, output_grade)
      select v_year.school_id, v_table, b.lo, b.hi, b.out
      from (values
        (0.00,39.99,60),(40.00,42.99,61),(43.00,45.99,62),(46.00,47.99,63),
        (48.00,49.99,64),(50.00,51.99,65),(52.00,53.99,66),(54.00,55.99,67),
        (56.00,57.99,68),(58.00,59.99,69),(60.00,61.99,70),(62.00,63.99,71),
        (64.00,65.99,72),(66.00,67.99,73),(68.00,69.99,74),(70.00,72.99,75),
        (73.00,74.99,76),(75.00,75.99,77),(76.00,76.99,78),(77.00,77.99,79),
        (78.00,78.99,80),(79.00,79.99,81),(80.00,80.99,82),(81.00,81.99,83),
        (82.00,82.99,84),(83.00,83.99,85),(84.00,84.99,86),(85.00,85.99,87),
        (86.00,86.99,88),(87.00,87.99,89),(88.00,88.99,90),(89.00,89.99,91),
        (90.00,90.99,92),(91.00,91.99,93),(92.00,92.99,94),(93.00,93.99,95),
        (94.00,94.99,96),(95.00,95.99,97),(96.00,97.49,98),(97.50,99.49,99),
        (99.50,100.00,100)
      ) as b(lo, hi, out);
    end if;

    -- Point this year's schemes at it, and restate the descriptors.
    for v_scheme in
      select gs.id from public.grading_schemes gs
      where gs.school_id = v_year.school_id
        and gs.effective_from_year_id = v_year.id
    loop
      update public.grading_schemes
      set transmutation_table_id = v_table
      where id = v_scheme.id;

      delete from public.descriptor_bands where grading_scheme_id = v_scheme.id;

      -- Remark is still PASSED/FAILED at the pass mark: the workbook's
      -- SUMMARY sheet computes IF(final >= 75, "PASSED", "FAILED"), and
      -- the descriptor is a separate axis from the remark.
      insert into public.descriptor_bands
        (school_id, grading_scheme_id, min_grade, max_grade, label, remark, ordinal)
      values
        (v_year.school_id, v_scheme.id,  0.00,  64.99, 'Emerging',     'Failed', 1),
        (v_year.school_id, v_scheme.id, 65.00,  74.99, 'Developing',   'Failed', 2),
        (v_year.school_id, v_scheme.id, 75.00,  79.99, 'Connecting',   'Passed', 3),
        (v_year.school_id, v_scheme.id, 80.00,  89.99, 'Benchmarking', 'Passed', 4),
        (v_year.school_id, v_scheme.id, 90.00, 100.00, 'Advancing',    'Passed', 5);
    end loop;
  end loop;
end $$;

comment on table public.transmutation_bands is
  'Transmutation is DATA, keyed to a school year. Two tables now coexist: '
  'the four-quarter DepEd transitional table, and the three-term table the '
  'school supplied. A grade keeps the rules it was issued under via '
  'period_grades.scheme_snapshot, so adding a table never rewrites history.';
