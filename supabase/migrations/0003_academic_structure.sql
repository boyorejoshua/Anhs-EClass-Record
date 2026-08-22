-- ============================================================
-- 0003 · Academic structure
-- ============================================================
-- The single most important structural fix over V0.
-- V0: `term int check (term in (1,2,3))` in SQL and `for(t=1;t<=3;t++)`
-- in six places in main.js. A school on quarters was a rewrite.
-- Here: periods are ROWS. Quarter, semester, trimester and custom are data.

create table public.academic_years (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  label            text not null,                       -- '2026-2027'
  start_date       date not null,
  end_date         date not null,
  period_structure text not null
                   check (period_structure in ('quarter','semester','trimester','custom')),
  status           text not null default 'planning'
                   check (status in ('planning','active','closed','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (school_id, label),
  unique (school_id, id),
  check (end_date > start_date)
);

create trigger academic_years_updated_at before update on public.academic_years
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.academic_years');

-- Three terms = three rows. Four quarters = four rows. No CHECK on a count.
create table public.academic_periods (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  academic_year_id    uuid not null,
  ordinal             int  not null check (ordinal > 0),
  name                text not null,                    -- 'Term 1' / 'First Quarter'
  short_name          text not null,                    -- 'T1' / 'Q1'
  start_date          date not null,
  end_date            date not null,
  expected_class_days int  check (expected_class_days >= 0),
  status              text not null default 'upcoming'
                      check (status in ('upcoming','active','closed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (academic_year_id, ordinal),
  unique (school_id, id),
  check (end_date >= start_date),
  foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete cascade
);

create index academic_periods_year_idx
  on public.academic_periods (school_id, academic_year_id, ordinal);

create trigger academic_periods_updated_at before update on public.academic_periods
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.academic_periods');

-- Grade levels are rows, not the fixed Grade 7-12 <select> of index.html:123.
create table public.grade_levels (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  code       text not null,                              -- 'G7'
  name       text not null,                              -- 'Grade 7'
  ordinal    int  not null,
  key_stage  text,                                       -- 'KS3' / 'KS4'
  is_active  boolean not null default true,
  unique (school_id, code),
  unique (school_id, id)
);

select app.attach_tenant_triggers('public.grade_levels');

-- Sections are PER ACADEMIC YEAR. 'Grade 9 Pearl' in 2026-27 and in
-- 2027-28 are different rows with different rosters. This is what keeps
-- history intact when a section is renamed or dissolved.
create table public.sections (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  grade_level_id   uuid not null,
  name             text not null,                        -- 'Pearl'
  capacity         int check (capacity > 0),
  adviser_user_id  uuid references public.users(id) on delete set null,
  room             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academic_year_id, grade_level_id, name),
  unique (school_id, id),
  foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, grade_level_id)
    references public.grade_levels (school_id, id) on delete restrict
);

create index sections_year_idx on public.sections (school_id, academic_year_id, grade_level_id);
create index sections_adviser_idx on public.sections (adviser_user_id)
  where adviser_user_id is not null;

create trigger sections_updated_at before update on public.sections
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.sections');

-- Subject categories are the join point between curriculum and the
-- grading engine: DO 015 gives core subjects 20/50/30 and MAPEH /
-- EPP-TLE 20/60/20, so the category carries the scheme.
create table public.subject_categories (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  ordinal    int not null default 0,
  unique (school_id, code),
  unique (school_id, id)
);

select app.attach_tenant_triggers('public.subject_categories');

-- A real catalogue, replacing V0's free-text `subject` column on classes.
create table public.subjects (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  code                text not null,
  title               text not null,
  subject_category_id uuid not null,
  units               numeric(4,2),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (school_id, code),
  unique (school_id, id),
  foreign key (school_id, subject_category_id)
    references public.subject_categories (school_id, id) on delete restrict
);

select app.attach_tenant_triggers('public.subjects');

-- The curriculum map. Drives automatic class generation, which is what
-- makes rosters auto-populate and teachers never type a student list.
create table public.grade_level_subjects (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  grade_level_id   uuid not null,
  subject_id       uuid not null,
  unique (academic_year_id, grade_level_id, subject_id),
  foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, grade_level_id)
    references public.grade_levels (school_id, id) on delete cascade,
  foreign key (school_id, subject_id)
    references public.subjects (school_id, id) on delete cascade
);

select app.attach_tenant_triggers('public.grade_level_subjects');

-- The school calendar is the correct attendance denominator.
-- V0's SF4 divides by days *recorded* (monDates.length), so its figures
-- are wrong whenever a teacher misses a day. This table is the fix.
create table public.calendar_days (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null,
  day_date         date not null,
  day_type         text not null default 'class_day'
                   check (day_type in ('class_day','holiday','suspension','non_teaching')),
  description      text,
  unique (academic_year_id, day_date),
  unique (school_id, id),
  foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete cascade
);

create index calendar_days_lookup_idx
  on public.calendar_days (school_id, academic_year_id, day_date);
create index calendar_days_class_days_idx
  on public.calendar_days (school_id, academic_year_id, day_date)
  where day_type = 'class_day';

select app.attach_tenant_triggers('public.calendar_days');
