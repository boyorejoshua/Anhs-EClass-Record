/**
 * Data source selection.
 *
 * Supabase when it is configured, fixtures otherwise. The fallback is
 * not a convenience: it is what keeps local development, the test
 * suite and the single-file staging build working with no backend, and
 * it means a missing environment variable degrades to obviously-fake
 * data rather than a blank screen.
 *
 * Screens import from here and never from either implementation.
 */
import type { DataSource } from './source';
import { createFixtureSource } from './fixtures';
import { createSupabaseSource } from './supabase';
import { getSupabase } from '../lib/supabase';

let source: DataSource | null = null;

export function getDataSource(): DataSource {
  if (!source) {
    source = getSupabase() ? createSupabaseSource() : createFixtureSource();
  }
  return source;
}

export * from './source';
