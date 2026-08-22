-- ============================================================
-- 0005 · Students, guardians and enrollment — the three time layers
-- ============================================================
-- V0's two deepest defects, both fixed here:
--   * grades keyed by uppercased NAME  → stable UUID identity
--   * students.class_id NOT NULL       → student is a school-level master
--                                        record; enrollment is per year
-- Layer 1 students (permanent) → Layer 2 enrollments (per year)
--   → Layer 3 class_enrollments (per subject, in 0006)

create table public.students (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  student_number text,
  lrn            text,                      -- nullable: learners arrive without one
  first_name     text not null,
  middle_name    text,
  last_name      text not null,
  suffix         text,
  sex            text check (sex in ('male','female')),
  birth_date     date,
  birth_place    text,
  mother_tongue  text,
  religion       text,
  ethnicity      text,
  is_ip          boolean not null default false,
  has_disability boolean not null default false,
  address_line   text,
  barangay       text,
  municipality   text,
  province       text,
  contact_number text,
  email          citext,
  status         text not null default 'active'
                 check (status in ('active','inactive','graduated','transferred_out')),
  -- Student portal login. Nullable: a learner record exists long before
  -- (and after) it has an account. Deactivating the account never
  -- touches the academic record.
  portal_user_id uuid references public.users(id) on delete set null,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (school_id, id)
);

-- LRN is unique per school when present, ignoring soft-deleted rows.
create unique index students_lrn_unique
  on public.students (school_id, lrn)
  where lrn is not null and deleted_at is null;

create unique index students_number_unique
  on public.students (school_id, student_number)
  where student_number is not null and deleted_at is null;

create index students_name_search_idx
  on public.students using gin (
    to_tsvector('simple', coalesce(first_name,'') || ' ' || coalesce(last_name,''))
  );

create index students_school_status_idx
  on public.students (school_id, status) where deleted_at is null;

-- Display name is derived, never stored — V0 stored an uppercased name
-- string and used it as the primary key for grades and attendance.
create or replace function public.student_display_name(s public.students)
returns text
language sql
immutable
as $$
  select trim(both ' ' from
    s.last_name || ', ' || s.first_name ||
    coalesce(' ' || nullif(s.middle_name, ''), '') ||
    coalesce(' ' || nullif(s.suffix, ''), ''))
$$;

create trigger students_updated_at before update on public.students
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.students');

-- ------------------------------------------------------------
-- guardians
-- ------------------------------------------------------------
-- portal_user_id ships nullable in V1 so the Phase 2 parent portal is a
-- new surface over an existing relationship, not a migration.
create table public.guardians (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools(id) on delete cascade,
  student_id           uuid not null,
  full_name            text not null,
  relationship         text,
  contact_number       text,
  email                citext,
  address              text,
  occupation           text,
  is_primary           boolean not null default false,
  is_emergency_contact boolean not null default false,
  portal_user_id       uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (school_id, student_id)
    references public.students (school_id, id) on delete cascade
);

create index guardians_student_idx on public.guardians (school_id, student_id);
create unique index guardians_one_primary
  on public.guardians (student_id) where is_primary;

create trigger guardians_updated_at before update on public.guardians
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.guardians');

-- ------------------------------------------------------------
-- enrollments — the hinge of the whole model
-- ------------------------------------------------------------
-- One row per learner per academic year. Promoting a learner CREATES a
-- row; it never modifies the prior year's. That is what makes academic
-- history, SF10 and the portal's history screen possible.
create table public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null,
  academic_year_id uuid not null,
  grade_level_id   uuid not null,
  section_id       uuid,
  date_enrolled    date not null default current_date,
  status           text not null default 'enrolled'
                   check (status in ('enrolled','transferred_in','transferred_out',
                                     'dropped','completed')),
  promotion_status text check (promotion_status in ('promoted','retained','conditional')),
  general_average  numeric(6,2),
  previous_school  text,
  remarks          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, academic_year_id),
  unique (school_id, id),
  foreign key (school_id, student_id)
    references public.students (school_id, id) on delete restrict,
  foreign key (school_id, academic_year_id)
    references public.academic_years (school_id, id) on delete restrict,
  foreign key (school_id, grade_level_id)
    references public.grade_levels (school_id, id) on delete restrict,
  foreign key (school_id, section_id)
    references public.sections (school_id, id) on delete set null
);

create index enrollments_year_section_idx
  on public.enrollments (school_id, academic_year_id, section_id);
create index enrollments_student_idx
  on public.enrollments (school_id, student_id);

create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.enrollments');
create trigger enrollments_archived_year before insert or update or delete
  on public.enrollments
  for each row execute function app.reject_write_to_archived_year();

-- Learner movement. V0 has no equivalent at all, which is why it cannot
-- produce SF4 (monthly movement) correctly.
create table public.enrollment_events (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  enrollment_id uuid not null,
  event_type    text not null
                check (event_type in ('transfer_in','transfer_out','drop',
                                      're_entry','section_change')),
  event_date    date not null,
  from_value    text,
  to_value      text,
  notes         text,
  recorded_by   uuid references public.users(id),
  created_at    timestamptz not null default now(),
  foreign key (school_id, enrollment_id)
    references public.enrollments (school_id, id) on delete cascade
);

create index enrollment_events_lookup_idx
  on public.enrollment_events (school_id, event_date, event_type);

select app.attach_tenant_triggers('public.enrollment_events');

-- One learner account per student, and one student per account.
create unique index students_portal_user_unique
  on public.students (portal_user_id) where portal_user_id is not null;

-- Resolves the authenticated learner. Used by every student-portal RLS
-- policy. Returns NULL for staff, which makes those policies deny by default.
create or replace function app.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.students
  where portal_user_id = app.current_user_id()
    and school_id = app.current_school_id()
    and deleted_at is null
$$;
