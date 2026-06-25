/**
 * Shared, client-safe user-facing copy. Lives here (not in spend-guard, which
 * imports the server-only Supabase admin client) so both server route handlers
 * and client components can import it without pulling server code into the
 * browser bundle.
 */

/** Shown when a request is rate-limited (HTTP 429). Calm, not alarming. */
export const HIGH_DEMAND_MESSAGE =
  "We're seeing high demand right now — please try again in a little while. Your info wasn't lost.";
