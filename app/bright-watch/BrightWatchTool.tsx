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
import BrightWatchCard from '@/components/BrightWatchCard';
import AIInsightBlock from '@/components/AIInsightBlock';
import CrossToolFooter from '@/components/CrossToolFooter';
import RecommendationDisclaimer from '@/components/RecommendationDisclaimer';
import PremiumWaitlistCard from '@/components/PremiumWaitlistCard';
import type { BrightWatchResponse } from '@/types';
import type { QuizQuestion } from '@/types';

const tool = TOOLS.media;

const questions: QuizQuestion[] = [
  {
    id: 'age',
    type: 'single',
    label: 'How old is your child?',
    autoAdvance: true,
    options: [
      { value: 'under_12m', label: 'Under 12 months' },
      { value: '12_24m', label: '12\u201324 months' },
      { value: '2_3y', label: '2\u20133 years' },
      { value: '4_5y', label: '4\u20135 years' },
    ],
  },
  {
    id: 'context',
    type: 'single',
    label: 'What\u2019s the viewing context?',
    autoAdvance: true,
    options: [
      { value: 'learning', label: 'Learning time' },
      { value: 'wind_down', label: 'Wind-down before bed' },
      { value: 'co_viewing', label: 'Co-viewing with parent' },
      { value: 'independent', label: 'Independent play' },
    ],
  },
  {
    id: 'medium',
    type: 'single',
    label: 'What type of content?',
    autoAdvance: true,
    options: [
      { value: 'tv', label: 'TV shows' },
      { value: 'apps', label: 'Apps & games' },
      { value: 'both', label: 'Both' },
    ],
  },
];

