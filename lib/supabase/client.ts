'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client for USER auth (publishable key only).
 * Separate from lib/supabase-server.ts, which is the service-key ADMIN client
 * used by the support bot — never mix the two.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
