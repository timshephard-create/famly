import { describe, expect, it } from 'vitest';
import {
  scanPlanForAllergens,
  dietaryValuesToGroups,
  groupsToDietaryValues,
  type AllergenGroup,
} from '@/lib/allergens';
import type { NourishResponse, NourishShoppingItem } from '@/types';

const sorted = (a: string[]) => [...a].sort();

describe('allergen canonical edge-mappers — all nine groups (Item 4)', () => {
  // The canonical Big-9 and the quiz allergen options that cover them
  // (nut-allergy is the one combined option → peanut + treenut).
  const ALL_GROUPS: AllergenGroup[] =
    ['milk', 'egg', 'peanut', 'treenut', 'wheat', 'soy', 'fish', 'shellfish', 'sesame'];
  const ALL_OPTIONS =
    ['dairy-free', 'egg', 'nut-allergy', 'gluten-free', 'soy', 'fish', 'shellfish', 'sesame'];

  it('maps every quiz allergen option to its canonical group(s)', () => {
    expect(sorted(dietaryValuesToGroups(['nut-allergy']))).toEqual(['peanut', 'treenut']);
    expect(dietaryValuesToGroups(['dairy-free'])).toEqual(['milk']);
    expect(dietaryValuesToGroups(['gluten-free'])).toEqual(['wheat']);
    expect(dietaryValuesToGroups(['egg'])).toEqual(['egg']);
    expect(dietaryValuesToGroups(['soy'])).toEqual(['soy']);
    expect(dietaryValuesToGroups(['fish'])).toEqual(['fish']);
    expect(dietaryValuesToGroups(['shellfish'])).toEqual(['shellfish']);
    expect(dietaryValuesToGroups(['sesame'])).toEqual(['sesame']);
    // Non-allergen dietary prefs contribute no groups.
    expect(dietaryValuesToGroups(['vegan', 'none', 'halal'])).toEqual([]);
  });

  it('round-trips all nine groups: options → groups → options', () => {
    expect(sorted(groupsToDietaryValues(dietaryValuesToGroups(ALL_OPTIONS)))).toEqual(sorted(ALL_OPTIONS));
  });

  it('round-trips all nine groups: groups → options → groups', () => {
    expect(sorted(dietaryValuesToGroups(groupsToDietaryValues(ALL_GROUPS)))).toEqual(sorted(ALL_GROUPS));
  });

  it('nut expand: selecting nut-allergy stores BOTH peanut and treenut', () => {
    expect(sorted(dietaryValuesToGroups(['nut-allergy']))).toEqual(['peanut', 'treenut']);
  });

  it('nut collapse: a stored peanut + treenut pair shows nut-allergy', () => {
    expect(groupsToDietaryValues(['peanut', 'treenut'])).toEqual(['nut-allergy']);
  });

  // Partial-nut decision (Item 4): the Nourish quiz is the SOLE writer of profile
  // allergens and only ever writes the nut pair together, so a peanut-XOR-treenut
  // store is unreachable in normal use. For DISPLAY we collapse a partial to
  // 'nut-allergy' so the allergen is never hidden from the user; we do NOT
  // widen-heal the store (preserve-exact — the save just reflects the user's
  // current selection, which is idempotent for every reachable state).
  it('partial nut store collapses to nut-allergy for display (never hidden)', () => {
    expect(groupsToDietaryValues(['peanut'])).toEqual(['nut-allergy']);
    expect(groupsToDietaryValues(['treenut'])).toEqual(['nut-allergy']);
  });

  it('a partial mixed store still surfaces every allergen', () => {
    expect(sorted(groupsToDietaryValues(['peanut', 'milk', 'sesame']))).toEqual(
      ['dairy-free', 'nut-allergy', 'sesame'],
    );
  });
});

const meal = (name: string, steps?: string[]) => ({ name, prepTime: '10 min', cost: '$2', steps });

