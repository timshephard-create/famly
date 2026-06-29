import { describe, expect, it, vi } from 'vitest';
import { saveLastResult, getLastResult } from '@/lib/tool-results';

function mockClient(opts: {
  user: { id: string } | null;
  row?: Record<string, unknown> | null;
  upsert?: (row: unknown, options: unknown) => void;
}) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
    upsert: async (row: unknown, options: unknown) => {
      opts.upsert?.(row, options);
      return { data: null, error: null };
    },
  };
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: () => query,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('tool-results recall', () => {
  it('upserts the latest result keyed on (user_id, tool)', async () => {
    const upsert = vi.fn();
    await saveLastResult(mockClient({ user: { id: 'u1' }, upsert }), 'meal', { weeklyTotal: '$120' });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, options] = upsert.mock.calls[0];
    expect(row).toEqual({ user_id: 'u1', tool: 'meal', payload: { weeklyTotal: '$120' } });
    expect(options).toEqual({ onConflict: 'user_id,tool' });
  });

  it('returns the saved payload', async () => {
    const client = mockClient({ user: { id: 'u1' }, row: { payload: { a: 1 } } });
    expect(await getLastResult(client, 'media')).toEqual({ a: 1 });
  });

  it('returns null when none saved', async () => {
    expect(await getLastResult(mockClient({ user: { id: 'u1' }, row: null }), 'health')).toBeNull();
  });

  it('no-ops / returns null when signed out', async () => {
    const upsert = vi.fn();
    await saveLastResult(mockClient({ user: null, upsert }), 'childcare', { x: 1 });
    expect(upsert).not.toHaveBeenCalled();
    expect(await getLastResult(mockClient({ user: null }), 'childcare')).toBeNull();
  });
});
