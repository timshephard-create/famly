'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Minimal but functional email/password + Google auth form (Phase 2).
 * Polished UX, account page, and onboarding quiz are Phase 5.
 * Email confirmation is OFF this phase, so sign-up returns a session directly.
 */
export default function AuthForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const finish = () => {
    router.refresh();
    router.push('/');
  };

  const signIn = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    finish();
  };

  const signUp = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    // With email confirmation OFF a session is returned immediately; if it's
    // ever turned ON, there's no session yet — tell the user to check email.
    if (data.session) return finish();
    setNotice('Check your email to confirm your account, then sign in.');
  };

  const google = async () => {
    setError('');
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback?next=/` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="space-y-4" data-testid="auth-form">
      <button
        onClick={google}
        className="w-full rounded-xl border border-border bg-white py-3 text-sm font-semibold text-charcoal transition-colors hover:bg-cream"
        data-testid="google-signin"
      >
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-mid">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        aria-label="Email"
        autoComplete="email"
        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-charcoal focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        autoComplete="current-password"
        className="w-full rounded-xl border border-border bg-white px-4 py-3 text-charcoal focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage"
      />

      {error && <p className="text-sm text-terra" data-testid="auth-error">{error}</p>}
      {notice && <p className="text-sm text-sage" data-testid="auth-notice">{notice}</p>}

      <div className="flex gap-2">
        <button
          onClick={signIn}
          disabled={busy || !email || !password}
          className="flex-1 rounded-xl bg-sage py-3 text-sm font-semibold text-white transition-colors hover:bg-sage-light disabled:opacity-40"
          data-testid="signin-submit"
        >
          {busy ? '…' : 'Sign in'}
        </button>
        <button
          onClick={signUp}
          disabled={busy || !email || !password}
          className="flex-1 rounded-xl border border-sage py-3 text-sm font-semibold text-sage transition-colors hover:bg-sage-pale disabled:opacity-40"
          data-testid="signup-submit"
        >
          Create account
        </button>
      </div>
    </div>
  );
}
