import type { AllergenGroup } from '@/lib/allergens';

/**
 * Canonical family-profile shape (Phase 5, Item 1). The single source the four
 * tools pre-fill from. Persisted in public.family_profiles (one row per user).
 * Tool-specific quiz vocabularies are mapped to/from this canonical shape only
 * at the app edges (see lib/profile.ts).
 */

export interface FamilyChild {
  /**
   * Storage-only. Exists to derive each tool's age band for pre-fill
   * (months → band is lossless in that direction). Never displayed to the user
   * as a literal age — do not surface invented precision.
   */
  ageMonths: number;
}

export interface FamilyContext {
  zip?: string;
  householdSize?: '1' | '2' | '3-4' | '5+';
  /**
   * Pre-fill convenience ONLY. Eligibility/subsidy math (Sprout savings,
   * HealthGuide cost engine) runs off the freshly-entered quiz answer for that
   * run — never off this stored value, which may be a lossy bracket midpoint.
   */
  householdIncomeUsd?: number;
}

export interface FamilyProfile {
  children: FamilyChild[];
  allergens: AllergenGroup[];
  context: FamilyContext;
}

/** Quiz answers as QuizShell produces/consumes them. */
export type QuizAnswers = Record<string, string | string[] | number>;
