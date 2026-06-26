'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { QuizQuestion } from '@/types';
import OptionButton from './OptionButton';
import SliderInput from './SliderInput';
import { trackEvent } from '@/lib/analytics';

interface QuizShellProps {
  toolColor: string;
  toolId?: string;
  questions: QuizQuestion[];
  onComplete: (answers: Record<string, string | string[] | number>) => void;
  /**
   * Pre-filled answers for signed-in users (Phase 5 family profile). Seeds the
   * quiz state on mount; anonymous users pass nothing and get the blank flow.
   */
  initialAnswers?: Record<string, string | string[] | number>;
}

const colorClasses: Record<string, { button: string; progress: string }> = {
  sage: { button: 'bg-sage hover:bg-sage-light', progress: 'bg-sage' },
  sky: { button: 'bg-sky hover:bg-sky-light', progress: 'bg-sky' },
  gold: { button: 'bg-gold hover:bg-gold-dark', progress: 'bg-gold' },
  terra: { button: 'bg-terra hover:bg-terra-light', progress: 'bg-terra' },
};

export default function QuizShell({ toolColor, toolId, questions, onComplete, initialAnswers }: QuizShellProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>(initialAnswers ?? {});
  const [direction, setDirection] = useState(1);
  const colors = colorClasses[toolColor] || colorClasses.sage;
  const quizCardRef = useRef<HTMLDivElement>(null);

  // Scroll quiz card into view on question change (nearest = no jarring jump)
  useEffect(() => {
    quizCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (step === 0 && toolId) {
      trackEvent('quiz_started', { tool: toolId });
    }
  }, [step, toolId]);

  // Filter to only visible questions based on current answers
  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => !q.shouldShow || q.shouldShow(answers));
  }, [questions, answers]);

  const visibleIndex = useMemo(() => {
    // Map raw step to position in visible list
    let count = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.shouldShow || q.shouldShow(answers)) {
        if (i === step) return count;
        count++;
      }
    }
    return count;
  }, [questions, answers, step]);

  const total = visibleQuestions.length;
  const question = questions[step];
  const progress = total > 0 ? ((visibleIndex + 1) / total) * 100 : 0;

  const currentAnswer = answers[question?.id];
  const hasAnswer = currentAnswer !== undefined && currentAnswer !== '' &&
    !(Array.isArray(currentAnswer) && currentAnswer.length === 0);

  // Find next visible step
  const findNextStep = useCallback((from: number, dir: 1 | -1): number | null => {
    let i = from + dir;
    while (i >= 0 && i < questions.length) {
      const q = questions[i];
      if (!q.shouldShow || q.shouldShow(answers)) return i;
      i += dir;
    }
    return null;
  }, [questions, answers]);

  const goNext = useCallback(() => {
    const next = findNextStep(step, 1);
    if (next !== null) {
      setDirection(1);
      setStep(next);
    } else {
      if (toolId) trackEvent('quiz_completed', { tool: toolId });
      onComplete(answers);
    }
  }, [step, findNextStep, answers, onComplete, toolId]);

  const goBack = useCallback(() => {
    const prev = findNextStep(step, -1);
    if (prev !== null) {
      setDirection(-1);
      setStep(prev);
    }
  }, [step, findNextStep]);

  const handleSingleSelect = useCallback(
    (value: string) => {
      const newAnswers = { ...answers, [question.id]: value };
      setAnswers(newAnswers);
      if (question.autoAdvance) {
        setTimeout(() => {
          // Find next visible step with updated answers
          let i = step + 1;
          while (i < questions.length) {
            const q = questions[i];
            if (!q.shouldShow || q.shouldShow(newAnswers)) break;
            i++;
          }
          if (i < questions.length) {
            setDirection(1);
            setStep(i);
          } else {
            if (toolId) trackEvent('quiz_completed', { tool: toolId });
            onComplete(newAnswers);
          }
        }, 250);
      }
    },
    [question, step, answers, questions, onComplete],
  );

  const handleMultiSelect = useCallback(
    (value: string) => {
      setAnswers((prev) => {
        const current = (prev[question.id] as string[]) || [];
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...prev, [question.id]: next };
      });
    },
    [question.id],
  );

  const handleTextChange = useCallback(
    (value: string) => {
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
    },
    [question.id],
  );

  const handleSliderChange = useCallback(
    (value: number) => {
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
    },
    [question.id],
  );

  // Guard: if current step is not visible (e.g. answers changed), skip forward
  if (question && question.shouldShow && !question.shouldShow(answers)) {
    const next = findNextStep(step, 1);
    if (next !== null) {
      setStep(next);
    }
    return null;
  }

  if (!question) return null;

  const isFirstVisible = findNextStep(step, -1) === null;
  const isLastVisible = findNextStep(step, 1) === null;

  return (
    <div ref={quizCardRef} className="mx-auto max-w-xl px-5 py-8 sm:py-12">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs text-mid">
          <span>Question {visibleIndex + 1} of {total}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <motion.div
            className={`h-full rounded-full ${colors.progress}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <h2 className="mb-2 font-display text-2xl font-bold text-charcoal sm:text-3xl">
            {question.label}
          </h2>
          {question.helpText && (
            <p className="mb-6 text-sm text-mid">{question.helpText}</p>
          )}

          <div className="mt-6 space-y-3">
            {question.type === 'single' && question.options?.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={(currentAnswer as string) === opt.value}
                onClick={() => handleSingleSelect(opt.value)}
                color={toolColor}
              />
            ))}

            {question.type === 'multi' && question.options?.map((opt) => (
              <OptionButton
                key={opt.value}
                label={opt.label}
                selected={((currentAnswer as string[]) || []).includes(opt.value)}
                onClick={() => handleMultiSelect(opt.value)}
                color={toolColor}
                multi
              />
            ))}

            {question.type === 'text' && (
              <input
                type="text"
                value={(currentAnswer as string) || ''}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={question.placeholder || ''}
                className="w-full rounded-xl border border-border bg-white px-4 py-3.5 text-charcoal placeholder:text-mid/50 focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage"
                autoFocus
              />
            )}

            {question.type === 'slider' && (
              <SliderInput
                value={(currentAnswer as number) ?? question.min ?? 0}
                min={question.min ?? 0}
                max={question.max ?? 100}
                step={question.step ?? 1}
                prefix={question.prefix}
                suffix={question.suffix}
                onChange={handleSliderChange}
                color={toolColor}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={goBack}
          disabled={isFirstVisible}
          className="rounded-lg px-4 py-2 text-sm font-medium text-mid transition-colors hover:text-charcoal disabled:invisible"
        >
          &larr; Back
        </button>

        {!(question.type === 'single' && question.autoAdvance) && (
          <button
            onClick={goNext}
            disabled={!hasAnswer}
            className={`rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${colors.button}`}
          >
            {isLastVisible ? 'See my results' : 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
}
