import { getSupabaseServer } from '@/lib/supabase-server';

/**
 * §4 platform protection: a monthly spend ceiling + per-tool sub-cap, and
 * durable per-actor rate limits. All env-tunable. Reads are cheap counter
 * lookups (never SUM the log). Both checks FAIL OPEN — a telemetry/DB hiccup
 * must never take the tools down.
 */

export const MONTHLY_SPEND_CEILING_USD = Number(process.env.MONTHLY_SPEND_CEILING_USD || 200);
const PER_TOOL_FRACTION = Number(process.env.PER_TOOL_CEILING_FRACTION || 0.5);
const RATE_PER_DAY = Number(process.env.TOOL_RATE_PER_DAY || 20);
const RATE_PER_HOUR = Number(process.env.TOOL_RATE_PER_HOUR || 10);

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** True when we should still call the (paid) model. Fails open on error. */
export async function checkSpendCeiling(
  tool: string,
): Promise<{ allowed: boolean; reason?: 'platform' | 'tool' }> {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return { allowed: true };
    const month = monthKey();

    const [platform, perTool] = await Promise.all([
      supabase.from('spend_counter').select('spent_usd').eq('month', month).maybeSingle(),
      supabase
        .from('tool_spend_counter')
        .select('spent_usd')
        .eq('month', month)
        .eq('tool', tool)
        .maybeSingle(),
    ]);

    const platformSpent = Number(platform.data?.spent_usd ?? 0);
    if (platformSpent >= MONTHLY_SPEND_CEILING_USD) return { allowed: false, reason: 'platform' };

    const toolSpent = Number(perTool.data?.spent_usd ?? 0);
    if (toolSpent >= MONTHLY_SPEND_CEILING_USD * PER_TOOL_FRACTION) {
      return { allowed: false, reason: 'tool' };
    }
    return { allowed: true };
  } catch (err) {
    console.warn('[spend-guard] ceiling check failed — failing open:', err);
    return { allowed: true };
  }
}

/** Durable per-actor rate limit (day + hour windows). Fails open on error. */
export async function checkRateLimit(
  actorKey: string,
): Promise<{ allowed: boolean; reason?: 'day' | 'hour' }> {
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return { allowed: true };
    const now = new Date();
    const dayKey = `day:${now.toISOString().slice(0, 10)}`;
    const hourKey = `hour:${now.toISOString().slice(0, 13)}`;

    const [day, hour] = await Promise.all([
      supabase.rpc('increment_rate', { p_actor: actorKey, p_window: dayKey }),
      supabase.rpc('increment_rate', { p_actor: actorKey, p_window: hourKey }),
    ]);

    if (typeof hour.data === 'number' && hour.data > RATE_PER_HOUR) {
      return { allowed: false, reason: 'hour' };
    }
    if (typeof day.data === 'number' && day.data > RATE_PER_DAY) {
      return { allowed: false, reason: 'day' };
    }
    return { allowed: true };
  } catch (err) {
    console.warn('[spend-guard] rate check failed — failing open:', err);
    return { allowed: true };
  }
}

// Re-exported from the client-safe module so the API routes can keep importing
// it from here while client components import it without server code leaking in.
export { HIGH_DEMAND_MESSAGE } from './messages';
