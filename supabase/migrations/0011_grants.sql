-- ============================================================
-- 0011 · Role grants
-- ============================================================
-- RLS decides WHICH ROWS. Grants decide WHICH TABLES AND COLUMNS.
-- Both are needed: without a grant, RLS never even runs.

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to authenticated, service_role;

-- Read access is broad at the grant level and narrowed by RLS.
grant select on all tables in schema public to authenticated;

-- Writes are granted only where an RLS policy exists to constrain them.
grant insert, update, delete on
  public.students, public.guardians, public.enrollments, public.enrollment_events,
  public.classes, public.class_teachers, public.class_enrollments,
  public.assessments, public.assessment_scores, public.attendance_records,
  public.notifications, public.import_batches,
  public.school_settings, public.academic_years, public.academic_periods,
  public.grade_levels, public.sections, public.subject_categories, public.subjects,
  public.grade_level_subjects, public.calendar_days,
  public.transmutation_tables, public.transmutation_bands, public.grading_schemes,
  public.grade_components, public.descriptor_bands, public.attendance_statuses,
  public.roles, public.user_roles, public.users,
  public.report_templates, public.announcements
to authenticated;

-- Audit log: insert only, never update or delete. 0009 revokes the rest.
grant insert on public.audit_logs to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;

-- period_grades / final_subject_grades / grade_submissions /
-- generated_documents / document_number_sequences are written ONLY by
-- SECURITY DEFINER functions. Deliberately no write grant: a client
-- cannot insert a grade or move a submission state directly.

grant execute on all functions in schema app to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public
  grant select on tables to authenticated;
