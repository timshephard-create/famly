import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShoppingListLink, mapItem, mapShoppingList } from '@/lib/instacart';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('mapItem', () => {
  it('parses a parenthetical measurement from the item name', () => {
    const { lineItem, ambiguity } = mapItem({ item: 'Chicken thighs (3 lbs)', quantity: '1 pack' });
    expect(lineItem).toMatchObject({ name: 'Chicken thighs', quantity: 3, unit: 'lb' });
    expect(lineItem.display_text).toBe('Chicken thighs (3 lbs)');
    expect(ambiguity).toBeUndefined();
  });

  it('falls back to the quantity string when no parenthetical', () => {
    const { lineItem, ambiguity } = mapItem({ item: 'Bananas', quantity: '6' });
    expect(lineItem).toMatchObject({ name: 'Bananas', quantity: 6, unit: 'each' });
    expect(ambiguity).toBeUndefined();
  });

  it('normalizes common units', () => {
    expect(mapItem({ item: 'Milk (1 gallon)', quantity: '' }).lineItem.unit).toBe('gallon');
    expect(mapItem({ item: 'Cheese (8 oz)', quantity: '' }).lineItem.unit).toBe('oz');
    expect(mapItem({ item: 'Rice', quantity: '2 bags' }).lineItem).toMatchObject({
      quantity: 2,
      unit: 'bags',
    });
  });

  it('flags unknown units instead of silently guessing', () => {
    const { lineItem, ambiguity } = mapItem({ item: 'Salmon', quantity: '3 fillets' });
    expect(lineItem).toMatchObject({ quantity: 3, unit: 'each' });
    expect(ambiguity).toContain('fillets');
  });

  it('flags unparseable quantities and defaults to 1 each', () => {
    const { lineItem, ambiguity } = mapItem({ item: 'Fresh basil', quantity: 'a few sprigs' });
    expect(lineItem).toMatchObject({ name: 'Fresh basil', quantity: 1, unit: 'each' });
    expect(ambiguity).toContain('no parseable quantity');
  });
});

describe('mapShoppingList', () => {
  it('dedupes by name (IDP rejects duplicates) and flags the dupes', () => {
    const { lineItems, ambiguous } = mapShoppingList([
      { item: 'Eggs (1 dozen)', quantity: '1' },
      { item: 'Eggs', quantity: '12' },
      { item: 'Butter', quantity: '1' },
    ]);
    expect(lineItems.map((l) => l.name)).toEqual(['Eggs', 'Butter']);
    expect(ambiguous.some((a) => a.reason.includes('duplicate'))).toBe(true);
  });
});

describe('createShoppingListLink (graceful degradation, never throws)', () => {
  it('returns ok:false when key is missing', async () => {
    vi.stubEnv('INSTACART_API_KEY', '');
    const result = await createShoppingListLink('t', [{ name: 'x', quantity: 1, unit: 'each' }]);
    expect(result.ok).toBe(false);
  });

  it('returns the link on success and sends expires_in explicitly', async () => {
    vi.stubEnv('INSTACART_API_KEY', 'keys.test');
    vi.stubEnv('INSTACART_API_BASE', 'https://example.test');
    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ products_link_url: 'https://example.test/list/1' }), {
          status: 200,
        });
      }),
    );
    const result = await createShoppingListLink('Weekly', [
      { name: 'Milk', quantity: 1, unit: 'gallon' },
    ]);
    expect(result).toMatchObject({ ok: true, url: 'https://example.test/list/1' });
    // No default exists for shopping_list links — must always be explicit
    expect(sentBody.expires_in).toBe(30);
    expect(sentBody.link_type).toBe('shopping_list');
  });

  it('soft-fails on API errors (429/5xx) without throwing', async () => {
    vi.stubEnv('INSTACART_API_KEY', 'keys.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"slow down","code":2003}}', { status: 429 })),
    );
    const result = await createShoppingListLink('t', [{ name: 'x', quantity: 1, unit: 'each' }]);
    expect(result).toMatchObject({ ok: false, status: 429 });
  });

  it('soft-fails on network errors', async () => {
    vi.stubEnv('INSTACART_API_KEY', 'keys.test');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const result = await createShoppingListLink('t', [{ name: 'x', quantity: 1, unit: 'each' }]);
    expect(result).toMatchObject({ ok: false, error: 'network error' });
  });
});
