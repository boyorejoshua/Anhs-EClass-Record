-- ============================================================
-- seed.sql · Two schools, two period structures, one codebase
-- ============================================================
-- School A — Angono NHS: THREE TERMS (DepEd Order 009 s.2026)
-- School B — Mendtrix Demo NHS: FOUR QUARTERS
--
-- Both run on identical code. The difference is rows, not branches.
-- This is the artifact that proves V0's `term in (1,2,3)` is gone.
--
-- Run as a superuser / service_role: RLS is forced on every table.

begin;

-- ------------------------------------------------------------
-- Schools
-- ------------------------------------------------------------
insert into public.schools (id, code, name, govt_school_id, school_type, region, division, district) values
  ('11111111-1111-1111-1111-111111111111','anhs','Angono National High School','301417','public','IV-A CALABARZON','Rizal','Angono'),
  ('22222222-2222-2222-2222-222222222222','demo','Mendtrix Demo National High School','999999','public','NCR','Demo City','Demo');

-- Portal visibility. Defaults are deliberately conservative: a school
-- turning something ON is a decision they made.
insert into public.school_settings (school_id, key, value) values
  ('11111111-1111-1111-1111-111111111111','student_can_view_attendance','false'::jsonb),
  ('11111111-1111-1111-1111-111111111111','student_can_view_general_average','true'::jsonb),
  ('11111111-1111-1111-1111-111111111111','student_can_view_prior_years','true'::jsonb),
  ('11111111-1111-1111-1111-111111111111','student_can_view_documents','false'::jsonb),
  ('11111111-1111-1111-1111-111111111111','attendance_mode','"per_subject"'::jsonb),
  ('22222222-2222-2222-2222-222222222222','student_can_view_attendance','true'::jsonb),
  ('22222222-2222-2222-2222-222222222222','student_can_view_general_average','true'::jsonb),
  ('22222222-2222-2222-2222-222222222222','student_can_view_prior_years','true'::jsonb),
  ('22222222-2222-2222-2222-222222222222','student_can_view_documents','false'::jsonb),
  ('22222222-2222-2222-2222-222222222222','attendance_mode','"daily"'::jsonb);

-- ------------------------------------------------------------
-- Roles — the default template, per tenant, then editable
-- ------------------------------------------------------------
insert into public.roles (id, school_id, code, name, is_system) values
  ('a0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','school_admin','School Administrator',true),
  ('a0000001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','registrar','Registrar',true),
  ('a0000001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','teacher','Subject Teacher',true),
  ('a0000001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','adviser','Class Adviser',true),
  ('a0000001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','student','Student',true),
  ('a0000001-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','principal','School Head',true),
  ('b0000001-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','school_admin','School Administrator',true),
  ('b0000001-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','registrar','Registrar',true),
  ('b0000001-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','teacher','Subject Teacher',true),
  ('b0000001-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222','student','Student',true);

-- Permission grants
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p
where r.code = 'school_admin';

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p
where r.code = 'registrar' and p.code in (
  'school.config.read','users.read','students.read.all','students.write','students.merge',
  'enrollments.read','enrollments.write','classes.read.all','classes.assign',
  'grades.read.all','grades.return','grades.approve','grades.finalize','grades.publish',
  'grades.reopen','grades.correct','attendance.read.all',
  'documents.generate','documents.issue','documents.reprint',
  -- The registrar adds subjects as well as the administrator (0039).
  -- Listed here too because THIS FILE creates the roles, and a
  -- migration that grants to a role cannot run before the role exists
  -- — see the note at the head of 0039.
  'subjects.write',
  'reports.read.school','audit.read','imports.execute');

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p
where r.code = 'teacher' and p.code in (
  'classes.read.own','students.read.own_classes','assessments.write','grades.encode',
  'grades.read.own_classes','grades.submit','attendance.encode','attendance.read.own',
  'documents.generate');

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p
where r.code = 'adviser' and p.code in (
  'classes.read.own','students.read.own_classes','students.read.section',
  'assessments.write','grades.encode','grades.read.own_classes','grades.read.section',
  'grades.submit','attendance.encode','attendance.read.own','documents.generate');

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p
where r.code = 'principal' and p.code in (
  'school.config.read','classes.read.all','grades.read.all','students.read.all',
  'reports.read.school','audit.read','attendance.read.all');

