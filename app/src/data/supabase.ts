/**
 * Supabase data source — the real one.
 *
 * Every read goes through an `rds.*` contract function (migration 0014)
 * that returns the screen's payload in one round trip, already shaped
 * for TypeScript. The client stays thin on purpose: the query logic is
 * then verifiable in psql, without a browser or an HTTP layer.
 *
 * All of them are SECURITY INVOKER, so row-level security applies
 * exactly as it would to a direct query. These are a convenience, never
 * a way around the policies.
 */
import { requireSupabase } from '../lib/supabase';
import type { DataSource, ScoreEdit, SessionContext } from './source';
import type { ClassSummary, GradebookData } from './types';
import type { Sf10Payload } from './sf10';

/** Supabase surfaces Postgres errors verbatim; make them readable first. */
function fail(where: string, error: { message: string; code?: string } | null): never {
  const code = error?.code ? ` [${error.code}]` : '';
  throw new Error(`${where} failed${code}: ${error?.message ?? 'unknown error'}`);
}

export function createSupabaseSource(): DataSource {
  return {
    kind: 'supabase',

    async getSession() {
      const sb = requireSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;

      const { data, error } = await sb.rpc('session_context');
      if (error) fail('Loading your account', error);
      // A signed-in user with no `users` row is a provisioning gap, not
      // an empty state — say so rather than rendering a blank shell.
      if (!data?.user) {
        throw new Error(
          'Signed in, but this account has no user record in the school. ' +
          'Ask an administrator to finish setting it up.',
        );
      }
      return data as SessionContext;
    },

    async signIn(email, password) {
      const sb = requireSupabase();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        // Never distinguish "no such account" from "wrong password":
        // the difference tells an attacker which addresses are real.
        throw new Error('That email and password did not match an account.');
      }
    },

    async signOut() {
      await requireSupabase().auth.signOut();
    },

    onAuthChange(cb) {
      const sb = getOrNull();
      if (!sb) return () => {};
      const { data } = sb.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },

    async getClasses(academicYearId) {
      const { data, error } = await requireSupabase()
        .rpc('my_classes', { p_year_id: academicYearId });
      if (error) fail('Loading your classes', error);
      return (data ?? []) as ClassSummary[];
    },

    async getGradebook(classId, periodId) {
      const { data, error } = await requireSupabase()
        .rpc('gradebook', { p_class_id: classId, p_period_id: periodId });
      if (error) fail('Loading the gradebook', error);
      return data as GradebookData;
    },

    async saveScores(edits: ScoreEdit[]) {
      if (edits.length === 0) return { written: 0 };

      const { data, error } = await requireSupabase()
        .rpc('save_scores', { p_scores: edits });
      if (error) fail('Saving scores', error);

      const written = (data as { written: number } | null)?.written ?? 0;

      // RLS filters rows it will not accept rather than raising, so a
      // short write is silent at the database. Surface it: the likeliest
      // cause is the period having been submitted in another tab, and a
      // teacher must not be left believing work was saved.
      if (written < edits.length) {
        throw new Error(
          `Only ${written} of ${edits.length} scores were saved. This period may have ` +
          'been submitted or locked. Reload to see its current state.',
        );
      }
      return { written };
    },

    async getSf10(studentId) {
      const { data, error } = await requireSupabase()
        .rpc('sf10_jhs', { p_student_id: studentId });
      if (error) fail('Loading the permanent record', error);
      return data as Sf10Payload;
    },
  };
}

// Local helper so onAuthChange can no-op when unconfigured.
function getOrNull() {
  try { return requireSupabase(); } catch { return null; }
}
