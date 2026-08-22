-- ============================================================
-- 0002 · Tenancy, identity and RBAC
-- ============================================================
-- Fixes three V0 defects:
--   * school identity was a text column default ('Angono National High School')
--   * role was a mutually-exclusive CHECK, so an adviser could not also teach
--   * permissions existed only in navigation (buildNav), never enforced

-- ------------------------------------------------------------
-- schools — the tenant root
-- ------------------------------------------------------------
create table public.schools (
  id                uuid primary key default gen_random_uuid(),
  code              citext not null unique,          -- subdomain slug
  name              text   not null,
  govt_school_id    text,                            -- DepEd school ID
  school_type       text   not null default 'public',
  region            text,
  division          text,
  district          text,
  address           text,
  contact_email     citext,
  contact_phone     text,
  logo_url          text,
  letterhead_url    text,
  timezone          text   not null default 'Asia/Manila',
  status            text   not null default 'active'
                    check (status in ('active','suspended','archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger schools_updated_at before update on public.schools
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- school_settings — behavioural flags, not document fields
-- ------------------------------------------------------------
-- Typed columns above for anything that appears on a document or is
-- queried. This bag is for switches only (portal visibility, attendance
-- mode, optional approval stages).
create table public.school_settings (
  school_id  uuid not null references public.schools(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);

create trigger school_settings_updated_at before update on public.school_settings
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
-- school_id is nullable: Mendtrix platform staff belong to no tenant.
create table public.users (
  id            uuid primary key,                    -- mirrors auth.users.id
  school_id     uuid references public.schools(id) on delete restrict,
  email         citext not null,
  employee_id   text,
  first_name    text not null,
  middle_name   text,
  last_name     text not null,
  suffix        text,
  status        text not null default 'active'
                check (status in ('active','inactive','suspended')),
  last_login_at timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, email)
);

create index users_school_status_idx on public.users (school_id, status)
  where deleted_at is null;
create index users_employee_idx on public.users (school_id, employee_id)
  where employee_id is not null;

create trigger users_updated_at before update on public.users
  for each row execute function app.set_updated_at();

-- staff_profiles — extends the login account. Exists to serve SF7,
-- which V0 cannot produce at all.
create table public.staff_profiles (
  user_id              uuid primary key references public.users(id) on delete cascade,
  school_id            uuid not null references public.schools(id) on delete cascade,
  position             text,
  employment_status    text,
  date_hired           date,
  qualifications       text,
  ancillary_assignments text,
  updated_at           timestamptz not null default now(),
  unique (school_id, user_id)
);

create trigger staff_profiles_updated_at before update on public.staff_profiles
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- Permissions — a global catalogue. The vocabulary is identical
-- across tenants; only the role→permission mapping varies.
-- ------------------------------------------------------------
create table public.permissions (
  code        text primary key,
  category    text not null,
  description text not null
);

insert into public.permissions (code, category, description) values
  ('school.config.read',        'school',     'View school configuration'),
  ('school.config.write',       'school',     'Change school configuration'),
  ('users.read',                'users',      'View user accounts'),
  ('users.write',               'users',      'Create and edit user accounts'),
  ('users.deactivate',          'users',      'Deactivate user accounts'),
  ('roles.assign',              'users',      'Assign roles to users'),
  ('students.read.own_classes', 'students',   'View learners in own classes'),
  ('students.read.section',     'students',   'View learners in advised section'),
  ('students.read.all',         'students',   'View all learners'),
  ('students.write',            'students',   'Create and edit learner records'),
  ('students.merge',            'students',   'Merge duplicate learner records'),
  ('enrollments.read',          'enrollment', 'View enrollment records'),
  ('enrollments.write',         'enrollment', 'Create and edit enrollments'),
  ('classes.read.own',          'classes',    'View own classes'),
  ('classes.read.all',          'classes',    'View all classes'),
  ('classes.assign',            'classes',    'Assign teachers to classes'),
  ('assessments.write',         'grades',     'Define assessments'),
  ('grades.encode',             'grades',     'Enter scores'),
  ('grades.read.own_classes',   'grades',     'View grades for own classes'),
  ('grades.read.section',       'grades',     'View grades for advised section'),
  ('grades.read.all',           'grades',     'View all grades'),
  ('grades.submit',             'workflow',   'Submit grades for review'),
  ('grades.return',             'workflow',   'Return a submission to the teacher'),
  ('grades.approve',            'workflow',   'Approve a submission'),
  ('grades.finalize',           'workflow',   'Finalize approved grades'),
  ('grades.publish',            'workflow',   'Publish grades to learners'),
  ('grades.reopen',             'workflow',   'Reopen a finalized record'),
  ('grades.correct',            'workflow',   'Enter a correction to a finalized grade'),
  ('attendance.encode',         'attendance', 'Record attendance'),
  ('attendance.read.own',       'attendance', 'View attendance for own classes'),
  ('attendance.read.all',       'attendance', 'View all attendance'),
  ('documents.generate',        'documents',  'Generate draft documents'),
  ('documents.issue',           'documents',  'Issue numbered official documents'),
  ('documents.reprint',         'documents',  'Reprint an issued document'),
  ('documents.read.own',        'documents',  'View own documents'),
  ('reports.read.department',   'reports',    'View department reports'),
  ('reports.read.school',       'reports',    'View school-wide reports'),
  ('audit.read',                'audit',      'View the audit log'),
  ('imports.execute',           'data',       'Run data imports');

-- ------------------------------------------------------------
-- roles — per tenant, seeded from a default template then editable.
-- This is what lets the next school's org chart differ without a migration.
-- ------------------------------------------------------------
create table public.roles (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  code       text not null,
  name       text not null,
  description text,
  is_system  boolean not null default false,   -- system roles cannot be deleted
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (school_id, id)
);

create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

-- user_roles is composable: Teacher + Adviser is two rows, not a third role.
create table public.user_roles (
  user_id    uuid not null references public.users(id) on delete cascade,
  role_id    uuid not null references public.roles(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  granted_by uuid references public.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index user_roles_school_idx on public.user_roles (school_id, user_id);

-- ------------------------------------------------------------
-- Permission lookup used by every RLS policy and RPC
-- ------------------------------------------------------------
create or replace function app.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = app.current_user_id()
      and ur.school_id = app.current_school_id()
      and rp.permission_code = perm
  )
$$;

comment on function app.has_permission is
  'True when the authenticated user holds the permission within their own tenant.';
