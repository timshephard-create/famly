import { getSupabaseServer } from '@/lib/supabase-server';
import { costUsd, type TokenUsage } from '@/config/pricing';

/**
 * Persist one Anthropic call's tokens + computed cost to usage_log AND
 * increment the month-to-date spend counter. Server-only (service-key client).
 *
 * NEVER throws into the caller — cost telemetry must not break or delay a
 * user response (same principle as "email failure must not fail ticket
 * creation"). Returns the new platform month-to-date total when known.
 */
export async function logUsage(args: {
  tool: string; // e.g. 'childcare' | 'health' | 'media' | 'meal' | 'support' | 'meal:validation'
  model: string;
  usage: TokenUsage | undefined | null;
  userId?: string | null;
  ipHash?: string | null;
}): Promise<{ monthToDateUsd: number | null }> {
  try {
    const supabase = getSupabaseServer();
    if (!supabase || !args.usage) return { monthToDateUsd: null };

    const cost = costUsd(args.model, args.usage);

    const insert = supabase.from('usage_log').insert({
      user_id: args.userId ?? null,
      ip_hash: args.ipHash ?? null,
      tool: args.tool,
      model: args.model,
      input_tokens: args.usage.input_tokens ?? 0,
      output_tokens: args.usage.output_tokens ?? 0,
      cache_read_tokens: args.usage.cache_read_input_tokens ?? 0,
      cost_usd: cost,
    });

    // Run the row insert and the atomic counter bump together; tolerate either.
    const [, spend] = await Promise.allSettled([
      insert,
      supabase.rpc('add_spend', { p_tool: args.tool, p_cost: cost }),
    ]);

    const monthToDateUsd =
      spend.status === 'fulfilled' && typeof spend.value.data === 'number'
        ? spend.value.data
        : null;
    return { monthToDateUsd };
  } catch (err) {
    console.warn('[usage-log] failed (non-blocking):', err);
    return { monthToDateUsd: null };
  }
}
