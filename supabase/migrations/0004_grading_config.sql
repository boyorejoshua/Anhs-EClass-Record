-- ============================================================
-- 0004 · Grading configuration
-- ============================================================
-- Replaces V0's `const W = {ww:0.30, pt:0.50, te:0.20}` (main.js:289),
-- which DepEd Order 015 s.2026 superseded in June 2026:
--   core subjects (G4-10)      WW 20 / PT 50 / EX 30
--   EPP-TLE and MAPEH (G4-10)  WW 20 / PT 60 / EX 20
--   Examinations subdivides    ST1 30 / ST2 30 / TE 40  (of EX)
-- and which changes again in SY 2027-2028 when zero-based grading
-- replaces transmutation. Here all of that is data.

create table public.transmutation_tables (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references public.schools(id) on delete cascade,
  name                  text not null,
  effective_from_year_id uuid,
  notes                 text,
  created_at            timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id),
  foreign key (school_id, effective_from_year_id)
    references public.academic_years (school_id, id) on delete set null
);

select app.attach_tenant_triggers('public.transmutation_tables');

-- V0's 41-row TRANS constant at main.js:1 becomes seed rows here.
create table public.transmutation_bands (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  transmutation_table_id uuid not null,
  min_initial            numeric(6,2) not null,
  max_initial            numeric(6,2) not null,
  output_grade           int not null,
  check (max_initial >= min_initial),
  foreign key (school_id, transmutation_table_id)
    references public.transmutation_tables (school_id, id) on delete cascade
);

create index transmutation_bands_lookup_idx
  on public.transmutation_bands (transmutation_table_id, min_initial, max_initial);

select app.attach_tenant_triggers('public.transmutation_bands');

-- ------------------------------------------------------------
-- grading_schemes
-- ------------------------------------------------------------
-- A NULL transmutation_table_id means direct rounding — which is exactly
-- how zero-based grading is expressed from SY 2027-2028. That transition
-- is a settings change, not a release.
create table public.grading_schemes (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  name                   text not null,
  description            text,
  effective_from_year_id uuid,
  pass_mark              numeric(5,2) not null default 75,   -- V0 inlined >= 75 everywhere
  rounding_mode          text not null default 'half_up'
                         check (rounding_mode in ('half_up','half_even','truncate')),
  decimal_places         int  not null default 0 check (decimal_places between 0 and 4),
  transmutation_table_id uuid,
  period_aggregation     text not null default 'mean'
                         check (period_aggregation in ('mean','weighted')),
  status                 text not null default 'active'
                         check (status in ('draft','active','retired')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id),
  foreign key (school_id, transmutation_table_id)
    references public.transmutation_tables (school_id, id) on delete restrict,
  foreign key (school_id, effective_from_year_id)
    references public.academic_years (school_id, id) on delete set null
);

create trigger grading_schemes_updated_at before update on public.grading_schemes
  for each row execute function app.set_updated_at();
select app.attach_tenant_triggers('public.grading_schemes');

-- ------------------------------------------------------------
-- grade_components — a TREE
-- ------------------------------------------------------------
-- parent_component_id is what lets Examinations hold ST1/ST2/TE as
-- weighted children. V0 has a flat three-key constant and a single `te`
-- column, so it cannot represent DO 015 at all.
create table public.grade_components (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  grading_scheme_id   uuid not null,
  parent_component_id uuid,
  code                text not null,                 -- WW / PT / EX / ST1 / ST2 / TE
  name                text not null,
  weight              numeric(6,3) not null check (weight >= 0 and weight <= 100),
  ordinal             int not null default 0,
  unique (grading_scheme_id, code),
  unique (school_id, id),
  foreign key (school_id, grading_scheme_id)
    references public.grading_schemes (school_id, id) on delete cascade,
  foreign key (school_id, parent_component_id)
    references public.grade_components (school_id, id) on delete cascade
);

create index grade_components_scheme_idx
  on public.grade_components (grading_scheme_id, parent_component_id, ordinal);

select app.attach_tenant_triggers('public.grade_components');

-- Sibling weights must sum to 100 at every level of the tree.
-- Deferred so a scheme can be authored a row at a time inside one transaction.
create or replace function app.check_component_weights()
returns trigger
language plpgsql
as $$
declare
  scheme uuid := coalesce(new.grading_scheme_id, old.grading_scheme_id);
  bad record;
begin
  for bad in
    select parent_component_id, sum(weight) as total
    from public.grade_components
    where grading_scheme_id = scheme
    group by parent_component_id
    having round(sum(weight), 3) <> 100
  loop
    raise exception
      'grading scheme %: sibling weights under parent % sum to %, must be 100',
      scheme, coalesce(bad.parent_component_id::text, 'ROOT'), bad.total
      using errcode = '23514';
  end loop;
  return null;
end;
$$;

create constraint trigger grade_components_weight_sum
  after insert or update or delete on public.grade_components
  deferrable initially deferred
  for each row execute function app.check_component_weights();

-- ------------------------------------------------------------
-- descriptor_bands — V0's LOA bands (main.js:633), as configuration
-- ------------------------------------------------------------
create table public.descriptor_bands (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  grading_scheme_id uuid not null,
  min_grade         numeric(5,2) not null,
  max_grade         numeric(5,2) not null,
  label             text not null,                   -- 'Outstanding'
  remark            text,                            -- 'Passed'
  ordinal           int not null default 0,
  check (max_grade >= min_grade),
  foreign key (school_id, grading_scheme_id)
    references public.grading_schemes (school_id, id) on delete cascade
);

select app.attach_tenant_triggers('public.descriptor_bands');

-- ------------------------------------------------------------
-- attendance_statuses — configurable, unlike V0's CHECK ('P','A','L')
-- ------------------------------------------------------------
create table public.attendance_statuses (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  code       text not null,                          -- P / A / L / E
  label      text not null,
  symbol     text not null,
  counts_as  text not null check (counts_as in ('present','absent','neutral')),
  ordinal    int not null default 0,
  is_active  boolean not null default true,
  unique (school_id, code),
  unique (school_id, id)
);

select app.attach_tenant_triggers('public.attendance_statuses');
