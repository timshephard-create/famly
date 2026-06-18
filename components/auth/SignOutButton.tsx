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
      className="rounded-xl border border-sage px-5 py-2.5 text-sm font-semibold text-sage transition-colors hover:bg-sage-pale"
      data-testid="signout"
    >
      Sign out
    </button>
  );
}
