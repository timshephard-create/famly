'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { authErrorMessage } from '@/lib/auth-errors';

/**
 * Mode-switched auth form (Phase 5, Item 2) on the Phase 2 Supabase wiring —
 * email/password + Google OAuth, plus password-reset request. Confirm-email is
 * OFF this phase, so a new email sign-up returns a session directly; the
 * branching is written to stay correct once it is flipped ON (see signUp).
 */

type Mode = 'signin' | 'signup' | 'forgot';

const HEADINGS: Record<Mode, { title: string; subtitle: string }> = {
  signin: { title: 'Welcome back', subtitle: 'Sign in to pick up where you left off.' },
  signup: {
    title: 'Create your free account',
    subtitle: 'Save your family details once and skip re-entering them across tools.',
  },
  forgot: { title: 'Reset your password', subtitle: "We'll email you a link to set a new one." },
};

export default function AuthForm({
  initialMode = 'signin',
  next = '/',
}: {
  initialMode?: Mode;
  next?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const safeNext = next.startsWith('/') ? next : '/';
  const clear = () => {
    setError('');
    setNotice('');
  };
  const switchMode = (m: Mode) => {
    clear();
    setMode(m);
  };
  const finish = () => {
    router.refresh();
    router.push(safeNext);
  };

  const signIn = async () => {
    setBusy(true);
    clear();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    finish();
  };

  const signUp = async () => {
    setBusy(true);
    clear();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    // 1. Confirm-email OFF + new user → a session is returned immediately.
    if (data.session) return finish();
    // 2. Duplicate signup. Supabase obfuscates this to prevent enumeration by
    //    returning a user with an empty identities array (true under BOTH
    //    Confirm-email states), so this catch survives the ON flip.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('You already have an account — try signing in instead.');
      return setMode('signin');
    }
    // 3. Confirm-email ON + new user → no session yet; tell them to check email.
    setNotice('Check your email to confirm your account, then sign in.');
  };

  const google = async () => {
    clear();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    if (error) setError(authErrorMessage(error.message));
  };

  const sendReset = async () => {
    setBusy(true);
    clear();
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    setNotice("Check your email for a link to reset your password. It's valid for one hour.");
  };

  const submit = () => {
    if (mode === 'signin') return signIn();
    if (mode === 'signup') return signUp();
    return sendReset();
  };

  const showPassword = mode !== 'forgot';
  const canSubmit = !busy && email !== '' && (!showPassword || password !== '');
  const submitLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';
  const { title, subtitle } = HEADINGS[mode];

  return (
    <div data-testid="auth-form">
      <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-1 mb-6 text-sm text-mute">{subtitle}</p>

      {mode !== 'forgot' && (
        <>
          <button
            onClick={google}
            className="w-full rounded-full border border-line bg-white py-3 text-sm font-semibold text-ink transition-colors hover:bg-shell"
            data-testid="google-signin"
          >
            Continue with Google
          </button>
          <div className="my-4 flex items-center gap-3 text-xs text-mute">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <div className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email"
          autoComplete="email"
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-ink focus:border-clover focus:outline-none focus:ring-1 focus:ring-clover"
        />
        {showPassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-ink focus:border-clover focus:outline-none focus:ring-1 focus:ring-clover"
          />
        )}

        {error && (
          <p className="text-sm text-status-error" data-testid="auth-error">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-sm text-clover" data-testid="auth-notice">
            {notice}
          </p>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-full bg-clover py-3 text-sm font-semibold text-white transition-colors hover:bg-clover-dark disabled:opacity-40"
          data-testid="auth-submit"
        >
          {busy ? '…' : submitLabel}
        </button>
      </div>

      {/* Mode toggles */}
      <div className="mt-6 space-y-2 text-center text-sm text-mute">
        {mode === 'signin' && (
          <>
            <p>
              New to Kindora?{' '}
              <button onClick={() => switchMode('signup')} className="font-semibold text-clover hover:underline">
                Create an account
              </button>
            </p>
            <p>
              <button onClick={() => switchMode('forgot')} className="text-mute hover:text-ink hover:underline">
                Forgot your password?
              </button>
            </p>
          </>
        )}
        {mode === 'signup' && (
          <p>
            Already have an account?{' '}
            <button onClick={() => switchMode('signin')} className="font-semibold text-clover hover:underline">
              Sign in
            </button>
          </p>
        )}
        {mode === 'forgot' && (
          <p>
            <button onClick={() => switchMode('signin')} className="font-semibold text-clover hover:underline">
              &larr; Back to sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
