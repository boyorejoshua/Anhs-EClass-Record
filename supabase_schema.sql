-- ================================================================
-- ANHS E-CLASS RECORD SYSTEM — SUPABASE PHASE 2 BACKEND
-- Database Schema & Setup Guide
-- DO 009, s. 2026 · Three-Term System
-- ================================================================
-- Run this entire file in your Supabase SQL Editor
-- Project URL: https://supabase.com → New Project → SQL Editor
-- ================================================================


-- ════════════════════════════════════════════════════════════════
-- SECTION 1: TEACHER PROFILES
-- Extends Supabase Auth (auth.users) with teacher-specific data
-- ════════════════════════════════════════════════════════════════

create table if not exists public.teacher_profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  emp_id        text        unique not null,
  first_name    text        not null,
  last_name     text        not null,
  role          text        not null check (role in ('subject','advisory','registrar','admin')),
  school_name   text        default 'Angono National High School',
  school_id     text        default '301417',
  region        text        default 'IV-A CALABARZON',
  division      text        default 'Rizal',
  is_demo       boolean     default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Row Level Security: teachers can only read/update their own profile
alter table public.teacher_profiles enable row level security;

create policy "Teachers can view own profile"
  on public.teacher_profiles for select
  using (auth.uid() = id);

create policy "Teachers can update own profile"
  on public.teacher_profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.teacher_profiles for select
  using (
    exists (
      select 1 from public.teacher_profiles
      where id = auth.uid() and role in ('admin','registrar')
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 2: CLASSES
-- Each teacher manages one or more classes per school year
-- ════════════════════════════════════════════════════════════════

create table if not exists public.classes (
  id            uuid        primary key default gen_random_uuid(),
  teacher_id    uuid        not null references public.teacher_profiles(id) on delete cascade,
  grade_level   text        not null,    -- 'Grade 7', 'Grade 10', etc.
  section       text        not null,    -- 'PEARL', 'DIAMOND', etc.
  school_year   text        not null,    -- '2026-2027'
  subject       text        not null default '',
  school_name   text        default 'Angono National High School',
  school_id     text        default '301417',
  region        text        default 'IV-A CALABARZON',
  division      text        default 'Rizal',
  is_submitted  boolean     default false,  -- submitted to registrar
  submitted_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(teacher_id, grade_level, section, school_year, subject)
);

alter table public.classes enable row level security;

create policy "Teachers own their classes"
  on public.classes for all
  using (teacher_id = auth.uid());

create policy "Registrar can view all classes"
  on public.classes for select
  using (
    exists (
      select 1 from public.teacher_profiles
      where id = auth.uid() and role in ('registrar','admin')
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 3: STUDENTS
-- Each student belongs to a class
-- ════════════════════════════════════════════════════════════════

create table if not exists public.students (
  id            uuid        primary key default gen_random_uuid(),
  class_id      uuid        not null references public.classes(id) on delete cascade,
  full_name     text        not null,
  gender        text        not null check (gender in ('male','female')),
  lrn           text        default '',   -- Learner Reference Number
  date_of_birth date,
  barangay      text        default '',
  sort_order    int         default 0,
  created_at    timestamptz default now()
);

alter table public.students enable row level security;

create policy "Teacher accesses own class students"
  on public.students for all
  using (
    exists (
      select 1 from public.classes
      where id = class_id and teacher_id = auth.uid()
    )
  );

create policy "Registrar views all students"
  on public.students for select
  using (
    exists (
      select 1 from public.teacher_profiles
      where id = auth.uid() and role in ('registrar','admin')
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 4: HPS (Highest Possible Score) per term per class
-- Three-Term System: term 1, 2, 3
-- Components: ww (Written Works), pt (Performance Tasks), te (Term Exam)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.hps_settings (
  id            uuid        primary key default gen_random_uuid(),
  class_id      uuid        not null references public.classes(id) on delete cascade,
  term          int         not null check (term in (1,2,3)),
  -- Written Works: up to 10 items (null = not used)
  ww1 numeric, ww2 numeric, ww3 numeric, ww4 numeric, ww5 numeric,
  ww6 numeric, ww7 numeric, ww8 numeric, ww9 numeric, ww10 numeric,
  -- Performance Tasks: up to 10 items
  pt1 numeric, pt2 numeric, pt3 numeric, pt4 numeric, pt5 numeric,
  pt6 numeric, pt7 numeric, pt8 numeric, pt9 numeric, pt10 numeric,
  -- Term Examination: single total score
  te  numeric,
  updated_at    timestamptz default now(),
  unique(class_id, term)
);

alter table public.hps_settings enable row level security;

create policy "Teacher manages own HPS"
  on public.hps_settings for all
  using (
    exists (
      select 1 from public.classes
      where id = class_id and teacher_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 5: GRADES per student per term
-- ════════════════════════════════════════════════════════════════

create table if not exists public.grades (
  id            uuid        primary key default gen_random_uuid(),
  student_id    uuid        not null references public.students(id) on delete cascade,
  class_id      uuid        not null references public.classes(id) on delete cascade,
  term          int         not null check (term in (1,2,3)),
  -- Written Works scores
  ww1 numeric, ww2 numeric, ww3 numeric, ww4 numeric, ww5 numeric,
  ww6 numeric, ww7 numeric, ww8 numeric, ww9 numeric, ww10 numeric,
  -- Performance Task scores
  pt1 numeric, pt2 numeric, pt3 numeric, pt4 numeric, pt5 numeric,
  pt6 numeric, pt7 numeric, pt8 numeric, pt9 numeric, pt10 numeric,
  -- Term Examination score
  te  numeric,
  -- Computed values (stored for performance, recalculated on save)
  ww_total      numeric,
  ww_ps         numeric,   -- Percentage Score 0-100
  ww_ws         numeric,   -- Weighted Score (PS * 0.30)
  pt_total      numeric,
  pt_ps         numeric,
  pt_ws         numeric,   -- Weighted Score (PS * 0.50)
  te_ps         numeric,
  te_ws         numeric,   -- Weighted Score (PS * 0.20)
  initial_grade numeric,
  term_grade    int,        -- Transmuted grade
  updated_at    timestamptz default now(),
  unique(student_id, class_id, term)
);

alter table public.grades enable row level security;

create policy "Teacher manages own class grades"
  on public.grades for all
  using (
    exists (
      select 1 from public.classes
      where id = class_id and teacher_id = auth.uid()
    )
  );

create policy "Registrar views all grades"
  on public.grades for select
  using (
    exists (
      select 1 from public.teacher_profiles
      where id = auth.uid() and role in ('registrar','admin')
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 6: ATTENDANCE
-- Daily attendance per student
-- ════════════════════════════════════════════════════════════════

create table if not exists public.attendance (
  id            uuid        primary key default gen_random_uuid(),
  student_id    uuid        not null references public.students(id) on delete cascade,
  class_id      uuid        not null references public.classes(id) on delete cascade,
  att_date      date        not null,
  status        text        not null check (status in ('P','A','L')), -- Present/Absent/Late
  created_at    timestamptz default now(),
  unique(student_id, class_id, att_date)
);

alter table public.attendance enable row level security;

create policy "Teacher manages own attendance"
  on public.attendance for all
  using (
    exists (
      select 1 from public.classes
      where id = class_id and teacher_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 7: DIAGNOSTIC TEST DATA
-- Per class (not per term — one diagnostic per class)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.diagnostic_tests (
  id            uuid        primary key default gen_random_uuid(),
  class_id      uuid        unique references public.classes(id) on delete cascade,
  num_items     int         default 0,
  hso           numeric     default 0,  -- Highest Score Obtained
  lso           numeric     default 0,  -- Lowest Score Obtained
  updated_at    timestamptz default now()
);

alter table public.diagnostic_tests enable row level security;

create policy "Teacher manages own diagnostic"
  on public.diagnostic_tests for all
  using (
    exists (
      select 1 from public.classes
      where id = class_id and teacher_id = auth.uid()
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 8: REGISTRAR SUBMISSIONS
-- When a teacher submits grades to the Registrar
-- ════════════════════════════════════════════════════════════════

create table if not exists public.registrar_submissions (
  id              uuid        primary key default gen_random_uuid(),
  class_id        uuid        not null references public.classes(id),
  teacher_id      uuid        not null references public.teacher_profiles(id),
  submitted_at    timestamptz default now(),
  status          text        default 'pending' check (status in ('pending','reviewed','approved','returned')),
  registrar_notes text        default '',
  grade_snapshot  jsonb,      -- Full grade data at time of submission
  reviewed_by     uuid        references public.teacher_profiles(id),
  reviewed_at     timestamptz
);

alter table public.registrar_submissions enable row level security;

create policy "Teachers submit own classes"
  on public.registrar_submissions for insert
  using (teacher_id = auth.uid());

create policy "Teachers view own submissions"
  on public.registrar_submissions for select
  using (teacher_id = auth.uid());

create policy "Registrar manages all submissions"
  on public.registrar_submissions for all
  using (
    exists (
      select 1 from public.teacher_profiles
      where id = auth.uid() and role in ('registrar','admin')
    )
  );


-- ════════════════════════════════════════════════════════════════
-- SECTION 9: HELPER VIEWS
-- Pre-built views for common queries
-- ════════════════════════════════════════════════════════════════

-- View: Final Grades per Student (average of 3 terms)
create or replace view public.v_final_grades as
select
  s.id            as student_id,
  s.full_name,
  s.gender,
  s.lrn,
  c.id            as class_id,
  c.grade_level,
  c.section,
  c.subject,
  c.school_year,
  c.teacher_id,
  max(case when g.term = 1 then g.term_grade end) as t1,
  max(case when g.term = 2 then g.term_grade end) as t2,
  max(case when g.term = 3 then g.term_grade end) as t3,
  round(
    (
      coalesce(max(case when g.term = 1 then g.term_grade end), 0) +
      coalesce(max(case when g.term = 2 then g.term_grade end), 0) +
      coalesce(max(case when g.term = 3 then g.term_grade end), 0)
    ) / nullif(
      (case when max(case when g.term = 1 then g.term_grade end) is not null then 1 else 0 end +
       case when max(case when g.term = 2 then g.term_grade end) is not null then 1 else 0 end +
       case when max(case when g.term = 3 then g.term_grade end) is not null then 1 else 0 end), 0
    )
  ) as final_grade
from public.students s
join public.classes c on c.id = s.class_id
left join public.grades g on g.student_id = s.id and g.class_id = c.id
group by s.id, s.full_name, s.gender, s.lrn, c.id, c.grade_level, c.section, c.subject, c.school_year, c.teacher_id;

-- View: Monthly Attendance Summary
create or replace view public.v_attendance_monthly as
select
  s.id            as student_id,
  s.full_name,
  c.id            as class_id,
  c.grade_level,
  c.section,
  to_char(a.att_date, 'YYYY-MM') as month,
  count(*) filter (where a.status = 'P') as present_count,
  count(*) filter (where a.status = 'A') as absent_count,
  count(*) filter (where a.status = 'L') as late_count,
  count(*) as total_days
from public.students s
join public.classes c on c.id = s.class_id
left join public.attendance a on a.student_id = s.id and a.class_id = c.id
group by s.id, s.full_name, c.id, c.grade_level, c.section, to_char(a.att_date, 'YYYY-MM');


-- ════════════════════════════════════════════════════════════════
-- SECTION 10: DEMO DATA (optional — run to pre-seed test data)
-- ════════════════════════════════════════════════════════════════

-- NOTE: Demo users must first be created via Supabase Auth signup
-- Then run this to add their profiles:
-- insert into public.teacher_profiles (id, emp_id, first_name, last_name, role, is_demo)
-- values
--   ('<auth.user.id for DEMO-SUBJECT>', 'DEMO-SUBJECT', 'Maria', 'Santos', 'subject', true),
--   ('<auth.user.id for DEMO-ADVISORY>', 'DEMO-ADVISORY', 'Juan', 'Dela Cruz', 'advisory', true),
--   ('<auth.user.id for DEMO-REGISTRAR>', 'DEMO-REGISTRAR', 'Ana', 'Reyes', 'registrar', true);


-- ════════════════════════════════════════════════════════════════
-- SECTION 11: TRIGGERS
-- Auto-update updated_at timestamps
-- ════════════════════════════════════════════════════════════════

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_classes_update
  before update on public.classes
  for each row execute procedure public.handle_updated_at();

create trigger on_grades_update
  before update on public.grades
  for each row execute procedure public.handle_updated_at();

create trigger on_hps_update
  before update on public.hps_settings
  for each row execute procedure public.handle_updated_at();

create trigger on_profiles_update
  before update on public.teacher_profiles
  for each row execute procedure public.handle_updated_at();


-- ════════════════════════════════════════════════════════════════
-- DONE. Schema ready.
-- Next: Configure your Supabase URL and anon key in supabase.js
-- ════════════════════════════════════════════════════════════════
