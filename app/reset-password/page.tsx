import type { Metadata } from 'next';
import AuthShell from '@/components/auth/AuthShell';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } };

// Reached from the recovery email link (after /auth/callback exchanges the code
// and a recovery session is set); never statically cache.
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