export default function BrightWatchTool() {
  const [phase, setPhase] = useState<'quiz' | 'loading' | 'email' | 'results'>('quiz');
  const [results, setResults] = useState<BrightWatchResponse | null>(null);
  const [emailData, setEmailData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<{ message: string; calm: boolean } | null>(null);
  const { ready, initialAnswers, lastResult, signedIn, saveProfileFromAnswers, saveResult, clearRecall } =
    useFamilyProfile<BrightWatchResponse>(tool.id);

  const handleRecall = useCallback(() => {
    if (!lastResult) return;
    setResults(lastResult);
    setPhase('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [lastResult]);

  const handleComplete = useCallback(async (answers: Record<string, string | string[] | number>) => {
    setPhase('loading');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setError(null);

    try {
      const bwData = await postTool<BrightWatchResponse>('/api/brightwatch', {
        age: answers.age,
        context: answers.context,
        medium: answers.medium,
      });
      setResults(bwData);
      saveProfileFromAnswers(answers);
      saveResult(bwData);
      setEmailData({
        childAge: answers.age as string,
        context: answers.context as string,
        recommendations: bwData.recommendations?.map((r) => ({
          name: r.name, platform: r.platform, score: r.score, why: r.why,
        })),
        avoid: bwData.avoid,
      });
      setPhase('email');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(
        err instanceof RateLimitError
          ? { message: err.message, calm: true }
          : { message: "We couldn't load your recommendations. Please try again.", calm: false },
      );
      setPhase('results');
    }
  }, [saveProfileFromAnswers, saveResult]);

  if (phase === 'quiz') {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-gold-pale px-5 py-8 text-center">
          <span className="text-3xl">{tool.icon}</span>
          <h1 className="mt-2 font-display text-3xl font-bold text-charcoal">{tool.name}</h1>
          <p className="mt-1 text-sm text-mid">Media that works FOR your child&apos;s development &mdash; not against it</p>
        </div>

        {/* AAP Screen Time Guidelines */}
        <div className="mx-auto max-w-xl px-5 pt-6" data-testid="aap-guidelines">
          <div className="rounded-2xl border border-gold/30 bg-white p-5">
            <h3 className="mb-1 font-display text-base font-bold text-charcoal">AAP Screen Time Guidelines</h3>
            <p className="mb-4 text-xs text-mid">American Academy of Pediatrics recommendations</p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg flex-shrink-0">&#128683;</span>
                <div><p className="text-xs font-semibold text-charcoal">Under 18 months</p><p className="text-xs text-mid">Avoid screen time except video calls with family</p></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg flex-shrink-0">&#128104;&#8205;&#128105;&#8205;&#128103;</span>
                <div><p className="text-xs font-semibold text-charcoal">18&ndash;24 months</p><p className="text-xs text-mid">High-quality programming only. Watch together and talk about what you see.</p></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg flex-shrink-0">&#9200;</span>
                <div><p className="text-xs font-semibold text-charcoal">2&ndash;5 years</p><p className="text-xs text-mid">1 hour per day of high-quality programming. Co-view when possible.</p></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg flex-shrink-0">&#128203;</span>
                <div><p className="text-xs font-semibold text-charcoal">6 years and up</p><p className="text-xs text-mid">Set consistent limits on time and types of media. Ensure it doesn&apos;t displace sleep, physical activity, or homework.</p></div>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-mid">
              Source: <a href="https://www.healthychildren.org" target="_blank" rel="noopener noreferrer" className="text-gold-dark hover:underline">American Academy of Pediatrics (healthychildren.org)</a>
            </p>
          </div>
          <p className="mt-4 mb-2 text-center text-sm leading-relaxed text-mid">
            Screen time isn&apos;t all bad or all good. BrightWatch helps you choose content that supports how your child&apos;s brain is actually developing right now &mdash; not just what&apos;s popular.
          </p>
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
          color="gold"
          messages={[
            'Reviewing content for your child\'s age...',
            'Scoring developmental impact...',
            'Building your recommendations...',
          ]}
        />
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-cream">
        <ErrorState
          title={error?.calm ? 'High demand right now' : undefined}
          icon={error?.calm ? '\u{23F3}' : undefined}
          message={error?.message ?? "We couldn't load your recommendations. Please try again."}
          onRetry={() => setPhase('quiz')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {phase === 'email' && (
        <EmailCapture tool={tool} emailResultsData={emailData} onDismiss={() => setPhase('results')} />
      )}

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12" data-testid="results-container">
        <h1 className="mb-2 font-display text-3xl font-bold text-charcoal sm:text-4xl">
          Your Recommendations
        </h1>
        <p className="mb-8 text-sm text-mid">
          Age-appropriate picks based on your child&apos;s profile.
        </p>

        {/* AI Insight */}
        {results.insight && (
          <div className="mb-8">
            <AIInsightBlock insight={results.insight} color="gold" />
          </div>
        )}

        {/* Availability disclaimer */}
        <p className="mb-4 text-xs italic text-mid">
          Platform availability changes frequently. Tap &ldquo;Full review&rdquo; to verify current streaming availability.
        </p>

        {/* Recommendation Cards */}
        <div className="space-y-4">
          {results.recommendations.map((rec, i) => (
            <BrightWatchCard key={i} rec={rec} />
          ))}
        </div>

        {/* What to Avoid */}
        {results.avoid && (
          <section className="mt-8 rounded-2xl border border-gold/30 bg-gold-pale p-6">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-gold-dark">
              <span>&#9888;</span> What to Avoid
            </h2>
            <p className="text-sm leading-relaxed text-charcoal">{results.avoid}</p>
          </section>
        )}

        {/* Methodology Note */}
        <section className="mt-8 rounded-xl border border-border bg-cream p-5">
          <h3 className="mb-2 text-sm font-semibold text-charcoal">
            How BrightWatch scores content
          </h3>
          <p className="mb-3 text-xs leading-relaxed text-mid">
            BrightWatch ratings are based on current child development research for ages 0&ndash;5, scoring content on pacing, stimulation level, language richness, interactive design, and prosocial modeling. These criteria are different from age-appropriateness ratings.
          </p>
          <p className="mb-3 text-xs leading-relaxed text-mid">
            For full content reviews including age ratings, violence, language, and commercial content, we recommend Common Sense Media.
          </p>
          <a
            href="https://www.commonsensemedia.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-gold-dark hover:text-gold"
          >
            Visit Common Sense Media &rarr;
          </a>
        </section>

        <PremiumWaitlistCard toolId={tool.id} />

        <RecommendationDisclaimer tool="brightwatch" />
        <SaveAccountNudge signedIn={signedIn} />
        <CrossToolFooter currentToolId={tool.id} />
      </div>
    </div>
  );
}