-- Students hold NO permissions. Their access comes entirely from the
-- self-scoped RLS policies, so there is nothing to accidentally widen.

-- ------------------------------------------------------------
-- Users
-- ------------------------------------------------------------
insert into public.users (id, school_id, email, employee_id, first_name, last_name) values
  ('c0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin@anhs.test','EMP-001','Elena','Cruz'),
  ('c0000001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','registrar@anhs.test','EMP-002','Ana','Reyes'),
  ('c0000001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','maria@anhs.test','EMP-003','Maria','Santos'),
  ('c0000001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','juan@anhs.test','EMP-004','Juan','Dela Cruz'),
  ('c0000001-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','joshua@anhs.test',null,'Joshua','Boyore'),
  ('d0000001-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','teacher@demo.test','EMP-101','Pedro','Lim'),
  ('d0000001-0000-0000-0000-000000000009','22222222-2222-2222-2222-222222222222','learner@demo.test',null,'Andrea','Yu');

insert into public.user_roles (user_id, role_id, school_id) values
  ('c0000001-0000-0000-0000-000000000001','a0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('c0000001-0000-0000-0000-000000000002','a0000001-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111'),
  ('c0000001-0000-0000-0000-000000000003','a0000001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111'),
  -- Juan is a subject teacher AND an adviser: two rows, not a third role.
  -- V0 cannot express this at all (role is a mutually-exclusive CHECK).
  ('c0000001-0000-0000-0000-000000000004','a0000001-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111'),
  ('c0000001-0000-0000-0000-000000000004','a0000001-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111'),
  ('c0000001-0000-0000-0000-000000000009','a0000001-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111'),
  ('d0000001-0000-0000-0000-000000000003','b0000001-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222'),
  ('d0000001-0000-0000-0000-000000000009','b0000001-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222');

-- ------------------------------------------------------------
-- Academic years — SAME CODE, DIFFERENT STRUCTURE
-- ------------------------------------------------------------
insert into public.academic_years (id, school_id, label, start_date, end_date, period_structure, status) values
  ('e0000001-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-2027','2026-06-08','2027-04-08','three_term','active'),
  ('f0000001-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','2026-2027','2026-06-08','2027-04-08','quarter','active');

-- School A: THREE terms (DO 009 s.2026 dates, 201 class days)
insert into public.academic_periods (school_id, academic_year_id, ordinal, name, short_name, start_date, end_date, expected_class_days, status) values
  ('11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001',1,'Term 1','T1','2026-06-08','2026-09-15',69,'closed'),
  ('11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001',2,'Term 2','T2','2026-09-16','2026-12-18',65,'active'),
  ('11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001',3,'Term 3','T3','2027-01-04','2027-04-08',67,'upcoming');

-- School B: FOUR quarters. No code differs.
insert into public.academic_periods (school_id, academic_year_id, ordinal, name, short_name, start_date, end_date, expected_class_days, status) values
  ('22222222-2222-2222-2222-222222222222','f0000001-0000-0000-0000-000000000001',1,'First Quarter','Q1','2026-06-08','2026-08-14',50,'closed'),
  ('22222222-2222-2222-2222-222222222222','f0000001-0000-0000-0000-000000000001',2,'Second Quarter','Q2','2026-08-17','2026-10-30',50,'active'),
  ('22222222-2222-2222-2222-222222222222','f0000001-0000-0000-0000-000000000001',3,'Third Quarter','Q3','2026-11-03','2027-01-29',50,'upcoming'),
  ('22222222-2222-2222-2222-222222222222','f0000001-0000-0000-0000-000000000001',4,'Fourth Quarter','Q4','2027-02-01','2027-04-08',51,'upcoming');

-- ------------------------------------------------------------
-- Transmutation — V0's 41-row TRANS constant (main.js:1) as DATA
-- ------------------------------------------------------------
insert into public.transmutation_tables (id, school_id, name, effective_from_year_id, notes) values
  ('a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','DepEd transitional (SY 2026-2027)','e0000001-0000-0000-0000-000000000001','Ported from V0 main.js:1. Transitional: zero-based grading replaces this in SY 2027-2028.'),
  ('b1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','DepEd transitional (SY 2026-2027)','f0000001-0000-0000-0000-000000000001','Same table, second tenant.');

insert into public.transmutation_bands (school_id, transmutation_table_id, min_initial, max_initial, output_grade)
select s.school_id, s.tbl, b.lo, b.hi, b.g
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid,'a1000000-0000-0000-0000-000000000001'::uuid),
  ('22222222-2222-2222-2222-222222222222'::uuid,'b1000000-0000-0000-0000-000000000001'::uuid)
) as s(school_id, tbl)
cross join (values
  (0,3.99,60),(4,7.99,61),(8,11.99,62),(12,15.99,63),(16,19.99,64),
  (20,23.99,65),(24,27.99,66),(28,31.99,67),(32,35.99,68),(36,39.99,69),
  (40,43.99,70),(44,47.99,71),(48,51.99,72),(52,55.99,73),(56,59.99,74),
  (60,61.59,75),(61.6,63.19,76),(63.2,64.79,77),(64.8,66.39,78),(66.4,67.99,79),
  (68,69.59,80),(69.6,71.19,81),(71.2,72.79,82),(72.8,74.39,83),(74.4,75.99,84),
  (76,77.59,85),(77.6,79.19,86),(79.2,80.79,87),(80.8,82.39,88),(82.4,83.99,89),
  (84,85.59,90),(85.6,87.19,91),(87.2,88.79,92),(88.8,90.39,93),(90.4,91.99,94),
  (92,93.59,95),(93.6,95.19,96),(95.2,96.79,97),(96.8,98.39,98),(98.4,99.99,99),
  (100,100,100)
) as b(lo, hi, g);

