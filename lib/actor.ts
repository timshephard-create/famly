import type { NextRequest } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import { hashIp } from '@/lib/support-guard';

export interface Actor {
  userId: string | null;
  ipHash: string | null;
  /** Stable key for rate-limiting: 'user:<id>' or 'ip:<hash>'. */
  key: string;
}

/**
 * Resolve who's making a tool request: the signed-in user if a session
 * exists, else a hashed IP. Used by both cost logging and rate limiting.
 * Best-effort — never throws (auth lookup failures fall back to IP).
 */
export async function getActor(request: NextRequest): Promise<Actor> {
  let userId: string | null = null;
  try {
    const user = await getUser();
    userId = user?.id ?? null;
  } catch {
    /* no session / lookup failed — fall back to IP */
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const ipHash = await hashIp(ip).catch(() => null);

  return {
    userId,
    ipHash,
    key: userId ? `user:${userId}` : `ip:${ipHash ?? 'unknown'}`,
  };
}
