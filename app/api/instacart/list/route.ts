import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createShoppingListLink,
  instacartEnabled,
  mapShoppingList,
} from '@/lib/instacart';

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        item: z.string().min(1).max(200),
        quantity: z.string().max(60).default(''),
        estimatedCost: z.string().max(20).optional(),
        category: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(60),
});

/**
 * Creates an Instacart shoppable list from a Nourish grocery list.
 * HARD CONTRACT: this route never throws and Nourish never depends on it —
 * any failure (flag off, key missing, API down, rate-limited) returns a
 * structured non-200 and the plain-text list remains fully usable.
 */
export async function POST(req: NextRequest) {
  if (!instacartEnabled()) {
    return NextResponse.json({ error: 'instacart disabled', disabled: true }, { status: 503 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { lineItems, ambiguous } = mapShoppingList(body.items);
  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'no mappable items' }, { status: 400 });
  }

  const result = await createShoppingListLink('Kindora — Weekly Shopping List', lineItems);
  if (!result.ok || !result.url) {
    return NextResponse.json(
      { error: result.error || 'unavailable', status: result.status },
      { status: 503 },
    );
  }

  if (ambiguous.length > 0) {
    console.info('[Instacart] ambiguous mappings:', JSON.stringify(ambiguous));
  }

  return NextResponse.json({ url: result.url, ambiguous });
}