-- ------------------------------------------------------------
-- Grading schemes — DepEd Order 015 s.2026
-- ------------------------------------------------------------
-- NOT V0's {ww:.30, pt:.50, te:.20}, which DO 015 superseded in June 2026.
insert into public.grading_schemes (id, school_id, name, description, effective_from_year_id, pass_mark, transmutation_table_id) values
  ('a2000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','DO 015 s.2026 — Core (G4-10)','Written Works 20 / Performance Tasks 50 / Examinations 30','e0000001-0000-0000-0000-000000000001',75,'a1000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','DO 015 s.2026 — MAPEH & EPP-TLE (G4-10)','Written Works 20 / Performance Tasks 60 / Examinations 20','e0000001-0000-0000-0000-000000000001',75,'a1000000-0000-0000-0000-000000000001'),
  -- The SY 2027-2028 change, pre-built: same structure, NULL transmutation
  -- table = direct rounding. Switching is a settings change, not a release.
  ('a2000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Zero-based — Core (SY 2027-2028)','Same weights, no transmutation. Ready for the announced change.',null,75,null),
  ('b2000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','DO 015 s.2026 — Core (G4-10)','Written Works 20 / Performance Tasks 50 / Examinations 30','f0000001-0000-0000-0000-000000000001',75,'b1000000-0000-0000-0000-000000000001');

-- Component trees. Examinations is a PARENT with weighted children —
-- the structure V0 cannot represent at all.
insert into public.grade_components (id, school_id, grading_scheme_id, parent_component_id, code, name, weight, ordinal) values
  -- ANHS core: 20 / 50 / 30
  ('a3000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001',null,'WW','Written Works',20,1),
  ('a3000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001',null,'PT','Performance Tasks',50,2),
  ('a3000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001',null,'EX','Examinations',30,3),
  ('a3000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000003','ST1','Summative Test 1',30,1),
  ('a3000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000003','ST2','Summative Test 2',30,2),
  ('a3000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000003','TE','Term Examination',40,3),
  -- ANHS MAPEH / EPP-TLE: 20 / 60 / 20 — same structure, different weights
  ('a3000000-0000-0000-0000-000000000011','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002',null,'WW','Written Works',20,1),
  ('a3000000-0000-0000-0000-000000000012','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002',null,'PT','Performance Tasks',60,2),
  ('a3000000-0000-0000-0000-000000000013','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002',null,'EX','Examinations',20,3),
  ('a3000000-0000-0000-0000-000000000014','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000013','ST1','Summative Test 1',30,1),
  ('a3000000-0000-0000-0000-000000000015','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000013','ST2','Summative Test 2',30,2),
  ('a3000000-0000-0000-0000-000000000016','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000013','TE','Term Examination',40,3),
  -- Zero-based variant
  ('a3000000-0000-0000-0000-000000000021','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000003',null,'WW','Written Works',20,1),
  ('a3000000-0000-0000-0000-000000000022','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000003',null,'PT','Performance Tasks',50,2),
  ('a3000000-0000-0000-0000-000000000023','11111111-1111-1111-1111-111111111111','a2000000-0000-0000-0000-000000000003',null,'EX','Examinations',30,3),
  -- School B core
  ('b3000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','b2000000-0000-0000-0000-000000000001',null,'WW','Written Works',20,1),
  ('b3000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','b2000000-0000-0000-0000-000000000001',null,'PT','Performance Tasks',50,2),
  ('b3000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','b2000000-0000-0000-0000-000000000001',null,'EX','Examinations',30,3);

