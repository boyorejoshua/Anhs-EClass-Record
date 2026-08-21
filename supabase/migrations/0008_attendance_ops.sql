-- ============================================================
-- 0008 · Attendance and operational tables
-- ============================================================

-- ------------------------------------------------------------
-- attendance_records
-- ------------------------------------------------------------
-- class_id NULL  = daily / homeroom attendance owned by the adviser
-- class_id SET   = per-subject attendance
-- One table serves both modes, selected by school_settings. Which one a
-- school uses is a genuine fork (SF2 is an adviser's daily form, but
-- many subject teachers also keep their own) and must be configuration.
create table public.attendance_records (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools(id) on delete cascade,
  enrollment_id        uuid not null,
  class_id             uuid,
  calendar_day_id      uuid not null,
  attendance_status_id uuid not null,
  note                 text,
  recorded_by          uuid references public.users(id),
  recorded_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (school_id, enrollment_id)
    references public.enrollments (school_id, id) on delete cascade,
  foreign key (school_id, class_id)
    references public.classes (school_id, id) on delete cascade,
  foreign key (school_id, calendar_day_id)
    references public.calendar_days (school_id, id) on delete cascade,
  foreign key (school_id, attendance_status_id)
    references public.attendance_statuses (school_id, id) on delete restrict
);

-- One mark per learner per day per (optional) class.
-- COALESCE gives NULL class_id a stable key so the unique index bites.
create unique index attendance_one_per_day
  on public.attendance_records (
    enrollment_id,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    calendar_day_id
  );

create index attendance_class_day_idx
  on public.attendance_records (school_id, class_id, calendar_day_id);
create index attendance_enrollment_idx
  on public.attendance_records (school_id, enrollment_id);

create trigger attendance_records_updated_at before update on public.attendance_records
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.attendance_records');

-- Attendance may only be recorded on an actual class day.
-- V0 has no calendar at all, so it happily records marks on holidays and
-- then divides by days recorded rather than days in session.
create or replace function app.check_attendance_is_class_day()
returns trigger
language plpgsql
as $$
declare
  dtype text;
begin
  select day_type into dtype from public.calendar_days where id = new.calendar_day_id;
  if dtype is distinct from 'class_day' then
    raise exception 'attendance cannot be recorded on a % day', coalesce(dtype, 'unknown')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger attendance_records_class_day
  before insert or update on public.attendance_records
  for each row execute function app.check_attendance_is_class_day();

-- ------------------------------------------------------------
-- audit_logs — append-only
-- ------------------------------------------------------------
-- UPDATE and DELETE are revoked in 0009 from every role including
-- service_role. An audit log an attacker can edit is not an audit log.
create table public.audit_logs (
  id          bigserial primary key,
  school_id   uuid references public.schools(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  old_values  jsonb,
  new_values  jsonb,
  reason      text,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx
  on public.audit_logs (school_id, entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx
  on public.audit_logs (school_id, actor_user_id, created_at desc);
create index audit_logs_action_idx
  on public.audit_logs (school_id, action, created_at desc);

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
-- Never contains a grade value in the body: email is not a confidential
-- channel and a learner's grade must not sit in an inbox preview.
create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  type              text not null,
  title             text not null,
  body              text,
  link              text,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index notifications_unread_idx
  on public.notifications (recipient_user_id, created_at desc) where read_at is null;

select app.attach_tenant_triggers('public.notifications');

-- ------------------------------------------------------------
-- import_batches
-- ------------------------------------------------------------
create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  import_type   text not null,
  filename      text,
  uploaded_by   uuid references public.users(id),
  status        text not null default 'pending'
                check (status in ('pending','validating','previewed','committed','failed')),
  row_count     int not null default 0,
  success_count int not null default 0,
  error_count   int not null default 0,
  report        jsonb,
  created_at    timestamptz not null default now()
);

select app.attach_tenant_triggers('public.import_batches');

-- ------------------------------------------------------------
-- Document engine
-- ------------------------------------------------------------
create table public.report_templates (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  code           text not null,                 -- 'sf9_report_card'
  name           text not null,
  version        int  not null default 1,
  data_source    text not null,                 -- the Layer 2 contract
  config         jsonb not null default '{}'::jsonb,
  effective_from date,
  status         text not null default 'draft'
                 check (status in ('draft','active','retired')),
  created_at     timestamptz not null default now(),
  unique (school_id, code, version),
  unique (school_id, id)
);

select app.attach_tenant_triggers('public.report_templates');

create table public.document_number_sequences (
  school_id        uuid not null references public.schools(id) on delete cascade,
  document_type    text not null,
  academic_year_id uuid not null,
  next_value       bigint not null default 1,
  primary key (school_id, document_type, academic_year_id)
);

create table public.generated_documents (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  template_id      uuid,
  template_version int,
  document_number  text,
  document_type    text not null,
  subject_type     text not null check (subject_type in ('student','section','class','school')),
  subject_id       uuid,
  academic_year_id uuid,
  signatories      jsonb,          -- frozen at issuance, never re-resolved
  generated_by     uuid references public.users(id),
  generated_at     timestamptz not null default now(),
  file_path        text,
  checksum         text,
  status           text not null default 'draft'
                   check (status in ('draft','issued','superseded','voided')),
  superseded_by    uuid references public.generated_documents(id),
  unique (school_id, document_number),
  foreign key (school_id, template_id)
    references public.report_templates (school_id, id) on delete set null
);

create index generated_documents_subject_idx
  on public.generated_documents (school_id, subject_type, subject_id);

select app.attach_tenant_triggers('public.generated_documents');

-- Allocated atomically at issuance, never at request time — otherwise a
-- failed render burns a number and the registrar finds gaps.
create or replace function app.next_document_number(
  p_document_type text,
  p_academic_year_id uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school uuid := app.current_school_id();
  v_seq bigint;
  v_code text;
  v_year text;
begin
  insert into public.document_number_sequences (school_id, document_type, academic_year_id, next_value)
  values (v_school, p_document_type, p_academic_year_id, 2)
  on conflict (school_id, document_type, academic_year_id)
  do update set next_value = public.document_number_sequences.next_value + 1
  returning next_value - 1 into v_seq;

  select code into v_code from public.schools where id = v_school;
  select label into v_year from public.academic_years where id = p_academic_year_id;

  return upper(v_code) || '-' || upper(p_document_type) || '-'
         || split_part(coalesce(v_year, ''), '-', 1) || '-'
         || lpad(v_seq::text, 6, '0');
end;
$$;

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  title        text not null,
  body         text not null,
  audience     jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  expires_at   timestamptz,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

select app.attach_tenant_triggers('public.announcements');
