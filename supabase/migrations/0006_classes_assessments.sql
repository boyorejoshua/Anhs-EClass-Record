-- ============================================================
-- 0006 · Classes, rosters, assessments and scores
-- ============================================================
-- V0 defines a class as (teacher_id, grade_level, section, school_year,
-- subject) — the TEACHER is part of the identity, so reassigning a
-- teacher creates a different class and orphans its grades.
-- Here a class is subject x section x year; the teacher is an attribute.

create table public.classes (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  academic_year_id   uuid not null,
  section_id         uuid not null,
  subject_id         uuid not null,
  primary_teacher_id uuid references public.users(id) on delete set null,
  grading_scheme_id  uuid,                     -- override; else from subject category
  schedule_note      text,                     -- 'MWF 8:00-9:00'
  room               text,
  status             text not null default 'active'
                     check (status in ('active','inactive')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (academic_year_id, section_id, subject_id),
  unique (school_id, id),
  foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete cascade,
  foreign key (school_id, section_id)
    references public.sections (school_id, id) on delete cascade,
  foreign key (school_id, subject_id)
    references public.subjects (school_id, id) on delete restrict,
  foreign key (school_id, grading_scheme_id)
    references public.grading_schemes (school_id, id) on delete restrict
);

create index classes_teacher_idx
  on public.classes (school_id, primary_teacher_id, academic_year_id);
create index classes_section_idx
  on public.classes (school_id, section_id);

create trigger classes_updated_at before update on public.classes
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.classes');
create trigger classes_archived_year before insert or update or delete
  on public.classes
  for each row execute function app.reject_write_to_archived_year();

-- Co-teaching. Phase 2 feature; primary_teacher_id covers V1.
create table public.class_teachers (
  class_id  uuid not null references public.classes(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role      text not null default 'co_teacher'
            check (role in ('primary','co_teacher','substitute')),
  primary key (class_id, user_id)
);

create index class_teachers_user_idx on public.class_teachers (school_id, user_id);

-- ------------------------------------------------------------
-- class_enrollments — the roster
-- ------------------------------------------------------------
-- Auto-populated from the curriculum map x section enrollment.
-- This is the single highest-leverage requirement in the product:
-- teachers never type a student list, and it is the most visible
-- "this is better than Excel" moment in a demo.
create table public.class_enrollments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  class_id      uuid not null,
  enrollment_id uuid not null,
  date_added    date not null default current_date,
  date_dropped  date,
  status        text not null default 'active'
                check (status in ('active','dropped','transferred')),
  created_at    timestamptz not null default now(),
  unique (class_id, enrollment_id),
  unique (school_id, id),
  foreign key (school_id, class_id)
    references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, enrollment_id)
    references public.enrollments (school_id, id) on delete cascade
);

create index class_enrollments_class_idx
  on public.class_enrollments (school_id, class_id) where status = 'active';
create index class_enrollments_enrollment_idx
  on public.class_enrollments (school_id, enrollment_id);

select app.attach_tenant_triggers('public.class_enrollments');

-- ------------------------------------------------------------
-- assessments — ROWS, not columns
-- ------------------------------------------------------------
-- V0 caps assessments at 10 per component with 20 flat SQL columns
-- (ww1..ww10, pt1..pt10) plus a single `te`. That cap is why DO 015's
-- ST1/ST2 cannot be represented. Here there is no cap, each assessment
-- carries its own highest possible score, and a teacher can title it.
create table public.assessments (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  class_id               uuid not null,
  academic_period_id     uuid not null,
  grade_component_id     uuid not null,
  ordinal                int  not null check (ordinal > 0),
  title                  text,
  highest_possible_score numeric(8,2) not null check (highest_possible_score > 0),
  assessment_date        date,
  status                 text not null default 'active'
                         check (status in ('active','archived')),
  created_by             uuid references public.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (class_id, academic_period_id, grade_component_id, ordinal),
  unique (school_id, id),
  foreign key (school_id, class_id)
    references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, academic_period_id)
    references public.academic_periods (school_id, id) on delete cascade,
  foreign key (school_id, grade_component_id)
    references public.grade_components (school_id, id) on delete restrict
);

create index assessments_class_period_idx
  on public.assessments (school_id, class_id, academic_period_id, grade_component_id, ordinal);

create trigger assessments_updated_at before update on public.assessments
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.assessments');

-- ------------------------------------------------------------
-- assessment_scores
-- ------------------------------------------------------------
-- is_excused distinguishes "did not take it, legitimately" from "no
-- score recorded yet". V0 cannot make that distinction, which is the
-- root of its habit of counting a missing component as zero
-- (main.js:301) and reading a term artificially low before the exam.
create table public.assessment_scores (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  assessment_id       uuid not null,
  class_enrollment_id uuid not null,
  raw_score           numeric(8,2) check (raw_score >= 0),
  is_excused          boolean not null default false,
  encoded_by          uuid references public.users(id),
  encoded_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (assessment_id, class_enrollment_id),
  unique (school_id, id),
  foreign key (school_id, assessment_id)
    references public.assessments (school_id, id) on delete cascade,
  foreign key (school_id, class_enrollment_id)
    references public.class_enrollments (school_id, id) on delete cascade,
  check (not (is_excused and raw_score is not null))
);

create index assessment_scores_assessment_idx
  on public.assessment_scores (school_id, assessment_id);
create index assessment_scores_enrollment_idx
  on public.assessment_scores (school_id, class_enrollment_id);

create trigger assessment_scores_updated_at before update on public.assessment_scores
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.assessment_scores');

-- A score may never exceed its assessment's highest possible score.
-- Enforced server-side: the gradebook flags it at entry, but a modified
-- client must not be able to persist it.
create or replace function app.check_score_within_hps()
returns trigger
language plpgsql
as $$
declare
  hps numeric;
begin
  if new.raw_score is null then
    return new;
  end if;

  select highest_possible_score into hps
  from public.assessments where id = new.assessment_id;

  if new.raw_score > hps then
    raise exception 'score % exceeds the maximum of % for this assessment',
      new.raw_score, hps
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger assessment_scores_within_hps
  before insert or update on public.assessment_scores
  for each row execute function app.check_score_within_hps();
