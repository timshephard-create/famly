'use client';

import { useState, useCallback } from 'react';
import { TOOLS } from '@/config/platform';
import QuizShell from '@/components/QuizShell';
import EmailCapture from '@/components/EmailCapture';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import LastResultCard from '@/components/LastResultCard';
import SaveAccountNudge from '@/components/SaveAccountNudge';
import { postTool, RateLimitError } from '@/lib/tool-client';
import { useFamilyProfile } from '@/lib/useFamilyProfile';
import PlaceCard from '@/components/PlaceCard';
import SavingsTiles from '@/components/SavingsTiles';
import AIInsightBlock from '@/components/AIInsightBlock';
import CrossToolFooter from '@/components/CrossToolFooter';
import RecommendationDisclaimer from '@/components/RecommendationDisclaimer';
import PremiumWaitlistCard from '@/components/PremiumWaitlistCard';
import { calculateSavings } from '@/lib/savings-calc';
import type { PlaceResult, SavingsBreakdown } from '@/types';
import type { QuizQuestion } from '@/types';

const tool = TOOLS.childcare;

const questions: QuizQuestion[] = [
  {
    id: 'situation',
    type: 'single',
    label: 'What best describes your situation?',
    autoAdvance: true,
    options: [
      { value: 'looking', label: 'Actively looking for care' },
      { value: 'expensive', label: 'Have care but paying too much' },
      { value: 'gap', label: 'Need to cover a gap (school break, closure, holiday)' },
      { value: 'planning', label: 'Planning ahead' },
    ],
  },
  {
    id: 'childAges',
    type: 'multi',
    label: 'How old are your children?',
    helpText: 'Select all that apply',
    options: [
      { value: 'infant', label: 'Infant (under 12 months)' },
      { value: 'toddler', label: 'Toddler (1\u20132 years)' },
      { value: 'preschool', label: 'Preschool Age (3\u20134 years)' },
      { value: 'prek', label: 'Pre-K / Kindergarten (4\u20135 years)' },
    ],
  },
  {
    id: 'zip',
    type: 'text',
    label: 'What\u2019s your ZIP code?',
    helpText: 'We\u2019ll find providers and programs near you.',
    placeholder: 'e.g. 90210',
    validate: (v: string) => /^\d{5}$/.test(v) ? null : 'Please enter a 5-digit ZIP code',
  },
  {
    id: 'income',
    type: 'single',
    label: 'What\u2019s your approximate household income?',
    helpText: 'This helps us find savings programs you qualify for.',
    autoAdvance: true,
    options: [
      { value: 'under_35k', label: 'Under $35,000' },
      { value: '35k_60k', label: '$35,000\u2013$60,000' },
      { value: '60k_90k', label: '$60,000\u2013$90,000' },
      { value: '90k_plus', label: '$90,000+' },
    ],
  },
  {
    id: 'schedule',
    type: 'single',
    label: 'What schedule do you need?',
    autoAdvance: true,
    options: [
      { value: 'fulltime', label: 'Full-time (5 days/week)' },
      { value: 'parttime', label: 'Part-time (2\u20133 days)' },
      { value: 'flexible', label: 'Flexible / drop-in' },
      { value: 'breaks', label: 'School breaks / backup only' },
    ],
  },
  {
    id: 'budget',
    type: 'slider',
    label: 'What\u2019s your monthly childcare budget?',
    min: 200,
    max: 3000,
    step: 50,
    prefix: '$',
  },
];

const HEAD_START_CARD: PlaceResult = {
  name: 'Head Start Program',
  address: 'Free, federally-funded early childhood education',
  phone: null,
  rating: null,
  totalRatings: 0,
  hours: null,
  distance: null,
  placeId: '',
  mapsUrl: 'https://www.acf.hhs.gov/ohs/about/head-start',
};

const GAP_CARE_EXTRAS: PlaceResult[] = [
  {
    name: 'Bright Horizons Backup Care',
    address: 'Employer-sponsored backup childcare benefit',
    phone: null,
    rating: 4.2,
    totalRatings: 0,
    hours: null,
    distance: null,
    placeId: '',
    mapsUrl: 'https://www.brighthorizons.com/backup-care', // TODO: replace with affiliate URL
  },
  {
    name: 'Care.com \u2014 Nanny Search',
    address: 'Find babysitters and nannies near you',
    phone: null,
    rating: 4.0,
    totalRatings: 0,
    hours: null,
    distance: null,
    placeId: '',
    mapsUrl: 'https://www.care.com', // TODO: replace with affiliate URL
  },
];

type SproutResults = {
  places: PlaceResult[];
  savings: SavingsBreakdown;
  insight: string;
  insightNotice: string;
  isGapMode: boolean;
  fallback: boolean;
  emailData: Record<string, unknown>;
};

