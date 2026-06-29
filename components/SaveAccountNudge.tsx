'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Post-result capture nudge (Phase 5, Item 3). Non-blocking, in-flow card shown
 * BELOW a tool's result to signed-OUT users only — never a modal, never a gate.
 * Dismissal persists for the session via sessionStorage (dismiss once, resets
 * next visit). Tools stay fully open to anonymous users; this only invites.
 */

const DISMISS_KEY = 'kindora:nudge-dismissed';

export default function SaveAccountNudge({ signedIn }: { signedIn: boolean | null }) {
  // null = sessionStorage not read yet. Stays null during SSR/export prerender
  // (the read is in useEffect), so there is never a server/first-paint frame
  // where the nudge is shown before we know the user's intent.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode / storage disabled — fine, just hides for now */
    }
    setDismissed(true);
  };

  // Show ONLY to a confirmed signed-out user who hasn't dismissed this session.
  // While signedIn is null (session resolving) or dismissed is null (storage
  // unread), render nothing — a signed-in user must never see even one frame.
  if (signedIn !== false || dismissed !== false) return null;

  return (
    <div className="mt-8" data-testid="save-account-nudge">
      <div className="flex flex-col gap-4 rounded-2xl border border-clover bg-clover-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink">
          <span className="font-semibold">Save your family&rsquo;s details once</span> — skip
          re-entering them across every tool. Create a free account.
        </p>
        <div className="flex flex-shrink-0 items-center gap-3">
          <Link
            href="/signin?mode=signup"
            className="rounded-full bg-clover px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clover-dark"
            data-testid="nudge-create-account"
          >
            Create free account
          </Link>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-sm font-medium text-mute transition-colors hover:text-ink"
            data-testid="nudge-dismiss"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
