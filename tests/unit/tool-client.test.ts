import { describe, expect, it, vi, afterEach } from 'vitest';
import { postTool, RateLimitError } from '@/lib/tool-client';
import { HIGH_DEMAND_MESSAGE } from '@/lib/messages';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postTool', () => {
  it('unwraps the { data } envelope on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: { insight: 'hi' } }));
    await expect(postTool('/api/insight', {})).resolves.toEqual({ insight: 'hi' });
  });

  it('throws RateLimitError carrying the server message on 429', async () => {
    vi.stubGlobal('fetch', mockFetch(429, { error: 'slow down' }));
    const err = await postTool('/api/x', {}).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as Error).message).toBe('slow down');
  });

  it('falls back to HIGH_DEMAND_MESSAGE when a 429 body has no error field', async () => {
    // This is the exact regression: the Phase 4A 429 body is `{ error }`, not
    // `{ data }`. The old client read `data.data` (undefined) and showed "Oops".
    vi.stubGlobal('fetch', mockFetch(429, {}));
    const err = await postTool('/api/x', {}).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as Error).message).toBe(HIGH_DEMAND_MESSAGE);
  });

  it('throws a generic (non-rate-limit) Error on other failures', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { error: 'boom' }));
    const err = await postTool('/api/x', {}).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RateLimitError);
  });

  it('throws when a 200 response is missing the data field', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { notData: 1 }));
    await expect(postTool('/api/x', {})).rejects.toBeInstanceOf(Error);
  });
});
