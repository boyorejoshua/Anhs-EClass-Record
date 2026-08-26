-- 0028 — rds.my_classes was missing `receipts`, and it crashed the app.
--
-- ⚠️ THIS IS A LIVE BUG, NOT A GAP. `ClassSummary.receipts` has been a
-- REQUIRED field on the client type since the receipt chain landed
-- (0022), and ClassWorkspace.tsx reads it unconditionally:
--
--   receivedAt={cls.receipts[periodId]?.receivedAt}
--
-- The `?.` only guards `.receivedAt` — it does nothing if `cls.receipts`
-- ITSELF is undefined, and `rds.my_classes` (0014) has never returned a
-- `receipts` key at all. Migration 0022 added the received_at /
-- forwarded_at / registrar_received_at / recalled_at columns and wired
-- them into `rds.adviser_queue` and `rds.submission_queue`, but never
-- into `rds.my_classes` — the one function every teacher's own class
-- list and class workspace actually calls.
--
-- The result: opening the Submission tab of any real class throws
-- `TypeError: Cannot read properties of undefined (reading '<periodId>')`
-- during render. The app has no error boundary (a gap noted for
-- separate fixing), so React unmounts the whole tree — a blank white
-- screen with no message, on the one screen a teacher needs most.
--
-- Undetected until now because:
--   • the fixture DataSource fabricates `receipts` for every class
--     (fixtures.ts `getClasses`), so the demo and the e2e suite — which
--     both run against fixtures — never exercised the real shape;
--   • no test ever called the real `my_classes` RPC and checked its
--     keys against the TypeScript contract it is cast into.
--
-- The fix is one field, built exactly the way `rds.submission_queue`
-- and `rds.adviser_queue` already build it in 0022 — an INNER join to
-- `grade_submissions`, so a period with no submission row contributes
-- no entry at all, which is what `ClassSummary.receipts`'s own doc
-- comment promises: "present only for periods that have a submission
-- row at all — a period nobody has submitted has no receipts, which is
-- different from having empty ones."
create or replace function rds.my_classes(p_year_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(c order by c ->> 'gradeLevel', c ->> 'section', c ->> 'subject'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',            cl.id,
      'gradeLevel',    gl.name,
      'section',       sec.name,
      'subject',       sub.title,
      'subjectCode',   sub.code,
      'scheduleNote',  cl.schedule_note,
      'room',          cl.room,
      'studentCount',  (select count(*) from public.class_enrollments ce
                        where ce.class_id = cl.id and ce.status = 'active'),
      -- per period, keyed by period id
      'status', coalesce((
        select jsonb_object_agg(p.id::text, coalesce(gs.status, 'draft'))
        from public.academic_periods p
        left join public.grade_submissions gs
          on gs.class_id = cl.id and gs.academic_period_id = p.id
        where p.academic_year_id = cl.academic_year_id
      ), '{}'::jsonb),
      -- NEW. Inner join, deliberately: a period nobody has submitted
      -- gets no key here at all, matching ClassSummary.receipts's own
      -- contract and how the registrar and adviser queues already do it.
      'receipts', coalesce((
        select jsonb_object_agg(p.id::text, jsonb_build_object(
          'receivedAt',          gs.received_at,
          'forwardedAt',         gs.forwarded_at,
          'registrarReceivedAt', gs.registrar_received_at,
          'recalledAt',          gs.recalled_at))
        from public.academic_periods p
        join public.grade_submissions gs
          on gs.class_id = cl.id and gs.academic_period_id = p.id
        where p.academic_year_id = cl.academic_year_id
      ), '{}'::jsonb),
      'completeness', coalesce((
        select jsonb_object_agg(p.id::text, jsonb_build_object(
          'scored', coalesce(x.scored, 0), 'total', coalesce(x.total, 0)))
        from public.academic_periods p
        left join lateral (
          select
            count(*) filter (where s.raw_score is not null or s.is_excused) as scored,
            count(*) as total
          from public.class_enrollments ce
          cross join public.assessments a
          left join public.assessment_scores s
            on s.assessment_id = a.id and s.class_enrollment_id = ce.id
          where ce.class_id = cl.id and ce.status = 'active'
            and a.class_id = cl.id and a.academic_period_id = p.id
        ) x on true
        where p.academic_year_id = cl.academic_year_id
      ), '{}'::jsonb)
    ) as c
    from public.classes cl
    join public.sections sec    on sec.id = cl.section_id
    join public.grade_levels gl on gl.id = sec.grade_level_id
    join public.subjects sub    on sub.id = cl.subject_id
    where cl.academic_year_id = p_year_id
      and cl.status = 'active'
  ) t
$$;

comment on function rds.my_classes is
  'Every class a teacher/adviser holds this year: identity, status and '
  'receipts per period, and per-period completeness. `receipts` covers '
  'only periods that have a grade_submissions row.';
