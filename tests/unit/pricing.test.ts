import { describe, expect, it } from 'vitest';
import { costUsd } from '@/config/pricing';
import { MODELS } from '@/config/models';

describe('costUsd', () => {
  it('Sonnet: $3/M in + $15/M out', () => {
    // 1,000,000 in + 1,000,000 out = $3 + $15 = $18
    expect(costUsd(MODELS.sonnet, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(18, 6);
    // realistic Nourish-ish call: 1k in, 3k out
    expect(costUsd(MODELS.sonnet, { input_tokens: 1000, output_tokens: 3000 })).toBeCloseTo(0.048, 6);
  });

  it('Haiku: $1/M in + $5/M out', () => {
    expect(costUsd(MODELS.haiku, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(6, 6);
  });

  it('cache reads are additive at the 0.1x rate (not subtracted from input)', () => {
    // input_tokens is already the UNCACHED count; cache reads bill separately.
    const c = costUsd(MODELS.sonnet, {
      input_tokens: 1000, // fresh
      cache_read_input_tokens: 10_000, // billed at $0.30/M
      output_tokens: 0,
    });
    // 1000*3/1e6 + 10000*0.3/1e6 = 0.003 + 0.003 = 0.006
    expect(c).toBeCloseTo(0.006, 6);
  });

  it('null/undefined token fields and unknown models are safe (0)', () => {
    expect(costUsd(MODELS.sonnet, { input_tokens: null, output_tokens: null })).toBe(0);
    expect(costUsd('some-unknown-model', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(0);
  });
});
