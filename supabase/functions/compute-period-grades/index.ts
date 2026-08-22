/**
 * compute-period-grades — the authoritative grade calculation.
 *
 * This is the ONLY thing in the system allowed to decide what a
 * learner's period grade is. The browser computes the same numbers for
 * immediate feedback while a teacher types, but nothing the browser
 * sends is trusted: this function reads the scores back out of the
 * database and recomputes from those.
 *
 * ── ONE ENGINE ────────────────────────────────────────────────────────
 * `./grading/index.ts` is not a Deno reimplementation. It is
 * `app/src/lib/grading/index.ts`, copied verbatim by
 * `scripts/vendor-grading-engine.mjs`, with only the import specifiers
 * rewritten for Deno's mandatory file extensions.
 * `app/src/lib/grading/edge-function.test.ts` regenerates the copy and
 * diffs it, and `npm run build` runs the same check, so "one canonical
 * engine" is enforced mechanically rather than promised in a comment.
 *
 * ── AUTHORIZATION ─────────────────────────────────────────────────────
 * Two clients, deliberately:
 *
 *   userClient    the caller's own JWT. Every READ goes through it, so
 *                 row-level security decides what this teacher may see.
 *                 Authorization is therefore not reimplemented here — a
 *                 teacher who does not own the class gets an empty
 *                 gradebook from the database itself.
 *
 *   adminClient   service_role. Used for exactly one call,
 *                 record_period_grades, because `authenticated` has no
 *                 write privilege on period_grades at all (migration
 *                 0020). A teacher hands the system SCORES; only the
 *                 server derives a GRADE.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { compute } from './grading/index.ts';
import type { Assessment, GradingScheme, Score } from './grading/index.ts';

/** Bumped when the engine's behaviour changes; stored on every row. */
const ENGINE_VERSION = 'grading-1.0.0';

interface GradebookPayload {
  scheme: GradingScheme;
  assessments: Assessment[];
  roster: Array<{ classEnrollmentId: string; studentId: string; displayName: string }>;
  scores: Record<string, Record<string, { raw: number | null; isExcused: boolean }>>;
  status: string;
  editable: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Postgres errors are precise and unreadable. A teacher must never see
 * "23503" or a constraint name, but the real text still has to reach the
 * logs or nothing is diagnosable.
 */
function humanError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  console.error('[compute-period-grades]', raw);
  // Order matters. The finalized-period trigger in migration 0020 also
  // raises 42501, so the specific case has to be tested before the
  // general "insufficient privilege" one — otherwise a teacher whose
  // period is locked is told they lack permission, and goes looking for
  // the wrong fix.
  if (/finalized|published|reopen it first/i.test(raw)) {
    return 'This period has been finalized. Ask the registrar to reopen it before resubmitting.';
  }
  if (/not permitted|42501|permission denied|insufficient/i.test(raw)) {
    return 'You are not allowed to submit grades for this class.';
  }
  if (/does not belong/i.test(raw)) {
    return 'A learner in this submission is not enrolled in the class. Reload and try again.';
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Not signed in.' }, 401);
  }

  let body: { classId?: string; periodId?: string; submit?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const { classId, periodId } = body;
  const alsoSubmit = body.submit !== false;
  if (!classId || !periodId) {
    return json({ error: 'classId and periodId are required.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Reads run as the CALLER. RLS is the authorization check.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Not signed in.' }, 401);

  /* ---- 1. authoritative data, read under the caller's own RLS ------ */
  const { data: gb, error: gbError } = await userClient
    .rpc('gradebook', { p_class_id: classId, p_period_id: periodId });

  if (gbError) {
    return json({ error: humanError(gbError, 'Could not read the gradebook.') }, 403);
  }
  const gradebook = gb as GradebookPayload | null;
  if (!gradebook?.scheme) {
    // An empty result here means RLS returned nothing — the caller does
    // not teach this class, or the class does not exist.
    return json({ error: 'You are not allowed to submit grades for this class.' }, 403);
  }
  if (gradebook.assessments.length === 0) {
    return json({
      error: 'This period has no assessments configured, so there is nothing to compute.',
    }, 422);
  }
  if (gradebook.roster.length === 0) {
    return json({ error: 'This class has no learners enrolled.' }, 422);
  }

  /* ---- 2. the canonical engine ------------------------------------- */
  //
  // FINAL mode. Mid-term the gradebook excludes an unscored assessment
  // so a partial record reads as a grade-so-far; at submission an
  // unscored assessment is a zero, because that is what the teacher is
  // certifying. docs/grading-calculation-validation.md §"one real
  // divergence" covers why the two modes exist.
  const rows = gradebook.roster.map((learner) => {
    const cells = gradebook.scores[learner.classEnrollmentId] ?? {};
    const scores: Score[] = gradebook.assessments.map((a) => ({
      assessmentId: a.id,
      raw: cells[a.id]?.raw ?? null,
      isExcused: cells[a.id]?.isExcused ?? false,
    }));
    const result = compute(gradebook.scheme, gradebook.assessments, scores, {
      includeUnscored: true,
    });
    return {
      classEnrollmentId: learner.classEnrollmentId,
      initialGrade: result.initialGrade,
      periodGrade: result.periodGrade,
      descriptor: result.descriptor,
      remark: result.remark,
      passed: result.passed,
      componentBreakdown: result.components,
      schemeSnapshot: gradebook.scheme,
      engineVersion: ENGINE_VERSION,
      computedMode: 'final',
    };
  });

  /* ---- 3. sanity-check before writing ------------------------------ */
  //
  // A grade outside 0-100 means the engine or the scheme is wrong.
  // Persisting it would put a nonsense number on an academic record, so
  // refuse the whole batch rather than write part of it.
  const nonsense = rows.filter(
    (r) => r.periodGrade != null && (r.periodGrade < 0 || r.periodGrade > 100),
  );
  if (nonsense.length > 0) {
    console.error('[compute-period-grades] out-of-range grades', nonsense);
    return json({
      error: 'The calculation produced an impossible grade. Nothing was saved. '
           + 'Check this class\'s grading scheme with an administrator.',
    }, 500);
  }

  /* ---- 4. persist, as service_role --------------------------------- */
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: written, error: writeError } = await adminClient
    .rpc('record_period_grades', {
      p_class_id: classId, p_period_id: periodId, p_rows: rows,
    });

  if (writeError) {
    return json({ error: humanError(writeError, 'Could not save the calculated grades.') }, 500);
  }

  /* ---- 5. move the workflow, as the CALLER -------------------------- */
  //
  // submit_grades re-runs validate_submission, checks the teacher holds
  // grades.submit, enforces the state machine and writes an audit row.
  // Running it as the caller keeps every one of those checks real.
  //
  // Deliberately AFTER persistence: if this fails, the class is left with
  // computed grades and a draft status, which is recoverable. The reverse
  // order would leave a submitted period with no grades behind it.
  let submission: unknown = null;
  if (alsoSubmit) {
    const { data, error } = await userClient.rpc('submit_grades', {
      p_class_id: classId,
      p_period_id: periodId,
      p_acknowledge_warnings: true,
    });
    if (error) {
      return json({
        error: humanError(error, 'The grades were calculated but the submission did not go through.'),
        computed: written,
      }, 409);
    }
    submission = data;
  }

  return json({
    ok: true,
    learners: rows.length,
    assessments: gradebook.assessments.length,
    ...(written as Record<string, number>),
    submission,
    engineVersion: ENGINE_VERSION,
  });
});
