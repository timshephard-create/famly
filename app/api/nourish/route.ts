import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { nourishInputSchema } from '@/lib/validations';
import { validateRecommendation } from '@/lib/validate-ai-output';
import { MODELS } from '@/config/models';
import { getActor } from '@/lib/actor';
import { logUsage } from '@/lib/usage-log';
import { checkRateLimit, checkSpendCeiling, HIGH_DEMAND_MESSAGE } from '@/lib/spend-guard';
import { scanPlanForAllergens } from '@/lib/allergens';
import type { NourishResponse } from '@/types';
import { z } from 'zod';

/** Deterministic allergen safety net: attach warnings to ANY plan we return
 *  (including fallbacks, which contain milk/PB&J/wheat) before it reaches the
 *  user. Runs on top of the existing LLM validation check. */
function withAllergens(plan: NourishResponse, dietary: string[]): NourishResponse {
  const allergenWarnings = scanPlanForAllergens(plan, dietary);
  return allergenWarnings.length > 0 ? { ...plan, allergenWarnings } : plan;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const extendedSchema = nourishInputSchema.extend({
  nearbyStores: z.array(z.string()).optional(),
});

function buildFallback(): NourishResponse {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const meals = [
    { breakfast: { name: 'Oatmeal with banana', prepTime: '10 min', cost: '$1.20/serving' }, lunch: { name: 'Turkey & cheese wraps', prepTime: '10 min', cost: '$2.50/serving' }, dinner: { name: 'One-pot chicken & rice', prepTime: '35 min', cost: '$3.00/serving' } },
    { breakfast: { name: 'Scrambled eggs & toast', prepTime: '10 min', cost: '$1.50/serving' }, lunch: { name: 'PB&J with carrots', prepTime: '5 min', cost: '$1.80/serving' }, dinner: { name: 'Beef tacos with beans', prepTime: '25 min', cost: '$3.25/serving' } },
    { breakfast: { name: 'Yogurt parfait', prepTime: '5 min', cost: '$1.60/serving' }, lunch: { name: 'Chicken quesadillas', prepTime: '15 min', cost: '$2.20/serving' }, dinner: { name: 'Pasta with meat sauce', prepTime: '30 min', cost: '$2.75/serving' } },
    { breakfast: { name: 'Banana pancakes', prepTime: '15 min', cost: '$1.30/serving' }, lunch: { name: 'Veggie soup & bread', prepTime: '15 min', cost: '$2.00/serving' }, dinner: { name: 'Baked chicken thighs & roasted veggies', prepTime: '40 min', cost: '$3.50/serving' } },
    { breakfast: { name: 'Cereal with milk & fruit', prepTime: '5 min', cost: '$1.40/serving' }, lunch: { name: 'Ham & cheese sandwich', prepTime: '10 min', cost: '$2.30/serving' }, dinner: { name: 'Stir-fry with rice', prepTime: '25 min', cost: '$3.00/serving' } },
    { breakfast: { name: 'French toast', prepTime: '15 min', cost: '$1.25/serving' }, lunch: { name: 'Leftover stir-fry bowls', prepTime: '5 min', cost: '$1.50/serving' }, dinner: { name: 'Homemade pizza', prepTime: '45 min', cost: '$2.80/serving' } },
    { breakfast: { name: 'Breakfast burritos', prepTime: '15 min', cost: '$1.75/serving' }, lunch: { name: 'Grilled cheese & tomato soup', prepTime: '15 min', cost: '$2.10/serving' }, dinner: { name: 'Slow cooker chili', prepTime: '20 min', cost: '$2.50/serving' } },
  ];

  return {
    weeklyPlan: days.map((day, i) => ({ day, ...meals[i] })),
    shoppingList: [
      { item: 'Chicken thighs (3 lbs)', quantity: '1 pack', estimatedCost: '$7.50', category: 'Protein' },
      { item: 'Ground beef (2 lbs)', quantity: '1 pack', estimatedCost: '$9.00', category: 'Protein' },
      { item: 'Eggs (dozen)', quantity: '1', estimatedCost: '$3.50', category: 'Protein' },
      { item: 'Bananas', quantity: '1 bunch', estimatedCost: '$1.50', category: 'Produce' },
      { item: 'Carrots (2 lbs)', quantity: '1 bag', estimatedCost: '$2.00', category: 'Produce' },
      { item: 'Onions (3 lbs)', quantity: '1 bag', estimatedCost: '$2.50', category: 'Produce' },
      { item: 'Tomatoes', quantity: '4', estimatedCost: '$3.00', category: 'Produce' },
      { item: 'Milk (gallon)', quantity: '1', estimatedCost: '$4.00', category: 'Dairy' },
      { item: 'Shredded cheese', quantity: '1 bag', estimatedCost: '$3.50', category: 'Dairy' },
      { item: 'Yogurt (32 oz)', quantity: '1', estimatedCost: '$4.00', category: 'Dairy' },
      { item: 'Rice (5 lbs)', quantity: '1 bag', estimatedCost: '$4.50', category: 'Pantry' },
      { item: 'Pasta (1 lb)', quantity: '2 boxes', estimatedCost: '$3.00', category: 'Pantry' },
      { item: 'Canned beans', quantity: '4 cans', estimatedCost: '$4.00', category: 'Pantry' },
      { item: 'Bread', quantity: '2 loaves', estimatedCost: '$5.00', category: 'Pantry' },
      { item: 'Tortillas', quantity: '1 pack', estimatedCost: '$3.00', category: 'Pantry' },
      { item: 'Frozen mixed vegetables', quantity: '2 bags', estimatedCost: '$5.00', category: 'Frozen' },
    ],
    weeklyTotal: '$148.50',
    savingsTips: [
      'Buy chicken thighs instead of breasts \u2014 they\'re 30\u201340% cheaper and more flavorful.',
      'Stock up on rice, beans, and pasta when they\'re on sale. They last months and form the base of dozens of meals.',
      'Plan one "leftover night" per week to cut waste. Sunday\'s chili becomes Monday\'s lunch.',
    ],
    insight: 'For a family of 4 on a $150/week budget, you have plenty of room for balanced, tasty meals. The key is building around affordable proteins like chicken thighs and eggs, and leaning on pantry staples like rice and beans to stretch every dollar.',
    storeStrategy: [
      { category: 'Produce', bestStore: 'Aldi', reason: 'Typically 15\u201320% cheaper than major chains', estimatedSavings: '$3\u20135' },
      { category: 'Protein', bestStore: 'Walmart', reason: 'Consistently low prices on chicken and ground beef', estimatedSavings: '$2\u20134' },
      { category: 'Dairy', bestStore: 'Aldi', reason: 'Store-brand dairy at significant discount', estimatedSavings: '$2\u20133' },
      { category: 'Pantry', bestStore: 'Walmart', reason: 'Great Value brand staples are hard to beat', estimatedSavings: '$3\u20135' },
      { category: 'Frozen', bestStore: 'Aldi', reason: 'Frozen vegetables often under $1.50/bag', estimatedSavings: '$1\u20132' },
    ],
    splitShoppingPlan: 'Start at Aldi for produce, dairy, and frozen items \u2014 you\'ll save $8\u201310 compared to a single-store trip. Then hit Walmart for proteins and pantry staples where Great Value prices are hard to beat. Skip Whole Foods and Trader Joe\'s for this budget \u2014 they\'re great for specialty items but not for stretching $150 across a full week.',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = extendedSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { householdSize, budget, dietary, cookingTime, zip, nearbyStores } = parsed.data;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ data: withAllergens(buildFallback(), dietary) });
    }

    // §4 protection: rate limit + spend ceiling before the paid call.
    const actor = await getActor(request);
    const rate = await checkRateLimit(actor.key);
    if (!rate.allowed) {
      return NextResponse.json({ error: HIGH_DEMAND_MESSAGE }, { status: 429 });
    }
    const ceiling = await checkSpendCeiling('meal');
    if (!ceiling.allowed) {
      return NextResponse.json({ data: withAllergens({ ...buildFallback(), degraded: true }, dietary) });
    }

    const dietaryStr = dietary.length === 0 || dietary.includes('none')
      ? 'no dietary restrictions'
      : dietary.join(', ');

    const cookingLabels: Record<string, string> = {
      minimal: '15-20 minutes max per meal',
      moderate: 'up to 45 minutes per meal',
      flexible: 'happy to cook longer on weekends',
      batch: 'prefers batch cooking / meal prep once per week',
    };

    const storeList = nearbyStores && nearbyStores.length > 0
      ? nearbyStores.join(', ')
      : 'Walmart, Amazon Fresh';

    const storeInstruction = nearbyStores && nearbyStores.length > 0
      ? `Nearby stores for this family: ${storeList}. Only recommend from these stores in storeStrategy and splitShoppingPlan.`
      : `No nearby stores were found (likely a rural area). Default to recommending Walmart as the primary store and Amazon Fresh for non-perishables.`;

    const prompt = `You are a family meal planning expert and budget grocery optimizer. Create a realistic 7-day meal plan for this family.

Profile:
- Household size: ${householdSize}
- Weekly grocery budget: $${budget}
- Dietary restrictions: ${dietaryStr}
- Cooking time: ${cookingLabels[cookingTime] || cookingTime}
- Location ZIP: ${zip}

${storeInstruction}

Return ONLY valid JSON (no markdown, no code fences) in this exact structure:
{
  "weeklyPlan": [
    {
      "day": "Monday",
      "breakfast": { "name": "string", "prepTime": "X min", "cost": "$X.XX/serving" },
      "lunch": { "name": "string", "prepTime": "X min", "cost": "$X.XX/serving" },
      "dinner": { "name": "string", "prepTime": "X min", "cost": "$X.XX/serving", "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."], "tip": "One quick cooking tip" }
    }
  ],
  "shoppingList": [
    { "item": "string", "quantity": "string", "estimatedCost": "$X.XX", "category": "Produce|Protein|Dairy|Pantry|Frozen" }
  ],
  "weeklyTotal": "$X.XX",
  "savingsTips": ["tip1", "tip2", "tip3"],
  "insight": "2-3 sentence personalized summary about this family's meal plan and budget",
  "storeStrategy": [
    { "category": "Produce", "bestStore": "store name", "reason": "brief reason", "estimatedSavings": "$X-Y" }
  ],
  "splitShoppingPlan": "2-3 sentence specific tip on how to split this shopping list across their actual nearby stores for maximum savings. Name the specific stores. Be concrete and actionable."
}

Requirements:
- All 7 days (Monday through Sunday)
- Respect ALL dietary restrictions strictly
- Per-serving costs should be realistic for 2026 US grocery prices
- Weekly total must be at or under the $${budget} budget
- Shopping list grouped by category
- Prep times must respect their cooking time preference
- Include 15-20 shopping list items covering all meals
- Meals should be family-friendly and practical, not gourmet
- 3 specific, actionable savings tips
- Dinner steps: 3-5 clear, concise steps per dinner. Plain English. No ingredient amounts in steps (those are in the shopping list). Each step one sentence. Include one cooking tip per dinner.
- Breakfast and lunch: no steps needed, keep simple
- storeStrategy: one entry per shopping list category, only recommend from nearby stores
- splitShoppingPlan: specific, actionable, names the actual nearby stores`;

    const message = await anthropic.messages.create({
      model: MODELS.sonnet,
      // A full 7-day plan (dinner steps + tips, 15-20 shopping items, store
      // strategy) runs ~4.5-6k output tokens. 3500 truncated it mid-JSON,
      // so JSON.parse failed and we silently fell back. 8000 gives headroom.
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });
    logUsage({ tool: 'meal', model: MODELS.sonnet, usage: message.usage, userId: actor.userId, ipHash: actor.ipHash });
    // "Green doesn't mean present": if the model still hit the cap, the JSON is
    // truncated and we'll fall back — make that loud so it can't hide again.
    if (message.stop_reason === 'max_tokens') {
      console.error('[API /nourish] TRUNCATED: hit max_tokens cap — plan JSON incomplete, will fall back. output_tokens=', message.usage?.output_tokens);
    }

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) {
      console.error('[API /nourish] No text block in Claude response — serving fallback. stop_reason=', message.stop_reason);
      return NextResponse.json({ data: withAllergens(buildFallback(), dietary) });
    }

    try {
      const data = JSON.parse(textBlock.text) as NourishResponse;

      // Validate AI output
      const dietarySummary = dietaryStr;
      const validation = await validateRecommendation('meal', textBlock.text, `dietary: ${dietarySummary}, budget: $${budget}, household: ${householdSize}`);
      if (validation.flags.length > 0) {
        try {
          const safeguarded = JSON.parse(validation.safeguardedResponse) as NourishResponse;
          return NextResponse.json({ data: withAllergens(safeguarded, dietary) });
        } catch {
          return NextResponse.json({ data: withAllergens(data, dietary) });
        }
      }

      return NextResponse.json({ data: withAllergens(data, dietary) });
    } catch (parseErr) {
      console.error(
        '[API /nourish] Failed to parse Claude response — serving fallback.',
        'stop_reason=', message.stop_reason,
        'output_tokens=', message.usage?.output_tokens,
        'error=', parseErr instanceof Error ? parseErr.message : parseErr,
      );
      return NextResponse.json({ data: withAllergens(buildFallback(), dietary) });
    }
  } catch (err) {
    console.error('[API /nourish] Error:', err);
    // Hard-error path: dietary may be unknown here, so no allergen context.
    return NextResponse.json({ data: buildFallback() });
  }
}
