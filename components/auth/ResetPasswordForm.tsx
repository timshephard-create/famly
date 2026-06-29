'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { authErrorMessage } from '@/lib/auth-errors';

/**
 * Set-a-new-password form (Phase 5, Item 2). The recovery email link routes
 * through /auth/callback, which exchanges the code for a recovery session; this
 * form then calls updateUser({ password }). If there's no recovery session
 * (link expired, opened directly, or already used), it shows a recovery path
 * rather than a dead form.
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(!!data.session);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const submit = async () => {
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authErrorMessage(error.message));
    setDone(true);
    setTimeout(() => {
      router.refresh();
      router.push('/');
    }, 1400);
  };

  if (!ready) {
    return <p className="text-sm text-mute">Loading…</p>;
  }

  if (!hasSession) {
    return (
      <div data-testid="reset-expired">
        <h1 className="font-display text-2xl font-bold text-ink">Reset link expired</h1>
        <p className="mt-1 mb-6 text-sm text-mute">
          This password reset link has expired or already been used. Request a fresh one and try again.
        </p>
        <Link
          href="/signin?mode=forgot"
          className="block w-full rounded-full bg-clover py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-clover-dark"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div data-testid="reset-done">
        <h1 className="font-display text-2xl font-bold text-ink">Password updated</h1>
        <p className="mt-1 text-sm text-mute">Taking you back to Kindora…</p>
      </div>
    );
  }

  const canSubmit = !busy && password !== '' && confirm !== '';

  return (
    <div data-testid="reset-form">
      <h1 className="font-display text-2xl font-bold text-ink">Set a new password</h1>
      <p className="mt-1 mb-6 text-sm text-mute">Choose a password at least 6 characters long.</p>

      <div className="space-y-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-ink focus:border-clover focus:outline-none focus:ring-1 focus:ring-clover"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          aria-label="Confirm new password"
          autoComplete="new-password"
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          className="w-full rounded-xl border border-line bg-white px-4 py-3 text-ink focus:border-clover focus:outline-none focus:ring-1 focus:ring-clover"
        />

        {error && (
          <p className="text-sm text-status-error" data-testid="reset-error">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-full bg-clover py-3 text-sm font-semibold text-white transition-colors hover:bg-clover-dark disabled:opacity-40"
          data-testid="reset-submit"
        >
          {busy ? '…' : 'Update password'}
        </button>
      </div>
    </div>
  );
}
