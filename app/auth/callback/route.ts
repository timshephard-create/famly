import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * OAuth + email code-exchange callback. Supabase redirects here with a `code`;
 * we exchange it for a session (written to cookies by the SSR client).
 *
 * Web: redirects to the `next` param (default "/").
 * Android (Capacitor): the provider can be configured to return to
 * `com.kindora.app://auth/callback`; the in-app browser hands that deep link
 * to the app, which opens this same route. We honor a `redirect_to` of that
 * custom scheme so the wrapper can finish the hand-off.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  const redirectTo = url.searchParams.get('redirect_to');

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/signin?error=auth', url.origin));
    }
  }

  // Capacitor deep-link hand-off (Android wrapper).
  if (redirectTo && redirectTo.startsWith('com.kindora.app://')) {
    return NextResponse.redirect(redirectTo);
  }

  // Web: only allow same-origin relative paths.
  const dest = next.startsWith('/') ? next : '/';
  return NextResponse.redirect(new URL(dest, url.origin));
}