-- Descriptor bands (V0 main.js:634, as configuration)
insert into public.descriptor_bands (school_id, grading_scheme_id, min_grade, max_grade, label, remark, ordinal)
select s.school_id, s.scheme, b.lo, b.hi, b.label, b.remark, b.ord
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid,'a2000000-0000-0000-0000-000000000001'::uuid),
  ('11111111-1111-1111-1111-111111111111'::uuid,'a2000000-0000-0000-0000-000000000002'::uuid),
  ('22222222-2222-2222-2222-222222222222'::uuid,'b2000000-0000-0000-0000-000000000001'::uuid)
) as s(school_id, scheme)
cross join (values
  (90,100,'Outstanding','Passed',1),
  (85,89.99,'Very Satisfactory','Passed',2),
  (80,84.99,'Satisfactory','Passed',3),
  (75,79.99,'Fairly Satisfactory','Passed',4),
  (0,74.99,'Did Not Meet Expectations','Failed',5)
) as b(lo, hi, label, remark, ord);

-- Attendance statuses — configurable, unlike V0's CHECK ('P','A','L').
-- ANHS adds Excused, which V0 cannot represent without a migration.
insert into public.attendance_statuses (school_id, code, label, symbol, counts_as, ordinal) values
  ('11111111-1111-1111-1111-111111111111','P','Present','P','present',1),
  ('11111111-1111-1111-1111-111111111111','A','Absent','A','absent',2),
  ('11111111-1111-1111-1111-111111111111','L','Late','L','present',3),
  ('11111111-1111-1111-1111-111111111111','E','Excused','E','neutral',4),
  ('22222222-2222-2222-2222-222222222222','P','Present','P','present',1),
  ('22222222-2222-2222-2222-222222222222','A','Absent','A','absent',2),
  ('22222222-2222-2222-2222-222222222222','L','Late','L','present',3);

commit;
begin;
-- ------------------------------------------------------------
-- Grade levels, subjects, sections
-- ------------------------------------------------------------
insert into public.grade_levels (id, school_id, code, name, ordinal, key_stage) values
  ('a4000000-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','G7','Grade 7',7,'KS3'),
  ('a4000000-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','G8','Grade 8',8,'KS3'),
  ('a4000000-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','G9','Grade 9',9,'KS3'),
  ('a4000000-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','G10','Grade 10',10,'KS3'),
  -- Senior High is its own cycle, not KS3 + 2: semestral calendar,
  -- tracks and strands, different subject weights. Seeded empty so a
  -- school that runs it can set it up, and one that does not simply
  -- never uses these two rows. See migration 0036 and assumption A17 —
  -- the grade levels exist; the SHS calendar and weights do not yet.
  ('a4000000-0000-0000-0000-000000000011','11111111-1111-1111-1111-111111111111','G11','Grade 11',11,'SHS'),
  ('a4000000-0000-0000-0000-000000000012','11111111-1111-1111-1111-111111111111','G12','Grade 12',12,'SHS'),
  ('b4000000-0000-0000-0000-000000000010','22222222-2222-2222-2222-222222222222','G10','Grade 10',10,'KS3');

insert into public.subject_categories (id, school_id, code, name, ordinal) values
  ('a5000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','CORE','Core Subject',1),
  ('a5000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','MAPEH','MAPEH / EPP-TLE',2),
  ('b5000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','CORE','Core Subject',1);

