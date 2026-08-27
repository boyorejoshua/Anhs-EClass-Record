-- 0035 — The school's own details, editable by its administrator.
--
-- `nav.ts` has carried `setup` as `planned` with the note "School
-- profile and settings are currently configured during onboarding"
-- since the navigation model was built. True, and it stopped being
-- good enough the moment these fields started PRINTING: the school
-- name, government school ID, region and division are the header of
-- every SF form the school files. A typo in "CALABARZON" set during
-- onboarding was, until now, a support ticket.
--
-- `school.config.read` and `school.config.write` have existed in the
-- permission catalogue since 0002 and were never called by anything.
-- This is the screen they were seeded for.
--
-- ── WHAT IS NOT EDITABLE, AND WHY ─────────────────────────────────────
--
--   code      the tenant slug. It is the subdomain, it appears in the
--             sign-in URL, and `app.current_school_id()` resolution is
--             cross-checked against it. A school renaming its own slug
--             would lock every user out of the tenant mid-session.
--   status    active / suspended / archived is Mendtrix's lever, not
--             the school's. A suspended school must not be able to
--             un-suspend itself.
--   id        obviously.
--
-- Neither appears as a parameter, so this is not a rule the function
-- enforces — it is a change it has no way to express.
--
-- ── WHY THE FIELDS ARE NOT VALIDATED HARDER ───────────────────────────
--
-- Region and division are free text on purpose. DepEd's own spellings
-- vary between issuances ("IV-A CALABARZON" / "Region IV-A"), the
-- school copies whatever their division office uses, and a dropdown
-- built from our guess at the list would be wrong for somebody. The
-- form shows what will print instead, which is the check that matters.

-- ------------------------------------------------------------
-- rds.school_profile
-- ------------------------------------------------------------
create or replace function rds.school_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_result jsonb;
begin
  if not app.has_permission('school.config.read') then
    raise exception 'not permitted to view the school profile' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', s.id,
    -- Returned so the screen can SHOW it as read-only rather than
    -- leaving a person wondering where their subdomain went.
    'code', s.code,
    'name', s.name,
    'govtSchoolId', s.govt_school_id,
    'schoolType', s.school_type,
    'region', s.region,
    'division', s.division,
    'district', s.district,
    'address', s.address,
    'contactEmail', s.contact_email,
    'contactPhone', s.contact_phone,
    'status', s.status,
    'permissions', jsonb_build_object(
      'canWrite', app.has_permission('school.config.write')
    )
  ) into v_result
  from public.schools s
  where s.id = v_school;

  return v_result;
end;
$fn$;

create or replace function public.school_profile()
returns jsonb language sql stable set search_path = public, pg_temp
as $fn$ select rds.school_profile() $fn$;

-- ------------------------------------------------------------
-- update_school_profile
-- ------------------------------------------------------------
create or replace function public.update_school_profile(
  p_name           text,
  p_govt_school_id text default null,
  p_region         text default null,
  p_division       text default null,
  p_district       text default null,
  p_address        text default null,
  p_contact_email  text default null,
  p_contact_phone  text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_school uuid := app.current_school_id();
  v_name   text := nullif(btrim(p_name), '');
  v_before jsonb;
begin
  if not app.has_permission('school.config.write') then
    raise exception 'not permitted to change the school profile' using errcode = '42501';
  end if;
  if v_name is null then
    -- The name prints on every form. An empty one is not a blank field,
    -- it is a document that cannot be filed.
    raise exception 'the school needs a name' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'name', s.name, 'govtSchoolId', s.govt_school_id,
    'region', s.region, 'division', s.division, 'district', s.district)
  into v_before
  from public.schools s where s.id = v_school;

  update public.schools
     set name           = v_name,
         govt_school_id = nullif(btrim(p_govt_school_id), ''),
         region         = nullif(btrim(p_region), ''),
         division       = nullif(btrim(p_division), ''),
         district       = nullif(btrim(p_district), ''),
         address        = nullif(btrim(p_address), ''),
         contact_email  = nullif(btrim(p_contact_email), '')::citext,
         contact_phone  = nullif(btrim(p_contact_phone), '')
   where id = v_school;

  -- Old and new. These fields head every SF form the school files, so
  -- "when did the division name change, and who changed it" is a
  -- question that will eventually be asked about a filed document.
  perform app.write_audit('school.update', 'schools', v_school, v_before,
    jsonb_build_object('name', v_name,
                       'govtSchoolId', nullif(btrim(p_govt_school_id), ''),
                       'region', nullif(btrim(p_region), ''),
                       'division', nullif(btrim(p_division), ''),
                       'district', nullif(btrim(p_district), '')));
end;
$fn$;

comment on function public.update_school_profile is
  'Updates the school''s printable details. Cannot reach `code` (the '
  'tenant slug), `status`, or `id` — none is a parameter.';

revoke all on function
  rds.school_profile(), public.school_profile(),
  public.update_school_profile(text, text, text, text, text, text, text, text)
  from public, anon;

grant execute on function
  public.school_profile(),
  public.update_school_profile(text, text, text, text, text, text, text, text)
  to authenticated;
