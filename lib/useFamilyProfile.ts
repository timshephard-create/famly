'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ToolId } from '@/config/platform';
import type { QuizAnswers } from '@/types/profile';
import {
  getFamilyProfile,
  profileToInitialAnswers,
  quizAnswersToProfilePatch,
  saveFamilyProfilePatch,
} from '@/lib/profile';
import { getLastResult, saveLastResult } from '@/lib/tool-results';

/**
 * Wires a tool's quiz to the signed-in user's family profile (Phase 5, Item 1):
 *  - pre-fill: profile → initialAnswers (anonymous resolves to {} — blank flow)
 *  - save-back: persist the profile-owned fields on quiz completion
 *  - recall: the last saved result snapshot for this tool
 *
 * All writes are fire-and-forget and no-op when signed out, so they never block
 * results or change the anonymous experience.
 */
export function useFamilyProfile<TResult = unknown>(toolId: ToolId) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [initialAnswers, setInitialAnswers] = useState<QuizAnswers>({});
  const [lastResult, setLastResult] = useState<TResult | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await getFamilyProfile(supabase);
        if (active && profile) setInitialAnswers(profileToInitialAnswers(profile, toolId));
        const last = await getLastResult<TResult>(supabase, toolId);
        if (active) setLastResult(last);
      } catch {
        // Pre-fill is best-effort; on any failure fall back to the blank flow.
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, toolId]);

  const saveProfileFromAnswers = useCallback(
    (answers: QuizAnswers) => {
      saveFamilyProfilePatch(supabase, quizAnswersToProfilePatch(answers, toolId)).catch(() => {});
    },
    [supabase, toolId],
  );

  const saveResult = useCallback(
    (payload: unknown) => {
      saveLastResult(supabase, toolId, payload).catch(() => {});
    },
    [supabase, toolId],
  );

  const clearRecall = useCallback(() => setLastResult(null), []);

  return { ready, initialAnswers, lastResult, saveProfileFromAnswers, saveResult, clearRecall };
}
