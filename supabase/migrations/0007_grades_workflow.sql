-- ============================================================
-- 0007 · Computed grades and the submission workflow
-- ============================================================

-- ------------------------------------------------------------
-- period_grades
-- ------------------------------------------------------------
-- scheme_snapshot is what makes historical fidelity real. Without it,
-- changing a weight in 2028 silently rewrites what a 2026 grade "would
-- have been". With it, the 2026 grade stays reproducible and explainable
-- after DepEd's SY 2027-2028 zero-based grading change.
create table public.period_grades (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  class_enrollment_id uuid not null,
  academic_period_id  uuid not null,
  component_breakdown jsonb,           -- per component: total, PS, WS
  initial_grade       numeric(6,2),    -- pre-transmutation
  period_grade        numeric(6,2),    -- post-transmutation, or direct-rounded
  status_code         text check (status_code in ('INC','DRP','EXM','TRF')),
  scheme_snapshot     jsonb not null,  -- the scheme as it stood at computation
  version             int  not null default 1,
  is_current          boolean not null default true,
  computed_at         timestamptz not null default now(),
  computed_by         uuid references public.users(id),
  unique (class_enrollment_id, academic_period_id, version),
  unique (school_id, id),
  foreign key (school_id, class_enrollment_id)
    references public.class_enrollments (school_id, id) on delete cascade,
  foreign key (school_id, academic_period_id)
    references public.academic_periods (school_id, id) on delete cascade
);

-- Exactly one current version per learner per class per period.
-- Corrections increment `version`; the prior row is retained intact.
create unique index period_grades_one_current
  on public.period_grades (class_enrollment_id, academic_period_id)
  where is_current;

create index period_grades_lookup_idx
  on public.period_grades (school_id, class_enrollment_id, academic_period_id)
  where is_current;

select app.attach_tenant_triggers('public.period_grades');

create table public.final_subject_grades (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  class_enrollment_id uuid not null,
  final_grade         numeric(6,2),
  remark              text,
  status_code         text check (status_code in ('INC','DRP','EXM','TRF')),
  version             int  not null default 1,
  is_current          boolean not null default true,
  computed_at         timestamptz not null default now(),
  unique (class_enrollment_id, version),
  unique (school_id, id),
  foreign key (school_id, class_enrollment_id)
    references public.class_enrollments (school_id, id) on delete cascade
);

create unique index final_subject_grades_one_current
  on public.final_subject_grades (class_enrollment_id) where is_current;

select app.attach_tenant_triggers('public.final_subject_grades');

-- ------------------------------------------------------------
-- grade_submissions — at CLASS x PERIOD grain
-- ------------------------------------------------------------
-- V0 tracks `classes.is_submitted` as a single boolean per class, which
-- cannot express "Term 2 submitted, Term 3 in progress". It also stores
-- a grade_snapshot jsonb because it has no reliable versioning; with
-- period_grades.version that snapshot is unnecessary.
create table public.grade_submissions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  class_id           uuid not null,
  academic_period_id uuid not null,
  status             text not null default 'draft'
                     check (status in ('draft','submitted','returned','approved',
                                       'finalized','published','reopened')),
  submitted_by       uuid references public.users(id),
  submitted_at       timestamptz,
  returned_by        uuid references public.users(id),
  returned_at        timestamptz,
  return_reason      text,
  approved_by        uuid references public.users(id),
  approved_at        timestamptz,
  finalized_by       uuid references public.users(id),
  finalized_at       timestamptz,
  published_by       uuid references public.users(id),
  published_at       timestamptz,
  reopened_by        uuid references public.users(id),
  reopened_at        timestamptz,
  reopen_reason      text,
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (class_id, academic_period_id),
  unique (school_id, id),
  foreign key (school_id, class_id)
    references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, academic_period_id)
    references public.academic_periods (school_id, id) on delete cascade,
  -- a returned submission must say why; a reopened one must too
  check (status <> 'returned' or return_reason is not null),
  check (status <> 'reopened' or reopen_reason is not null)
);

create index grade_submissions_queue_idx
  on public.grade_submissions (school_id, academic_period_id, status);

-- The registrar's most frequent question: what is still missing?
create index grade_submissions_outstanding_idx
  on public.grade_submissions (school_id, academic_period_id)
  where status in ('draft','returned','reopened');

create trigger grade_submissions_updated_at before update on public.grade_submissions
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.grade_submissions');

-- ------------------------------------------------------------
-- Post-finalization corrections
-- ------------------------------------------------------------
-- Never overwrite. Always version. A finalized grade is an official
-- record: it must be correctable, but never silently.
create table public.grade_change_requests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  period_grade_id uuid not null,
  requested_by    uuid not null references public.users(id),
  reason          text not null,
  proposed_value  numeric(6,2),
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected','applied')),
  resolved_by     uuid references public.users(id),
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  foreign key (school_id, period_grade_id)
    references public.period_grades (school_id, id) on delete cascade
);

create index grade_change_requests_open_idx
  on public.grade_change_requests (school_id, status) where status = 'pending';

select app.attach_tenant_triggers('public.grade_change_requests');

-- ------------------------------------------------------------
-- Helper: is this class+period locked against teacher edits?
-- ------------------------------------------------------------
create or replace function app.submission_is_editable(p_class_id uuid, p_period_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select status in ('draft','returned','reopened')
     from public.grade_submissions
     where class_id = p_class_id and academic_period_id = p_period_id),
    true      -- no submission row yet = draft = editable
  )
$$;

-- Helper: is this class+period published to learners?
create or replace function app.submission_is_published(p_class_id uuid, p_period_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select status = 'published' and published_at is not null
     from public.grade_submissions
     where class_id = p_class_id and academic_period_id = p_period_id),
    false     -- default is always NOT visible
  )
$$;
