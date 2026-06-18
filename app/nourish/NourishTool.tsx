'use client';

import { useState, useCallback } from 'react';
import { TOOLS } from '@/config/platform';
import { trackEvent } from '@/lib/analytics';
import QuizShell from '@/components/QuizShell';
import EmailCapture from '@/components/EmailCapture';
import ErrorState from '@/components/ErrorState';
import LoadingState from '@/components/LoadingState';
import AIInsightBlock from '@/components/AIInsightBlock';
import CrossToolFooter from '@/components/CrossToolFooter';
import RecommendationDisclaimer from '@/components/RecommendationDisclaimer';
import PremiumWaitlistCard from '@/components/PremiumWaitlistCard';
import type {
  NourishResponse,
  NourishDay,
  NourishShoppingItem,
  NourishStoreStrategy,
  NearbyStore,
} from '@/types';
import type { QuizQuestion } from '@/types';

const tool = TOOLS.meal;

const questions: QuizQuestion[] = [
  {
    id: 'householdSize',
    type: 'single',
    label: 'How many people are you feeding?',
    autoAdvance: true,
    options: [
      { value: '1', label: 'Just me (1 person)' },
      { value: '2', label: '2 people' },
      { value: '3-4', label: 'Family of 3\u20134' },
      { value: '5+', label: 'Family of 5+' },
    ],
  },
  {
    id: 'budget',
    type: 'slider',
    label: 'What\u2019s your weekly grocery budget?',
    min: 50,
    max: 500,
    step: 25,
    prefix: '$',
  },
  {
    id: 'dietary',
    type: 'multi',
    label: 'Any dietary preferences or restrictions?',
    helpText: 'Select all that apply',
    options: [
      { value: 'none', label: 'No restrictions' },
      { value: 'vegetarian', label: 'Vegetarian' },
      { value: 'vegan', label: 'Vegan' },
      { value: 'gluten-free', label: 'Gluten-free' },
      { value: 'dairy-free', label: 'Dairy-free' },
      { value: 'halal', label: 'Halal' },
      { value: 'kosher', label: 'Kosher' },
      { value: 'low-carb', label: 'Low-carb / Keto' },
      { value: 'nut-allergy', label: 'Nut allergy' },
    ],
  },
  {
    id: 'cookingTime',
    type: 'single',
    label: 'How much time do you have to cook?',
    autoAdvance: true,
    options: [
      { value: 'minimal', label: 'Minimal \u2014 15\u201320 min meals only' },
      { value: 'moderate', label: 'Moderate \u2014 up to 45 minutes' },
      { value: 'flexible', label: 'Flexible \u2014 happy to cook on weekends' },
      { value: 'batch', label: 'Batch cooking \u2014 I prep once for the week' },
    ],
  },
  {
    id: 'zip',
    type: 'text',
    label: 'What\u2019s your ZIP code?',
    helpText: 'We\u2019ll find stores near you and build your plan.',
    placeholder: 'e.g. 78701',
    validate: (v: string) => /^\d{5}$/.test(v) ? null : 'Please enter a 5-digit ZIP code',
  },
];

const CATEGORIES: Array<{ key: string; label: string; icon: string }> = [
  { key: 'Produce', label: 'Produce', icon: '\uD83E\uDD66' },
  { key: 'Protein', label: 'Protein', icon: '\uD83E\uDD69' },
  { key: 'Dairy', label: 'Dairy', icon: '\uD83E\uDDC0' },
  { key: 'Pantry', label: 'Pantry', icon: '\uD83C\uDF3E' },
  { key: 'Frozen', label: 'Frozen', icon: '\u2744\uFE0F' },
];