function plan(opts: {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  dinnerSteps?: string[];
  shopping?: string[];
}): NourishResponse {
  return {
    weeklyPlan: [
      {
        day: 'Monday',
        breakfast: meal(opts.breakfast ?? 'Oatmeal'),
        lunch: meal(opts.lunch ?? 'Salad'),
        dinner: meal(opts.dinner ?? 'Rice bowl', opts.dinnerSteps),
      },
    ],
    shoppingList: (opts.shopping ?? []).map(
      (item): NourishShoppingItem => ({ item, quantity: '1', estimatedCost: '$1', category: 'Pantry' }),
    ),
    weeklyTotal: '$100',
    savingsTips: [],
    insight: '',
  };
}

describe('scanPlanForAllergens', () => {
  it('flags peanut for a nut-allergy family (PB&J + peanut)', () => {
    const w = scanPlanForAllergens(
      plan({ lunch: 'PB&J with carrots', shopping: ['Peanut butter'] }),
      ['nut-allergy'],
    );
    const peanut = w.find((x) => x.allergen === 'peanut');
    expect(peanut).toBeDefined();
    expect(peanut!.matchedTerms).toEqual(expect.arrayContaining(['peanut']));
    expect(peanut!.affectedItems.length).toBeGreaterThan(0);
  });

  it('flags tree nuts too for nut-allergy (almond)', () => {
    const w = scanPlanForAllergens(plan({ breakfast: 'Almond butter toast' }), ['nut-allergy']);
    expect(w.some((x) => x.allergen === 'treenut' && x.matchedTerms.includes('almond'))).toBe(true);
  });

  it('synonym/derivative proof: dairy-free flags a cheese/butter recipe as milk', () => {
    const w = scanPlanForAllergens(
      plan({ dinner: 'Mac and cheese', shopping: ['Butter', 'Shredded cheddar cheese'] }),
      ['dairy-free'],
    );
    const milk = w.find((x) => x.allergen === 'milk');
    expect(milk).toBeDefined();
    expect(milk!.matchedTerms).toEqual(expect.arrayContaining(['cheese', 'butter']));
  });

  it('gluten-free flags wheat derivatives (bread/pasta/flour)', () => {
    const w = scanPlanForAllergens(
      plan({ lunch: 'Pasta salad', shopping: ['Whole wheat bread', 'All-purpose flour'] }),
      ['gluten-free'],
    );
    const wheat = w.find((x) => x.allergen === 'wheat');
    expect(wheat).toBeDefined();
    expect(wheat!.matchedTerms).toEqual(expect.arrayContaining(['wheat', 'bread', 'pasta', 'flour']));
  });

  it('clean plan with a declared allergen produces NO warning', () => {
    const w = scanPlanForAllergens(
      plan({ breakfast: 'Fruit salad', lunch: 'Grilled chicken', dinner: 'Beef stir-fry with rice' }),
      ['dairy-free', 'gluten-free', 'nut-allergy'],
    );
    expect(w).toHaveLength(0);
  });

  it('no declared allergens → never scans', () => {
    expect(scanPlanForAllergens(plan({ lunch: 'PB&J' }), [])).toHaveLength(0);
    expect(scanPlanForAllergens(plan({ lunch: 'PB&J' }), ['none', 'vegetarian'])).toHaveLength(0);
  });

  it('token-boundary: "wheatgrass" does NOT false-match wheat; "wheat bread" does', () => {
    const clean = scanPlanForAllergens(plan({ breakfast: 'Wheatgrass smoothie' }), ['gluten-free']);
    expect(clean).toHaveLength(0); // substring match would wrongly flag this
    const dirty = scanPlanForAllergens(plan({ breakfast: 'Wheat toast' }), ['gluten-free']);
    expect(dirty.some((x) => x.allergen === 'wheat')).toBe(true);
  });

  it('matches inside dinner steps, not just names', () => {
    const w = scanPlanForAllergens(
      plan({ dinner: 'Veggie bowl', dinnerSteps: ['Top with a sprinkle of parmesan cheese.'] }),
      ['dairy-free'],
    );
    expect(w.some((x) => x.allergen === 'milk' && x.matchedTerms.includes('cheese'))).toBe(true);
  });
});
