import type { Metadata } from 'next';
import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import AuthShell from '@/components/auth/AuthShell';
import AuthForm from '@/components/auth/AuthForm';
import SignOutButton from '@/components/auth/SignOutButton';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

// Auth state is per-request; never statically cache this page.
export const dynamic = 'force-dynamic';

type Mode = 'signin' | 'signup' | 'forgot';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string; mode?: string; error?: string };
}) {
  const user = await getUser();
  const next =
    typeof searchParams.next === 'string' && searchParams.next.startsWith('/') ? searchParams.next : '/';
  const mode: Mode =
    searchParams.mode === 'signup' ? 'signup' : searchParams.mode === 'forgot' ? 'forgot' : 'signin';
  const calloutError =
    searchParams.error === 'auth' ? 'Sign-in failed or was cancelled. Please try again.' : '';

  return (
    <AuthShell>
      {user ? (
        <div data-testid="signed-in">
          <h1 className="font-display text-2xl font-bold text-ink">You&rsquo;re signed in</h1>
          <p className="mt-1 mb-6 text-sm text-mute">
            Signed in as <span className="font-semibold text-ink">{user.email}</span>
          </p>
          <Link
            href={next}
            className="block w-full rounded-full bg-clover py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-clover-dark"
          >
            Continue
          </Link>
          <div className="mt-4 text-center">
            <SignOutButton />
          </div>
        </div>
      ) : (
        <>
          {calloutError && <p className="mb-4 text-sm text-status-error">{calloutError}</p>}
          <AuthForm initialMode={mode} next={next} />
        </>
      )}
    </AuthShell>
  );
}
