'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Auth entry for the nav (Phase 5, Item 3). Client-side session detection via
 * the same browser Supabase client the Item 1 hook uses (+ onAuthStateChange so
 * the nav updates live after sign-in/out). Mounted via next/dynamic(ssr:false)
 * from Nav so this — and the Supabase client — stays out of the initial shared
 * bundle and the static-export build. An entry point, never a gate.
 */
export default function NavAuth() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // undefined = unresolved → render nothing (no flash of the wrong state).
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  if (email === undefined) return null;

  if (email) {
    return (
      <div className="flex items-center gap-3 text-sm" data-testid="nav-account">
        <span className="hidden max-w-[14ch] truncate text-white/70 sm:inline" title={email}>
          {email}
        </span>
        <button
          onClick={signOut}
          className="font-medium text-white/70 transition-colors hover:text-white"
          data-testid="nav-signout"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/signin"
      className="rounded-full border border-white/30 px-3.5 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
      data-testid="nav-signin"
    >
      Sign in
    </Link>
  );
}
