'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.refresh();
      }}
      className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-mute transition-colors hover:bg-shell hover:text-ink"
      data-testid="signout"
    >
      Sign out
    </button>
  );
}
