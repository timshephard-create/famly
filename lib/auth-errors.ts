/**
 * Map raw Supabase auth error messages to friendly, non-leaky copy. Falls back
 * to a generic message for anything unrecognized (never surfaces a raw stack or
 * enumeration hint). Phase 5, Item 2.
 */
export function authErrorMessage(raw: string | undefined | null): string {
  const m = (raw || '').toLowerCase();
  if (!m) return 'Something went wrong — please try again.';

  if (m.includes('invalid login credentials')) {
    return "That email or password doesn't match. Try again, or reset your password.";
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) {
    return 'You already have an account — try signing in instead.';
  }
  if (m.includes('password should be at least') || m.includes('password is too short')) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('email rate')) {
    return 'Too many attempts — please wait a minute and try again.';
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  return 'Something went wrong — please try again.';
}
