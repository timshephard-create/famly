/**
 * Anthropic API pricing — USD per 1M tokens.
 * Verified against https://platform.claude.com/docs/en/about-claude/pricing
 * on 2026-06-18. Cache-read (hit) = 0.1x base input. Update here on any
 * pricing change (single source, like config/models.ts for model IDs).
 */
import { MODELS } from './models';

interface Rate {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
}

export const PRICING: Record<string, Rate> = {
  [MODELS.sonnet]: { inputPerM: 3.0, outputPerM: 15.0, cacheReadPerM: 0.3 },
  [MODELS.haiku]: { inputPerM: 1.0, outputPerM: 5.0, cacheReadPerM: 0.1 },
};

// Structurally compatible with the Anthropic SDK's Usage (which types several
// fields as number | null and carries extra fields we ignore).
export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Cost in USD for a single call. Per the Anthropic API, `input_tokens` is
 *  already the UNCACHED input count and `cache_read_input_tokens` is a
 *  separate, non-overlapping field — so they're charged additively (do NOT
 *  subtract). Unknown models cost 0 (logged but not charged) vs throwing. */
export function costUsd(model: string, usage: TokenUsage): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  const freshInput = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cost =
    (freshInput / 1_000_000) * rate.inputPerM +
    (cacheRead / 1_000_000) * rate.cacheReadPerM +
    (output / 1_000_000) * rate.outputPerM;
  // round to 6dp (matches numeric(10,6) column)
  return Math.round(cost * 1_000_000) / 1_000_000;
}
