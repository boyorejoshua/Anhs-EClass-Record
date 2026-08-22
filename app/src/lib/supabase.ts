import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client.
 *
 * Created lazily and only when configured, so the app runs on fixtures
 * with no environment at all — which is what makes the staging build a
 * single self-contained file.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // A records system is often used on shared school computers.
        // Not detecting a session in the URL avoids one browser picking
        // up another's tokens from a pasted link.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, ' +
      'or run without them to use fixture data.',
    );
  }
  return c;
}
