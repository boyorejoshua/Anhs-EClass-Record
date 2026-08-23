-- 0024 — Call it what DepEd calls it.
--
-- `academic_years.period_structure` has accepted 'trimester' since 0003.
-- DepEd Order 009 s. 2026 is titled "Guidelines on the Implementation of
-- the THREE-TERM School Calendar in Basic Education" and uses Term 1,
-- Term 2, Term 3 throughout. It never says trimester.
--
-- The words are not interchangeable to the people who use this system.
-- A trimester is a generic three-part division; the Three-Term School
-- Calendar is a specific, dated policy with 201 class days and its own
-- assessment rules. Naming the column value after the policy keeps the
-- data self-describing.
--
-- Renamed now, while one value in two rows is all that has to change.

alter table public.academic_years drop constraint if exists academic_years_period_structure_check;

update public.academic_years set period_structure = 'three_term'
where period_structure = 'trimester';

alter table public.academic_years add constraint academic_years_period_structure_check
  check (period_structure in ('three_term', 'quarter', 'semester', 'custom'));

comment on column public.academic_years.period_structure is
  'three_term = DepEd Order 009 s.2026, the Three-Term School Calendar. '
  'quarter = the four-quarter calendar it replaced, kept because historical '
  'years and other schools still use it. The value drives which grading '
  'data applies (see 0023), so it is policy, not decoration.';
