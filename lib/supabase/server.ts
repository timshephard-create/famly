import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cookie-based Supabase client for USER auth in server components and route
 * handlers (publishable key only). Phase 4 metering reads the signed-in user
 * via getUser() below. Distinct from lib/supabase-server.ts (service-key admin
 * client for the support bot) — do not conflate.
 */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookies are read-only —
            // the middleware refresh handles writing the rotated session.
          }
        },
      },
    },
  );
}

/** Convenience: the current authenticated user (or null) on the server. */
export async function getUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
