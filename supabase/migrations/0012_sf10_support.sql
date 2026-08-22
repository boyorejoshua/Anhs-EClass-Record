-- ============================================================
-- 0012 · SF10-JHS support
-- ============================================================
-- Driven by the school's actual blank form (SF10-JHS, "SFRT Revised
-- 2017"). Four things on that form have no home in the model yet:
--
--   1. MAPEH is a PARENT learning area printed with four children
--      (Music, Arts, Physical Education, Health), each with its own
--      quarterly ratings and final rating, plus a MAPEH aggregate row.
--   2. ELIGIBILITY FOR JHS ENROLMENT — elementary completer details,
--      PEPT rating, ALS, credential presented.
--   3. Each SCHOLASTIC RECORD block carries its OWN school, school ID,
--      district, division, region and adviser — because a transferred
--      learner's earlier years happened somewhere else.
--   4. Remedial classes: conducted-from/to, per-subject final rating,
--      remedial mark and recomputed final grade.
--
-- ⚠️ One conflict this form exposes is NOT solved here because it is a
-- policy question, not a schema one: SF10-JHS has FOUR quarterly rating
-- columns, while DO 009 s.2026 moves schools to THREE terms. See
-- docs/20-assumptions-register.md item F11.

-- ------------------------------------------------------------
-- 1 · Learning-area hierarchy
-- ------------------------------------------------------------
alter table public.subjects
  add column parent_subject_id uuid,
  add column is_printed_on_records boolean not null default true;

alter table public.subjects
  add constraint subjects_parent_fk
  foreign key (school_id, parent_subject_id)
  references public.subjects (school_id, id) on delete restrict;

comment on column public.subjects.parent_subject_id is
  'MAPEH children (Music, Arts, PE, Health) point at the MAPEH row. The '
  'parent prints an aggregate line on SF10 and the children indent beneath it.';

create index subjects_parent_idx on public.subjects (school_id, parent_subject_id)
  where parent_subject_id is not null;

-- A learning area may not be its own parent, and the tree is one level
-- deep — a child cannot itself have children.
create or replace function app.check_subject_tree_depth()
returns trigger language plpgsql as $$
begin
  if new.parent_subject_id = new.id then
    raise exception 'a learning area cannot be its own parent';
  end if;
  if new.parent_subject_id is not null and exists (
    select 1 from public.subjects p
    where p.id = new.parent_subject_id and p.parent_subject_id is not null
  ) then
    raise exception 'learning-area nesting is limited to one level (MAPEH -> Music)';
  end if;
  return new;
end;
$$;

create trigger subjects_tree_depth before insert or update on public.subjects
  for each row execute function app.check_subject_tree_depth();

-- ------------------------------------------------------------
-- 2 · Eligibility for JHS enrolment
-- ------------------------------------------------------------
create table public.student_eligibility (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  student_id             uuid not null,
  -- the form's checkbox group
  eligibility_type       text not null
                         check (eligibility_type in ('elem_completer','pept','als','other')),
  general_average        numeric(6,2),
  citation               text,                       -- 'Citation: (If Any)'
  prev_school_name       text,
  prev_school_govt_id    text,
  prev_school_address    text,
  credential_presented   text,                       -- 'Other Credential Presented'
  exam_rating            numeric(6,2),               -- PEPT / ALS rating
  exam_date              date,                       -- 'Date of Examination/Assessment'
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (student_id),
  unique (school_id, id),
  foreign key (school_id, student_id)
    references public.students (school_id, id) on delete cascade
);

create trigger student_eligibility_updated_at before update on public.student_eligibility
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.student_eligibility');

-- ------------------------------------------------------------
-- 3 · Per-enrollment recording school
-- ------------------------------------------------------------
-- NULL means "this tenant's own school" and the values come from
-- public.schools. A non-null value means the learner spent that year
-- elsewhere and the SF10 block must print THAT school's details.
alter table public.enrollments
  add column recording_school_name     text,
  add column recording_school_govt_id  text,
  add column recording_district        text,
  add column recording_division        text,
  add column recording_region          text,
  add column adviser_name              text;

comment on column public.enrollments.recording_school_name is
  'Set only for a year the learner spent at another school. NULL means '
  'the tenant school, whose details come from public.schools.';

-- ------------------------------------------------------------
-- 4 · Remedial classes
-- ------------------------------------------------------------
create table public.remedial_classes (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  enrollment_id  uuid not null,
  conducted_from date,
  conducted_to   date,
  created_at     timestamptz not null default now(),
  unique (enrollment_id),
  unique (school_id, id),
  foreign key (school_id, enrollment_id)
    references public.enrollments (school_id, id) on delete cascade,
  check (conducted_to is null or conducted_from is null or conducted_to >= conducted_from)
);

select app.attach_tenant_triggers('public.remedial_classes');

create table public.remedial_marks (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools(id) on delete cascade,
  remedial_class_id     uuid not null,
  subject_id            uuid not null,
  final_rating          numeric(6,2),
  remedial_class_mark   numeric(6,2),
  recomputed_final_grade numeric(6,2),
  remarks               text,
  unique (remedial_class_id, subject_id),
  foreign key (school_id, remedial_class_id)
    references public.remedial_classes (school_id, id) on delete cascade,
  foreign key (school_id, subject_id)
    references public.subjects (school_id, id) on delete restrict
);

select app.attach_tenant_triggers('public.remedial_marks');

-- ------------------------------------------------------------
-- RLS for the new tables
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['student_eligibility','remedial_classes','remedial_marks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format(
      'create policy tenant_read on public.%I for select to authenticated
         using (school_id = app.current_school_id()
                and (app.has_permission(''students.read.all'')
                     or app.has_permission(''grades.read.all'')))', t);
    execute format(
      'create policy registrar_write on public.%I for all to authenticated
         using      (school_id = app.current_school_id() and app.has_permission(''students.write''))
         with check (school_id = app.current_school_id() and app.has_permission(''students.write''))', t);
  end loop;
end $$;

-- A learner may read their own eligibility record (it appears on their
-- permanent record), but never anyone else's.
create policy eligibility_read_self on public.student_eligibility
  for select to authenticated
  using (student_id = app.current_student_id());

grant select on public.student_eligibility, public.remedial_classes, public.remedial_marks
  to authenticated;
grant insert, update, delete on
  public.student_eligibility, public.remedial_classes, public.remedial_marks
  to authenticated;
