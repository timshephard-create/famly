import type { NourishResponse } from '@/types';

/**
 * Deterministic allergen safety net for Nourish — a CODE layer on top of the
 * LLM validation check ("safety via determinism"). Scans the final plan for
 * declared allergens using token-boundary matching against a curated
 * derivatives list (NOT loose substring — avoids "butter lettuce" → milk).
 *
 * Bias: a missed allergen is far worse than a false flag, so the term list is
 * generous AND the warning surfaces the exact matched terms so a user can
 * judge a false positive at a glance.
 */

export type AllergenGroup =
  | 'milk' | 'egg' | 'peanut' | 'treenut' | 'wheat' | 'soy' | 'fish' | 'shellfish' | 'sesame';

/** The Big 9 → canonical + common derivative terms. Built in full now; only
 *  the groups the quiz captures today are wired below. */
export const BIG9: Record<AllergenGroup, string[]> = {
  milk: ['milk', 'butter', 'cheese', 'cream', 'whey', 'casein', 'ghee', 'yogurt', 'custard', 'buttermilk'],
  egg: ['egg', 'eggs', 'albumin', 'mayonnaise', 'mayo', 'meringue'],
  peanut: ['peanut', 'peanuts', 'groundnut', 'arachis', 'pb&j', 'pb &j'],
  treenut: ['almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'pine nut', 'brazil nut'],
  wheat: ['wheat', 'flour', 'semolina', 'gluten', 'bread', 'pasta', 'couscous', 'breadcrumb', 'tortilla', 'cracker'],
  soy: ['soy', 'soya', 'edamame', 'tofu', 'miso', 'tempeh', 'soybean'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'sardine', 'haddock'],
  shellfish: ['shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'crustacean', 'scallop', 'clam', 'mussel', 'oyster'],
  sesame: ['sesame', 'tahini'],
};

/**
 * Quiz dietary option values → canonical Big-9 groups. THE single source map
 * for both the deterministic safety scan (scanPlanForAllergens) and family-
 * profile storage; the edge mappers below are built generically off it, so
 * adding a group is a one-line entry with no per-group special-casing.
 * 'nut-allergy' is the one combined option (peanut + treenut); the other seven
 * groups are 1:1. All nine groups are wired (Phase 5, Item 4).
 */
const DIETARY_TO_GROUPS: Record<string, AllergenGroup[]> = {
  'nut-allergy': ['peanut', 'treenut'],
  'dairy-free': ['milk'],
  'gluten-free': ['wheat'],
  egg: ['egg'],
  soy: ['soy'],
  fish: ['fish'],
  shellfish: ['shellfish'],
  sesame: ['sesame'],
};

/**
 * Edge mappers between Nourish's quiz option values and the canonical Big-9
 * groups stored on the family profile. Built off DIETARY_TO_GROUPS so Item 4
 * (full nine-group quiz) extends them by adding map entries only — no logic
 * change here, and scanPlanForAllergens stays untouched.
 */

/** Quiz dietary option values → canonical groups (deduped). */
export function dietaryValuesToGroups(values: string[]): AllergenGroup[] {
  const set = new Set<AllergenGroup>();
  for (const v of values) {
    for (const g of DIETARY_TO_GROUPS[v] ?? []) set.add(g);
  }
  return Array.from(set);
}

/**
 * Canonical groups → quiz dietary option values, for pre-fill DISPLAY only.
 * A value is emitted when ANY of its mapped groups is present, so a stored
 * profile is always shown faithfully — including the (normally unreachable)
 * partial nut case: peanut OR treenut alone still shows 'nut-allergy' selected,
 * so an allergen is never hidden from the user.
 *
 * Display-only — this never mutates the store. The Nourish quiz is the sole
 * writer of profile allergens and only ever writes the nut pair together
 * (nut-allergy -> [peanut, treenut]), so a partial cannot arise in normal use.
 * We therefore preserve the stored shape exactly (no widen-healing): the save
 * direction just reflects the user's current selection, which is idempotent for
 * every reachable state.
 *
 * INVARIANT: the "any present" rule is correct ONLY because 'nut-allergy' is
 * currently the SOLE multi-group dietary value (every other option maps 1:1,
 * where any-present and all-present are identical). If you add another combined
 * option (more than one group), revisit this collapse logic — "any present"
 * would then emit that option whenever a single one of its groups is stored,
 * which may not be the intended display.
 */
export function groupsToDietaryValues(groups: AllergenGroup[]): string[] {
  const have = new Set<AllergenGroup>(groups);
  const out: string[] = [];
  for (const [value, gs] of Object.entries(DIETARY_TO_GROUPS)) {
    if (gs.some((g) => have.has(g))) out.push(value);
  }
  return out;
}

export interface AllergenWarning {
  allergen: AllergenGroup;
  matchedTerms: string[];
  affectedItems: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match `term` as a whole word/token in `text` (case-insensitive). */
function tokenMatch(term: string, text: string): boolean {
  return new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(text);
}

/** Collect every (label, text) pair from a plan that should be scanned. */
function planTexts(plan: NourishResponse): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  for (const day of plan.weeklyPlan ?? []) {
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      const m = day[meal];
      if (!m) continue;
      out.push({ label: `${day.day} ${meal} (${m.name})`, text: m.name });
      if (meal === 'dinner' && Array.isArray((m as { steps?: string[] }).steps)) {
        for (const step of (m as { steps?: string[] }).steps ?? []) {
          out.push({ label: `${day.day} dinner steps`, text: step });
        }
      }
    }
  }
  for (const item of plan.shoppingList ?? []) {
    out.push({ label: `Shopping: ${item.item}`, text: item.item });
  }
  return out;
}

/**
 * Scan a generated plan for any declared allergen. Returns one warning per
 * triggered group, with the exact matched terms and the affected item labels.
 */
export function scanPlanForAllergens(
  plan: NourishResponse,
  declaredDietary: string[],
): AllergenWarning[] {
  const groups = new Set<AllergenGroup>();
  for (const d of declaredDietary) {
    for (const g of DIETARY_TO_GROUPS[d] ?? []) groups.add(g);
  }
  if (groups.size === 0) return [];

  const texts = planTexts(plan);
  const warnings: AllergenWarning[] = [];

  for (const group of Array.from(groups)) {
    const matchedTerms = new Set<string>();
    const affectedItems = new Set<string>();
    for (const term of BIG9[group]) {
      for (const { label, text } of texts) {
        if (tokenMatch(term, text)) {
          matchedTerms.add(term);
          affectedItems.add(label);
        }
      }
    }
    if (matchedTerms.size > 0) {
      warnings.push({
        allergen: group,
        matchedTerms: Array.from(matchedTerms),
        affectedItems: Array.from(affectedItems),
      });
    }
  }
  return warnings;
}