const STORE_SEARCH_URLS: Record<string, (q: string) => string> = {
  Walmart: (q) => `https://www.walmart.com/search?q=${q}`,
  HEB: (q) => `https://www.heb.com/search-results-page/query=${q}`,
  Aldi: (q) => `https://www.aldi.us/en/search/?search=${q}`,
  Kroger: (q) => `https://www.kroger.com/search?query=${q}`,
  Target: (q) => `https://www.target.com/s?searchTerm=${q}`,
  Costco: (q) => `https://www.costco.com/CatalogSearch?keyword=${q}`,
  'Amazon Fresh': (q) => `https://www.amazon.com/s?i=amazonfresh&k=${q}`,
  "Sam's Club": (q) => `https://www.samsclub.com/s/${q}`,
  "Trader Joe's": (q) => `https://www.traderjoes.com/home/search?q=${q}`,
  'Whole Foods': (q) => `https://www.wholefoodsmarket.com/search?text=${q}`,
};

function getFirstIngredient(items: NourishShoppingItem[]): string {
  if (items.length === 0) return 'groceries';
  return items[0].item.split('(')[0].trim();
}

function getShopUrl(chain: string, items: NourishShoppingItem[]): string {
  const firstItem = getFirstIngredient(items);
  const encoded = encodeURIComponent(firstItem);
  const builder = STORE_SEARCH_URLS[chain];
  return builder ? builder(encoded) : `https://www.google.com/search?q=${encoded}+${encodeURIComponent(chain)}`;
}

// --- Sub-components ---

