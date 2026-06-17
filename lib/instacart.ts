/**
 * Instacart Developer Platform (IDP) — shopping list page integration.
 *
 * Verified against https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page
 * (2026-06-12):
 * - POST {base}/idp/v1/products/products_link, Bearer auth
 * - expires_in is in DAYS and has NO default for link_type=shopping_list —
 *   always send it explicitly
 * - line_items[].name required; quantity defaults 1.0; unit defaults "each";
 *   line_item_measurements: [{quantity, unit}]
 * - response: { products_link_url }
 * - no numeric rate limit published; handle 429/5xx as soft failures
 */

export interface NourishItem {
  item: string;
  quantity: string;
  estimatedCost?: string;
  category?: string;
}

export interface InstacartLineItem {
  name: string;
  quantity: number;
  unit: string;
  display_text?: string;
}

export interface MappedList {
  lineItems: InstacartLineItem[];
  /** Items whose name/quantity could not be parsed confidently. They are
   * still sent (name-only, qty 1 each) but surfaced for reporting rather
   * than silently guessed. */
  ambiguous: Array<{ item: string; reason: string }>;
}

/** Units IDP understands well enough to pass through. Anything else falls
 * back to "each" and is flagged. */
const KNOWN_UNITS = new Set([
  'each', 'lb', 'lbs', 'pound', 'pounds', 'oz', 'ounce', 'ounces',
  'g', 'gram', 'grams', 'kg', 'gallon', 'gallons', 'quart', 'quarts',
  'pint', 'pints', 'liter', 'liters', 'ml', 'cup', 'cups',
  'dozen', 'bunch', 'bunches', 'head', 'heads', 'bag', 'bags',
  'box', 'boxes', 'can', 'cans', 'jar', 'jars', 'pack', 'packs',
  'package', 'packages', 'loaf', 'loaves', 'bottle', 'bottles', 'count', 'ct',
]);

const normalizeUnit = (u: string): string => {
  const unit = u.trim().toLowerCase().replace(/\.$/, '');
  if (unit === 'pound' || unit === 'pounds' || unit === 'lbs') return 'lb';
  if (unit === 'ounces' || unit === 'ounce') return 'oz';
  return unit;
};

/**
 * Parse a Nourish shopping-list entry into an IDP line item.
 * Nourish items look like: item="Chicken thighs (3 lbs)", quantity="1 pack".
 * Strategy: a parenthetical measurement in the name wins (it's the actual
 * amount); otherwise parse the quantity string; otherwise 1 each + flag.
 */
export function mapItem(entry: NourishItem): {
  lineItem: InstacartLineItem;
  ambiguity?: string;
} {
  const raw = entry.item.trim();
  // Strip a trailing parenthetical, e.g. "Chicken thighs (3 lbs)"
  const parenMatch = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const name = (parenMatch ? parenMatch[1] : raw).trim();
  const candidates = [parenMatch?.[2], entry.quantity].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const m = candidate.trim().match(/^([\d.]+)\s*(.*)$/);
    if (!m) continue;
    const qty = parseFloat(m[1]);
    if (!isFinite(qty) || qty <= 0) continue;
    const unitRaw = m[2].trim() || 'each';
    const unit = normalizeUnit(unitRaw);
    if (unitRaw === '' || KNOWN_UNITS.has(unit)) {
      return {
        lineItem: { name, quantity: qty, unit, display_text: raw },
      };
    }
    // Number parsed but unit unknown ("3 fillets") — send qty with "each"
    return {
      lineItem: { name, quantity: qty, unit: 'each', display_text: raw },
      ambiguity: `unrecognized unit "${unitRaw}" — sent as ${qty} each`,
    };
  }

  return {
    lineItem: { name, quantity: 1, unit: 'each', display_text: raw },
    ambiguity: `no parseable quantity in "${raw}" / "${entry.quantity}" — sent as 1 each`,
  };
}

export function mapShoppingList(items: NourishItem[]): MappedList {
  const lineItems: InstacartLineItem[] = [];
  const ambiguous: MappedList['ambiguous'] = [];
  const seen = new Set<string>();

  for (const entry of items) {
    if (!entry.item?.trim()) continue;
    const { lineItem, ambiguity } = mapItem(entry);
    // IDP rejects duplicate items — dedupe by normalized name
    const dedupeKey = lineItem.name.toLowerCase();
    if (seen.has(dedupeKey)) {
      ambiguous.push({ item: entry.item, reason: 'duplicate name — skipped' });
      continue;
    }
    seen.add(dedupeKey);
    lineItems.push(lineItem);
    if (ambiguity) ambiguous.push({ item: entry.item, reason: ambiguity });
  }

  return { lineItems, ambiguous };
}

export function instacartEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_INSTACART_ENABLED === 'true' &&
    !!process.env.INSTACART_API_KEY
  );
}

export interface CreateLinkResult {
  ok: boolean;
  url?: string;
  status?: number;
  error?: string;
}

/** Create a shoppable list page. Never throws. */
export async function createShoppingListLink(
  title: string,
  lineItems: InstacartLineItem[],
): Promise<CreateLinkResult> {
  const apiKey = process.env.INSTACART_API_KEY;
  const base = process.env.INSTACART_API_BASE || 'https://connect.instacart.com';
  if (!apiKey) return { ok: false, error: 'missing api key' };

  try {
    const res = await fetch(`${base}/idp/v1/products/products_link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title,
        link_type: 'shopping_list',
        expires_in: 30, // days — REQUIRED in practice: no default for shopping_list
        line_items: lineItems,
        landing_page_configuration: {
          partner_linkback_url: 'https://www.kindora.world/nourish',
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[Instacart] create link failed:', res.status, text.slice(0, 300));
      return { ok: false, status: res.status, error: 'instacart api error' };
    }

    const data = (await res.json()) as { products_link_url?: string };
    if (!data.products_link_url) {
      return { ok: false, status: res.status, error: 'no link in response' };
    }
    // TODO(affiliate): products_link_url may carry aff_id/offer_id/
    // affiliate_platform params — enrollment wiring is out of scope for now.
    return { ok: true, url: data.products_link_url, status: res.status };
  } catch (err) {
    console.warn('[Instacart] create link threw:', err);
    return { ok: false, error: 'network error' };
  }
}