insert into public.subjects (id, school_id, code, title, subject_category_id) values
  ('a6000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','MATH10','Mathematics 10','a5000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','SCI10','Science 10','a5000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','ENG10','English 10','a5000000-0000-0000-0000-000000000001'),
  ('a6000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','MAPEH10','MAPEH 10','a5000000-0000-0000-0000-000000000002'),
  ('b6000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','MATH10','Mathematics 10','b5000000-0000-0000-0000-000000000001');

insert into public.grade_level_subjects (school_id, academic_year_id, grade_level_id, subject_id)
select '11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001',
       'a4000000-0000-0000-0000-000000000010', s.id
from public.subjects s where s.school_id='11111111-1111-1111-1111-111111111111';

insert into public.sections (id, school_id, academic_year_id, grade_level_id, name, capacity, adviser_user_id, room) values
  ('a7000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000010','Pearl',40,'c0000001-0000-0000-0000-000000000004','Room 204'),
  ('a7000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000010','Diamond',40,null,'Room 205'),
  ('b7000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','f0000001-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000010','Sampaguita',40,null,'Room 1');

-- School calendar — the correct attendance denominator. Weekdays only.
insert into public.calendar_days (school_id, academic_year_id, day_date, day_type)
select '11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001', d::date,
       case when extract(isodow from d) in (6,7) then 'non_teaching' else 'class_day' end
from generate_series('2026-06-08'::date, '2027-04-08'::date, '1 day') d;

update public.calendar_days set day_type='holiday', description='Christmas break'
where school_id='11111111-1111-1111-1111-111111111111'
  and day_date between '2026-12-21' and '2027-01-01';

-- ------------------------------------------------------------
-- Students — realistic Filipino names, valid-format LRNs
-- ------------------------------------------------------------
insert into public.students (id, school_id, student_number, lrn, first_name, middle_name, last_name, sex, birth_date, barangay, portal_user_id)
values
  ('a8000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','2026-0001','136789010001','Juan','Perez','Abad','male','2010-03-14','San Isidro',null),
  ('a8000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','2026-0002','136789010002','Maria','Lopez','Alvarez','female','2010-07-22','Poblacion',null),
  ('a8000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','2026-0003','136789010003','Pedro','Ramos','Bautista','male','2010-01-09','Kalayaan',null),
  ('a8000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','2026-0004','136789010004','Andrea','Cruz','Delos Santos','female','2010-11-30','San Roque',null),
  ('a8000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','2026-0005','136789010005','Joshua','Reyes','Boyore','male','2010-05-18','Mahabang Parang','c0000001-0000-0000-0000-000000000009'),
  ('a8000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','2026-0006',null,'Liza','Mendoza','Garcia','female','2010-09-02','San Isidro',null),
  ('b8000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','D-0001','229999010001','Andrea','Tan','Yu','female','2010-04-04','Demo Barangay','d0000001-0000-0000-0000-000000000009');

insert into public.guardians (school_id, student_id, full_name, relationship, contact_number, is_primary, is_emergency_contact) values
  ('11111111-1111-1111-1111-111111111111','a8000000-0000-0000-0000-000000000005','Rosario Boyore','Mother','09171234567',true,true),
  ('11111111-1111-1111-1111-111111111111','a8000000-0000-0000-0000-000000000001','Ernesto Abad','Father','09181234567',true,true);

-- Enrollments — one row per learner per YEAR (V0 has no equivalent)
insert into public.enrollments (id, school_id, student_id, academic_year_id, grade_level_id, section_id, date_enrolled)
select
  ('a9000000-0000-0000-0000-00000000000' || row_number() over (order by s.student_number))::uuid,
  s.school_id, s.id, 'e0000001-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000010','a7000000-0000-0000-0000-000000000001','2026-06-08'
from public.students s where s.school_id='11111111-1111-1111-1111-111111111111';

insert into public.enrollments (id, school_id, student_id, academic_year_id, grade_level_id, section_id, date_enrolled) values
  ('b9000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','b8000000-0000-0000-0000-000000000001','f0000001-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000010','b7000000-0000-0000-0000-000000000001','2026-06-08');

-- ------------------------------------------------------------
-- Classes — subject x section x year. Teacher is an ATTRIBUTE.
-- ------------------------------------------------------------
insert into public.classes (id, school_id, academic_year_id, section_id, subject_id, primary_teacher_id, grading_scheme_id, schedule_note, room) values
  ('aa000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','MWF 8:00-9:00','Room 204'),
  ('aa000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000004','c0000001-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000002','TTh 10:00-11:00','Gym'),
  ('ba000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','f0000001-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001','d0000001-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','MWF 9:00-10:00','Room 1');

