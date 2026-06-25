import { HIGH_DEMAND_MESSAGE } from './messages';

/**
 * Shared client-side fetch for the AI tool endpoints (Sprout/HealthGuide insight,
 * BrightWatch, Nourish). All of them return `{ data }` on success and
 * `{ error }` with HTTP 429 when rate-limited.
 *
 * The bug this fixes: each tool used to do `const data = await res.json()` then
 * read `data.data` with no status check. On a 429 the body is `{ error }` (no
 * `.data`), so `data.data` was `undefined` and the tool fell into its generic
 * "Oops" error path instead of showing the calm high-demand copy. Centralizing
 * the read here means one place understands the 429 contract.
 */

/** Thrown on HTTP 429 so callers can show the calm "high demand" copy. */
export class RateLimitError extends Error {
  constructor(message: string = HIGH_DEMAND_MESSAGE) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * POST JSON to a tool endpoint and return the unwrapped `data` payload.
 * Throws {@link RateLimitError} on 429 (message from the server, falling back to
 * {@link HIGH_DEMAND_MESSAGE}), and a plain Error on any other failure.
 */
export async function postTool<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Tolerate a non-JSON / empty body rather than throwing a parse error.
  let json: { data?: T; error?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (res.status === 429) {
    throw new RateLimitError(json?.error || HIGH_DEMAND_MESSAGE);
  }
  if (!res.ok || json == null || json.data === undefined) {
    throw new Error(json?.error || 'request_failed');
  }
  return json.data;
}
