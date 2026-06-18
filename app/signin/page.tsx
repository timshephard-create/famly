import type { Metadata } from 'next';
import { getUser } from '@/lib/supabase/server';
import AuthForm from '@/components/auth/AuthForm';
import SignOutButton from '@/components/auth/SignOutButton';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

// Auth state is per-request; never statically cache this page.
export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const user = await getUser();

  return (
    <div className="min-h-screen bg-cream px-5 py-16">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-charcoal">
          {user ? 'You’re signed in.' : 'Sign in to Kindora'}
        </h1>

        {user ? (
          <div className="mt-4 space-y-4" data-testid="signed-in">
            <p className="text-sm text-mid">
              Signed in as <span className="font-semibold text-charcoal">{user.email}</span>
            </p>
            <SignOutButton />
          </div>
        ) : (
          <>
            <p className="mt-1 mb-6 text-sm text-mid">
              The four tools stay free and open — an account just saves your place.
            </p>
            <AuthForm />
          </>
        )}
      </div>
    </div>
  );
}