-- Rosters auto-populate from section enrollment. No teacher types a name.
insert into public.class_enrollments (school_id, class_id, enrollment_id)
select c.school_id, c.id, e.id
from public.classes c
join public.enrollments e
  on e.section_id = c.section_id and e.status in ('enrolled','transferred_in');

-- ------------------------------------------------------------
-- Assessments — ROWS. Includes DO 015's ST1/ST2, impossible in V0.
-- ------------------------------------------------------------
insert into public.assessments (school_id, class_id, academic_period_id, grade_component_id, ordinal, title, highest_possible_score)
select '11111111-1111-1111-1111-111111111111','aa000000-0000-0000-0000-000000000001', p.id, a.comp, a.ord, a.title, a.hps
from public.academic_periods p
cross join (values
  ('a3000000-0000-0000-0000-000000000001'::uuid,1,'Quiz 1',20::numeric),
  ('a3000000-0000-0000-0000-000000000001'::uuid,2,'Quiz 2',20),
  ('a3000000-0000-0000-0000-000000000001'::uuid,3,'Seatwork 1',15),
  ('a3000000-0000-0000-0000-000000000001'::uuid,4,'Quiz 3',25),
  ('a3000000-0000-0000-0000-000000000002'::uuid,1,'Problem Set',40),
  ('a3000000-0000-0000-0000-000000000002'::uuid,2,'Group Task',30),
  ('a3000000-0000-0000-0000-000000000002'::uuid,3,'Project',50),
  ('a3000000-0000-0000-0000-000000000004'::uuid,1,'Summative Test 1',40),
  ('a3000000-0000-0000-0000-000000000005'::uuid,1,'Summative Test 2',40),
  ('a3000000-0000-0000-0000-000000000006'::uuid,1,'Term Examination',60)
) as a(comp, ord, title, hps)
where p.academic_year_id='e0000001-0000-0000-0000-000000000001' and p.ordinal in (1,2);

-- Scores for Term 1 (complete) and Term 2 (partial, so the gradebook
-- has real gaps and the validation gate has something to warn about).
insert into public.assessment_scores (school_id, assessment_id, class_enrollment_id, raw_score, encoded_by)
select a.school_id, a.id, ce.id,
       round((a.highest_possible_score * (0.62 + (abs(hashtext(ce.id::text || a.id::text)) % 34) / 100.0))::numeric, 0),
       'c0000001-0000-0000-0000-000000000003'
from public.assessments a
join public.academic_periods p on p.id = a.academic_period_id
join public.class_enrollments ce on ce.class_id = a.class_id
where a.class_id='aa000000-0000-0000-0000-000000000001'
  and (p.ordinal = 1 or (p.ordinal = 2 and abs(hashtext(ce.id::text || a.id::text)) % 5 <> 0));

commit;
begin;
-- MAPEH children (Music / Arts / PE / Health), which the real form prints
-- indented beneath the MAPEH aggregate row.
insert into public.subjects (id, school_id, code, title, subject_category_id, parent_subject_id) values
  ('a6000000-0000-0000-0000-000000000101','11111111-1111-1111-1111-111111111111','MUS10','Music 10','a5000000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000004'),
  ('a6000000-0000-0000-0000-000000000102','11111111-1111-1111-1111-111111111111','ART10','Arts 10','a5000000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000004'),
  ('a6000000-0000-0000-0000-000000000103','11111111-1111-1111-1111-111111111111','PE10','Physical Education 10','a5000000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000004'),
  ('a6000000-0000-0000-0000-000000000104','11111111-1111-1111-1111-111111111111','HLTH10','Health 10','a5000000-0000-0000-0000-000000000002','a6000000-0000-0000-0000-000000000004');

-- Eligibility block for Joshua
insert into public.student_eligibility
  (school_id, student_id, eligibility_type, general_average, prev_school_name,
   prev_school_govt_id, prev_school_address)
values
  ('11111111-1111-1111-1111-111111111111','a8000000-0000-0000-0000-000000000005',
   'elem_completer', 89.40, 'Angono Elementary School', '104721', 'Angono, Rizal');