export default function SproutTool() {
  const [phase, setPhase] = useState<'quiz' | 'loading' | 'email' | 'results'>('quiz');
  const [results, setResults] = useState<SproutResults | null>(null);
  const [error, setError] = useState(false);
  const { ready, initialAnswers, lastResult, signedIn, saveProfileFromAnswers, saveResult, clearRecall } =
    useFamilyProfile<SproutResults>(tool.id);

  const handleRecall = useCallback(() => {
    if (!lastResult) return;
    setResults(lastResult);
    setPhase('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [lastResult]);

  const handleComplete = useCallback(async (answers: Record<string, string | string[] | number>) => {
    setPhase('loading');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setError(false);

    const situation = answers.situation as string;
    const schedule = answers.schedule as string;
    const zip = answers.zip as string;
    const income = answers.income as string;
    const isGapMode = situation === 'gap' || schedule === 'breaks';

    const placeTypes = isGapMode
      ? ['gym', 'child_care_agency', 'primary_school']
      : ['child_care_agency', 'primary_school'];

    try {
      const [placesRes, insightRes] = await Promise.allSettled([
        fetch('/api/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zip, types: placeTypes }),
        }).then((r) => r.json()),
        postTool<{ insight: string }>('/api/insight', { tool: 'childcare', profile: answers }),
      ]);

      const placesData = placesRes.status === 'fulfilled' ? placesRes.value : { data: [], fallback: true };
      // Insight is supplementary: a rate-limited (or failed) insight never blocks
      // the locally-computed places + savings. On a 429 we surface the calm
      // high-demand note in the insight slot instead of silently dropping it.
      const insight = insightRes.status === 'fulfilled' ? insightRes.value.insight || '' : '';
      const insightNotice =
        insightRes.status === 'rejected' && insightRes.reason instanceof RateLimitError
          ? insightRes.reason.message
          : '';

      let places: PlaceResult[] = placesData.data || [];

      if (isGapMode) {
        places = [...places, ...GAP_CARE_EXTRAS];
      }

      // Inject Head Start if income under $60k
      if (!isGapMode && (income === 'under_35k' || income === '35k_60k')) {
        places = [HEAD_START_CARD, ...places];
      }

      // Eligibility math runs off the freshly-entered quiz answer (`income`),
      // never the profile's stored income — see the guard in lib/profile.ts.
      const savings = calculateSavings(income);

      const snapshot: SproutResults = {
        places,
        savings,
        insight,
        insightNotice,
        isGapMode,
        fallback: placesData.fallback || false,
        emailData: {
          savingsTotal: savings.total,
          ccdf: savings.ccdf,
          fsa: savings.fsa,
          ctc: savings.ctc,
          income,
          isGapMode,
        },
      };
      setResults(snapshot);
      saveProfileFromAnswers(answers);
      saveResult(snapshot);

      setPhase('email');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(true);
      setPhase('results');
    }
  }, [saveProfileFromAnswers, saveResult]);

  if (phase === 'quiz') {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-sage-pale px-5 py-8 text-center">
          <span className="text-3xl">{tool.icon}</span>
          <h1 className="mt-2 font-display text-3xl font-bold text-charcoal">{tool.name}</h1>
          <p className="mt-1 text-sm text-mid">{tool.badge} Navigator</p>
        </div>
        {lastResult && (
          <LastResultCard toolName={tool.name} onView={handleRecall} onDismiss={clearRecall} />
        )}
        {ready && (
          <QuizShell
            toolColor={tool.color}
            toolId={tool.id}
            questions={questions}
            onComplete={handleComplete}
            initialAnswers={initialAnswers}
          />
        )}
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-cream">
        <LoadingState
          color="sage"
          messages={[
            'Finding providers near you...',
            'Calculating your savings...',
            'Building your personalized plan...',
          ]}
        />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-cream">
        <ErrorState
          message="We couldn't load your results. Please try again."
          onRetry={() => setPhase('quiz')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {phase === 'email' && (
        <EmailCapture
          tool={tool}
          emailResultsData={results.emailData}
          onDismiss={() => setPhase('results')}
        />
      )}

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12" data-testid="results-container">
        <h1 className="mb-2 font-display text-3xl font-bold text-charcoal sm:text-4xl">
          {results.isGapMode ? 'Gap Care Options' : 'Your Childcare Matches'}
        </h1>
        <p className="mb-8 text-sm text-mid">
          {results.isGapMode
            ? 'Here are backup and short-term care options near you.'
            : 'Providers near you, sorted by rating, with your estimated savings.'}
        </p>

        {results.fallback && (
          <div className="mb-6 rounded-xl border border-gold/30 bg-gold-pale p-4 text-sm text-gold-dark">
            Live results unavailable &mdash; showing example options near you.
          </div>
        )}

        {/* AI Insight */}
        {results.insight && (
          <div className="mb-8">
            <AIInsightBlock insight={results.insight} color="sage" />
          </div>
        )}
        {!results.insight && results.insightNotice && (
          <div className="mb-8 rounded-2xl border border-line bg-shell px-5 py-4 text-sm text-mute">
            {results.insightNotice}
          </div>
        )}

        {/* Savings (provider mode only) */}
        {!results.isGapMode && results.savings.total > 0 && (
          <SavingsTiles savings={results.savings} />
        )}

        {/* Place Cards */}
        <div className="space-y-4">
          {results.places.map((place, i) => (
            <PlaceCard key={`${place.placeId || place.name}-${i}`} place={place} />
          ))}
        </div>

        {/* How to actually get your subsidy */}
        <section className="mt-10 rounded-2xl border border-sage-light/30 bg-sage-pale/40 p-6" data-testid="subsidy-next-steps">
          <h2 className="mb-1 font-display text-xl font-bold text-charcoal">How to Actually Get Your Subsidy</h2>
          <p className="mb-6 text-sm text-mid">Finding a provider is step one. Here&apos;s how to make the savings real.</p>

          <div className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage text-sm font-bold text-white">1</span>
              <div>
                <h3 className="text-sm font-bold text-charcoal">Check your waitlist status</h3>
                <p className="mt-1 text-xs leading-relaxed text-mid">
                  Texas CCDF has a waitlist in most counties. Apply now even if you&apos;re not ready &mdash; waitlists can be 6&ndash;18 months long.
                </p>
                <a href="https://www.yourtexasbenefits.com" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-lg bg-sage px-4 py-2 text-xs font-semibold text-white hover:bg-sage-light">
                  Apply on Your Texas Benefits &rarr;
                </a>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage text-sm font-bold text-white">2</span>
              <div>
                <h3 className="text-sm font-bold text-charcoal">Confirm provider accepts CCDF vouchers</h3>
                <p className="mt-1 text-xs leading-relaxed text-mid">
                  Before committing to any provider, ask directly: &ldquo;Do you accept CCDF subsidy vouchers?&rdquo; Not all licensed providers participate.
                </p>
                <p className="mt-2 text-xs italic text-gold-dark">Tip: Ask this before you fall in love with a provider.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage text-sm font-bold text-white">3</span>
              <div>
                <h3 className="text-sm font-bold text-charcoal">Gather your documents</h3>
                <p className="mt-1 text-xs leading-relaxed text-mid">You&apos;ll need:</p>
                <ul className="mt-1 space-y-0.5 text-xs text-mid">
                  <li>&#8226; Proof of income (pay stubs, tax return)</li>
                  <li>&#8226; Proof of Texas residency</li>
                  <li>&#8226; Child&apos;s birth certificate</li>
                  <li>&#8226; Proof of work/school/job search</li>
                  <li>&#8226; Child&apos;s immunization records</li>
                </ul>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage text-sm font-bold text-white">4</span>
              <div>
                <h3 className="text-sm font-bold text-charcoal">While you wait</h3>
                <p className="mt-1 text-xs leading-relaxed text-mid">CCDF processing takes 2&ndash;6 weeks after approval. In the meantime:</p>
                <ul className="mt-1 space-y-0.5 text-xs text-mid">
                  <li>&#8226; Ask providers about sliding scale rates &mdash; many offer income-based discounts even without CCDF</li>
                  <li>&#8226; Check if your employer offers Dependent Care FSA &mdash; up to $5,000 pre-tax for childcare</li>
                  <li>&#8226; Ask about part-time spots which are often cheaper and more available</li>
                </ul>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sage text-sm font-bold text-white">5</span>
              <div>
                <h3 className="text-sm font-bold text-charcoal">Know your rights</h3>
                <p className="mt-1 text-xs leading-relaxed text-mid">
                  If denied or waitlisted, you have the right to appeal. Contact the Texas Workforce Commission:
                </p>
                <p className="mt-1 text-xs text-mid">
                  <a href="https://twc.texas.gov/childcare" target="_blank" rel="noopener noreferrer" className="text-sage hover:underline">twc.texas.gov/childcare</a>
                  {' '}&middot;{' '}1-800-252-8942
                </p>
              </div>
            </div>
          </div>
        </section>

        <PremiumWaitlistCard toolId={tool.id} />

        <RecommendationDisclaimer tool="sprout" />
        <SaveAccountNudge signedIn={signedIn} />
        <CrossToolFooter currentToolId={tool.id} />
      </div>
    </div>
  );
}