function MealDayCard({ day, expanded, onToggle }: { day: NourishDay; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-lg font-bold text-charcoal">{day.day}</span>
        <span className="text-mid transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : '' }}>
          &#9660;
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
            <div key={meal}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-terra">{meal}</p>
                  <p className="text-sm font-medium text-charcoal">{day[meal].name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-mid">{day[meal].prepTime}</p>
                  <p className="text-xs font-medium text-charcoal">{day[meal].cost}</p>
                </div>
              </div>
              {/* Dinner recipe steps */}
              {meal === 'dinner' && day.dinner.steps && day.dinner.steps.length > 0 && (
                <div className="mt-2 ml-0.5">
                  <ol className="space-y-1">
                    {day.dinner.steps.map((step, idx) => (
                      <li key={idx} className="flex gap-2 text-xs leading-relaxed text-mid">
                        <span className="flex-shrink-0 font-semibold text-terra">{idx + 1}.</span>
                        {step.replace(/^Step \d+:\s*/i, '')}
                      </li>
                    ))}
                  </ol>
                  {day.dinner.tip && (
                    <div className="mt-2 rounded-lg bg-terra-pale px-3 py-2">
                      <p className="text-xs text-terra"><strong>Tip:</strong> {day.dinner.tip}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreSkeleton() {
  return (
    <section className="mb-8">
      <div className="h-7 w-48 rounded bg-border/50 mb-4 animate-pulse" />
      <div className="rounded-2xl border border-terra-light/30 bg-terra-pale p-6 mb-4 animate-pulse">
        <div className="h-5 w-56 rounded bg-border/40 mb-3" />
        <div className="h-4 w-full rounded bg-border/30 mb-2" />
        <div className="h-4 w-3/4 rounded bg-border/30" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-white p-5 animate-pulse">
            <div className="h-5 w-32 rounded bg-border/50 mb-2" />
            <div className="h-4 w-full rounded bg-border/30 mb-1" />
            <div className="h-4 w-2/3 rounded bg-border/30" />
          </div>
        ))}
      </div>
    </section>
  );
}

const NOURISH_LOADING_MESSAGES = [
  'Planning your week...',
  'Building your shopping list...',
  'Finding stores near you...',
  'Almost ready...',
];

function StoreCard({ store, shopUrl, searchItem }: { store: NearbyStore; shopUrl: string; searchItem: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="mb-1 flex items-start justify-between">
        <h4 className="font-display text-base font-bold text-charcoal">{store.chain}</h4>
        <span className="text-xs text-mid whitespace-nowrap">{store.distance}</span>
      </div>
      {store.name !== store.chain && (
        <p className="text-xs text-mid mb-1">{store.name}</p>
      )}
      <p className="text-sm text-mid mb-1">{store.address}</p>
      {store.hours && <p className="text-xs text-mid mb-3">{store.hours}</p>}
      <div className="flex gap-2">
        <a
          href={store.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg border border-border bg-cream px-3 py-2 text-center text-xs font-medium text-charcoal hover:bg-border/30"
        >
          Get Directions &rarr;
        </a>
        <a
          href={shopUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-lg bg-terra px-3 py-2 text-center text-xs font-medium text-white hover:bg-terra-light"
          title={`Searches for "${searchItem}" at ${store.chain}`}
        >
          Shop This List &rarr;
        </a>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-mid">
        Searches for &ldquo;{searchItem}&rdquo; at {store.chain}
      </p>
    </div>
  );
}

// --- Main component ---

export default function NourishTool() {
  const [phase, setPhase] = useState<'quiz' | 'loading' | 'email' | 'results'>('quiz');
  const [results, setResults] = useState<NourishResponse | null>(null);
  const [stores, setStores] = useState<NearbyStore[] | null>(null);
  const [storesLoading, setStoresLoading] = useState(true);
  const [emailData, setEmailData] = useState<Record<string, unknown>>({});
  const [userBudget, setUserBudget] = useState(0);
  const [expandedDay, setExpandedDay] = useState(0);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [instacartState, setInstacartState] = useState<'idle' | 'loading' | 'unavailable'>('idle');

  const handleComplete = useCallback(async (answers: Record<string, string | string[] | number>) => {
    setPhase('loading');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setError(false);
    setStoresLoading(true);
    const zip = answers.zip as string;
    setUserBudget(answers.budget as number);

    // 1. Kick off store search immediately
    const storePromise = fetch('/api/nearby-stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip }),
    })
      .then((r) => r.json())
      .then((data) => (data.stores || []) as NearbyStore[])
      .catch(() => [] as NearbyStore[]);

    // 2. Wait for stores, then call nourish with store names
    try {
      const foundStores = await storePromise;
      setStores(foundStores);
      setStoresLoading(false);

      const nearbyStoreNames = foundStores.map((s) => s.chain);

      const nourishRes = await fetch('/api/nourish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdSize: answers.householdSize,
          budget: answers.budget,
          dietary: answers.dietary || [],
          cookingTime: answers.cookingTime,
          zip,
          nearbyStores: nearbyStoreNames,
        }),
      });

      const data = await nourishRes.json();
      const nourishData = data.data as NourishResponse;
      setResults(nourishData);

      const dinners = nourishData.weeklyPlan?.slice(0, 3).map((d) => d.dinner) || [];
      setEmailData({
        weeklyTotal: nourishData.weeklyTotal,
        topDinners: dinners,
        topSavingsTip: nourishData.savingsTips?.[0],
      });

      setPhase('email');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(true);
      setPhase('results');
    }
  }, []);

  const handleCopyList = useCallback(() => {
    if (!results) return;
    const lines = results.shoppingList.map(
      (item) => `${item.item} (${item.quantity}) - ${item.estimatedCost}`,
    );
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [results]);

  // Shoppable list is a bonus, never a dependency: any failure quietly
  // degrades to the plain list (copy/print still work).
  const handleInstacart = useCallback(async () => {
    if (!results || instacartState === 'loading') return;
    setInstacartState('loading');
    try {
      const res = await fetch('/api/instacart/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: results.shoppingList }),
      });
      if (!res.ok) throw new Error(`instacart ${res.status}`);
      const data = await res.json();
      if (!data.url) throw new Error('no url');
      trackEvent('instacart_list_created', { tool: tool.id });
      window.open(data.url, '_blank', 'noopener');
      setInstacartState('idle');
    } catch {
      setInstacartState('unavailable');
    }
  }, [results, instacartState]);

  if (phase === 'quiz') {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-terra-pale px-5 py-8 text-center">
          <span className="text-3xl">{tool.icon}</span>
          <h1 className="mt-2 font-display text-3xl font-bold text-charcoal">{tool.name}</h1>
          <p className="mt-1 text-sm text-mid">{tool.badge} Navigator</p>
        </div>
        <QuizShell
          toolColor={tool.color}
          toolId={tool.id}
          questions={questions}
          onComplete={handleComplete}
        />
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-cream">
        <LoadingState color="terra" messages={NOURISH_LOADING_MESSAGES} />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-cream">
        <ErrorState
          message="We couldn't generate your meal plan. Please try again."
          onRetry={() => setPhase('quiz')}
        />
      </div>
    );
  }

  const budgetNum = parseFloat(results.weeklyTotal.replace(/[^0-9.]/g, ''));
  const isUnderBudget = budgetNum <= userBudget;

  return (
    <div className="min-h-screen bg-cream">
      {phase === 'email' && (
        <EmailCapture tool={tool} emailResultsData={emailData} onDismiss={() => setPhase('results')} />
      )}

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12" data-testid="results-container">
        <h1 className="mb-2 font-display text-3xl font-bold text-charcoal sm:text-4xl">
          Your Weekly Meal Plan
        </h1>
        <p className="mb-8 text-sm text-mid">
          7 days of meals optimized for your budget, preferences, and schedule.
        </p>

        {/* Deterministic allergen warning — unmissable; names the allergen,
            the exact matched terms, and the affected items so the family can
            judge each one. */}
        {results.allergenWarnings && results.allergenWarnings.length > 0 && (
          <div
            data-testid="allergen-warning"
            role="alert"
            className="mb-8 rounded-xl border-2 border-terra bg-terra-pale p-5"
          >
            <p className="font-display text-lg font-bold text-charcoal">
              ⚠️ Heads up — this plan may contain an allergen you flagged
            </p>
            <p className="mt-1 text-sm text-charcoal">
              We scan every plan against your declared allergies. Always read labels and confirm
              before cooking. Here&apos;s what we matched:
            </p>
            <ul className="mt-3 space-y-2">
              {results.allergenWarnings.map((w) => (
                <li key={w.allergen} className="text-sm text-charcoal">
                  <span className="font-semibold capitalize">{w.allergen}</span> — matched{' '}
                  <span className="font-semibold">{w.matchedTerms.join(', ')}</span> in:{' '}
                  <span className="text-mid">{w.affectedItems.join('; ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Insight */}
        {results.insight && (
          <div className="mb-8">
            <AIInsightBlock insight={results.insight} color="terra" />
          </div>
        )}

        {/* Weekly Total */}
        <div className="mb-8 rounded-2xl bg-terra p-6 text-center text-white">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">
            Estimated weekly grocery cost
          </p>
          <p className="mt-1 font-display text-4xl font-bold">{results.weeklyTotal}</p>
          <p className="mt-1 text-sm text-white/80">
            {isUnderBudget
              ? `That\u2019s $${(userBudget - budgetNum).toFixed(0)} under your $${userBudget} budget`
              : `Your budget: $${userBudget}/week`}
          </p>
        </div>

        {/* ===== WHERE TO SHOP ===== */}
        {storesLoading ? (
          <StoreSkeleton />
        ) : (
          <section className="mb-8">
            <h2 className="mb-4 font-display text-xl font-bold text-charcoal">
              Where to Shop
            </h2>

            {/* Split Shopping Plan */}
            {results.splitShoppingPlan && (
              <div className="mb-4 rounded-2xl border border-terra-light/30 bg-terra-pale p-6">
                <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold text-terra">
                  <span>&#128161;</span> Your Shopping Strategy
                </h3>
                <p className="text-sm leading-relaxed text-charcoal">
                  {results.splitShoppingPlan}
                </p>
              </div>
            )}

            {/* Per-Category Store Strategy */}
            {results.storeStrategy && results.storeStrategy.length > 0 && (
              <div className="mb-4 rounded-xl border border-border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-cream">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-mid">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-mid">Best Store</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-mid hidden sm:table-cell">Why</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-mid">Savings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.storeStrategy.map((s: NourishStoreStrategy, i: number) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium text-charcoal">{s.category}</td>
                          <td className="px-4 py-3 text-terra font-medium">{s.bestStore}</td>
                          <td className="px-4 py-3 text-mid hidden sm:table-cell">{s.reason}</td>
                          <td className="px-4 py-3 text-right font-medium text-sage">{s.estimatedSavings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-mid bg-cream/50">
                  Based on typical pricing patterns — actual prices vary by location and week.
                </p>
              </div>
            )}

            {/* Nearby Store Cards */}
            {stores && stores.length > 0 && (
              <>
                <h3 className="mb-3 text-sm font-semibold text-charcoal">Stores near you</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {stores.map((store) => (
                    <StoreCard
                      key={store.placeId || store.chain}
                      store={store}
                      shopUrl={getShopUrl(store.chain, results.shoppingList)}
                      searchItem={getFirstIngredient(results.shoppingList)}
                    />
                  ))}
                </div>
              </>
            )}

            {stores && stores.length === 0 && (
              <div className="rounded-xl border border-border bg-white p-5">
                <p className="text-sm text-mid">
                  <strong>No major grocery chains found within 12 miles.</strong> For rural areas, we recommend Walmart for most items and Amazon Fresh for pantry staples and non-perishables.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ===== 7-DAY PLAN ===== */}
        <section className="mb-8">
          <h2 className="mb-4 font-display text-xl font-bold text-charcoal">
            7-Day Plan
          </h2>
          <div className="space-y-3">
            {results.weeklyPlan.map((day: NourishDay, i: number) => (
              <MealDayCard
                key={day.day}
                day={day}
                expanded={expandedDay === i}
                onToggle={() => setExpandedDay(expandedDay === i ? -1 : i)}
              />
            ))}
          </div>
        </section>

        {/* ===== SHOPPING LIST ===== */}
        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-charcoal">
              Shopping List
            </h2>
            <div className="flex flex-wrap gap-2">
              {process.env.NEXT_PUBLIC_INSTACART_ENABLED === 'true' &&
                instacartState !== 'unavailable' && (
                  <button
                    onClick={handleInstacart}
                    disabled={instacartState === 'loading'}
                    data-testid="instacart-button"
                    className="rounded-lg bg-clover px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-clover-dark disabled:opacity-40"
                  >
                    {instacartState === 'loading' ? 'Building list…' : 'Shop this list on Instacart'}
                  </button>
                )}
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-mid hover:bg-cream"
              >
                Print List
              </button>
              <button
                onClick={handleCopyList}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-mid hover:bg-cream"
              >
                {copied ? 'Copied!' : 'Copy List'}
              </button>
            </div>
          </div>
          {instacartState === 'unavailable' && (
            <p className="mb-3 text-xs text-mid" data-testid="instacart-fallback">
              Instacart&apos;s feed is napping — not you, them. Your list still works below: copy
              it, print it, shop it.
            </p>
          )}
          <div className="space-y-4">
            {CATEGORIES.map(({ key, label, icon }) => {
              const items = results.shoppingList.filter(
                (item: NourishShoppingItem) => item.category === key,
              );
              if (items.length === 0) return null;
              return (
                <div key={key} className="rounded-xl border border-border bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
                    <span>{icon}</span> {label}
                  </h3>
                  <div className="space-y-2">
                    {items.map((item: NourishShoppingItem, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-charcoal">
                          {item.item} <span className="text-mid">({item.quantity})</span>
                        </span>
                        <span className="font-medium text-charcoal">{item.estimatedCost}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Savings Tips */}
        {results.savingsTips && results.savingsTips.length > 0 && (
          <section className="mb-8 rounded-2xl border border-terra-light/30 bg-terra-pale p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-terra">
              <span>&#128161;</span> Savings Tips
            </h2>
            <ul className="space-y-2">
              {results.savingsTips.map((tip: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-charcoal">
                  <span className="mt-0.5 text-terra">&#10003;</span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        )}

        <PremiumWaitlistCard toolId={tool.id} />

        <RecommendationDisclaimer tool="nourish" />
        <CrossToolFooter currentToolId={tool.id} />
      </div>
    </div>
  );
}
