import { describe, expect, it } from 'vitest';
import { scanPlanForAllergens } from '@/lib/allergens';
import type { NourishResponse, NourishShoppingItem } from '@/types';

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