-- A prior year the learner spent at ANOTHER school, so the SF10 block must
-- print that school's details rather than this tenant's.
insert into public.academic_years (id, school_id, label, start_date, end_date, period_structure, status)
values ('e0000001-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
        -- created 'closed', archived at the end of this script: the
        -- archived-year trigger correctly refuses writes, so the
        -- enrollment must land first. That guard is the point.
        '2025-2026','2025-08-25','2026-05-30','quarter','closed');

insert into public.academic_periods (school_id, academic_year_id, ordinal, name, short_name, start_date, end_date)
select '11111111-1111-1111-1111-111111111111','e0000001-0000-0000-0000-000000000000',
       n, 'Quarter '||n, 'Q'||n, ('2025-08-25'::date + (n-1)*70), ('2025-08-25'::date + n*70 - 1)
from generate_series(1,4) n;

insert into public.grade_levels (id, school_id, code, name, ordinal, key_stage)
values ('a4000000-0000-0000-0000-000000000109','11111111-1111-1111-1111-111111111111','G9P','Grade 9',9,'KS3')
on conflict do nothing;

insert into public.enrollments
  (id, school_id, student_id, academic_year_id, grade_level_id, section_id, date_enrolled,
   status, promotion_status, general_average,
   recording_school_name, recording_school_govt_id, recording_district,
   recording_division, recording_region, adviser_name)
values
  ('a9000000-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111',
   'a8000000-0000-0000-0000-000000000005','e0000001-0000-0000-0000-000000000000',
   'a4000000-0000-0000-0000-000000000009', null,'2025-08-25','completed','promoted',86.00,
   'Taytay National High School','301422','Taytay','Rizal','IV-A CALABARZON','Mr. R. Villanueva');

-- Remedial block on the current year
insert into public.remedial_classes (id, school_id, enrollment_id, conducted_from, conducted_to)
select 'ac000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', e.id,
       '2027-04-12','2027-05-10'
from public.enrollments e
where e.student_id='a8000000-0000-0000-0000-000000000005'
  and e.academic_year_id='e0000001-0000-0000-0000-000000000001';

insert into public.remedial_marks
  (school_id, remedial_class_id, subject_id, final_rating, remedial_class_mark, recomputed_final_grade, remarks)
values ('11111111-1111-1111-1111-111111111111','ac000000-0000-0000-0000-000000000001',
        'a6000000-0000-0000-0000-000000000002', 72, 80, 75, 'PASSED');

-- Final subject grades so the SF10 FINAL RATING column has values
insert into public.final_subject_grades (school_id, class_enrollment_id, final_grade, remark)
select ce.school_id, ce.id,
       round(80 + (abs(hashtext(ce.id::text)) % 15))::numeric,
       case when (abs(hashtext(ce.id::text)) % 15) + 80 >= 75 then 'PASSED' else 'FAILED' end
from public.class_enrollments ce;

-- Now archive the prior year, exercising the read-only guard.
update public.academic_years set status='archived'
where id='e0000001-0000-0000-0000-000000000000';

insert into public.school_settings (school_id, key, value)
values ('11111111-1111-1111-1111-111111111111','principal_name','"Dr. Corazon M. Alvarez"'::jsonb)
on conflict (school_id, key) do update set value = excluded.value;

commit;

-- ------------------------------------------------------------
-- Category -> grading scheme (added with migration 0014)
-- ------------------------------------------------------------
-- With these set, a class needs no scheme of its own: core subjects
-- inherit DO 015's 20/50/30 and MAPEH/EPP-TLE inherit 20/60/20.
update public.subject_categories set grading_scheme_id = 'a2000000-0000-0000-0000-000000000001'
 where school_id = '11111111-1111-1111-1111-111111111111' and code = 'CORE';
update public.subject_categories set grading_scheme_id = 'a2000000-0000-0000-0000-000000000002'
 where school_id = '11111111-1111-1111-1111-111111111111' and code = 'MAPEH';
update public.subject_categories set grading_scheme_id = 'b2000000-0000-0000-0000-000000000001'
 where school_id = '22222222-2222-2222-2222-222222222222' and code = 'CORE';

-- Clear the per-class overrides so the category fallback is the path
-- actually exercised — an untested fallback is not a fallback.
update public.classes set grading_scheme_id = null;
