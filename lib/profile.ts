import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolId } from '@/config/platform';
import type { AllergenGroup } from '@/lib/allergens';
import { dietaryValuesToGroups, groupsToDietaryValues } from '@/lib/allergens';
import type { FamilyProfile, FamilyChild, FamilyContext, QuizAnswers } from '@/types/profile';

/**
 * Family-profile read/write + the per-tool edge mappers between each quiz's
 * vocabulary and the canonical FamilyProfile (Phase 5, Item 1).
 *
 * Everything above the Supabase IO is a PURE function (unit-tested). The IO
 * uses the publishable-key client (RLS-enforced); callers pass either the
 * browser or cookie server client.
 */

// ── Age bands ───────────────────────────────────────────────────────────────
// ageMonths is storage-only (canonical). These map months → each tool's band
// for pre-fill (lossless that direction) and, for Sprout only, a band back to a
// representative month value. Raw ageMonths is never shown to the user.

const SPROUT_BAND_MONTHS: Record<string, number> = {
  infant: 6, // under 12 months
  toddler: 18, // 1–2 years
  preschool: 42, // 3–4 years
  prek: 54, // 4–5 years
};

function sproutBandForMonths(m: number): string | null {
  if (m < 12) return 'infant';
  if (m < 36) return 'toddler';
  if (m < 48) return 'preschool';
  if (m < 72) return 'prek';
  return null; // older than Sprout's range — no band to pre-fill
}

/** Distinct Sprout age bands present across the children (a set, not a count). */
export function childrenToSproutBands(children: FamilyChild[]): string[] {
  const bands = new Set<string>();
  for (const c of children) {
    const b = sproutBandForMonths(c.ageMonths);
    if (b) bands.add(b);
  }
  return Array.from(bands);
}

/** Sprout's selected bands → one canonical child per band (representative age). */
export function sproutBandsToChildren(bands: string[]): FamilyChild[] {
  return bands
    .filter((b) => b in SPROUT_BAND_MONTHS)
    .map((b) => ({ ageMonths: SPROUT_BAND_MONTHS[b] }));
}

/** BrightWatch asks one child's age — pre-fill from the youngest child. */
export function youngestBrightWatchBand(children: FamilyChild[]): string | null {
  if (children.length === 0) return null;
  const m = Math.min(...children.map((c) => c.ageMonths));
  if (m < 12) return 'under_12m';
  if (m < 24) return '12_24m';
  if (m < 48) return '2_3y';
  return '4_5y';
}

// ── Income ──────────────────────────────────────────────────────────────────
// Canonical householdIncomeUsd is pre-fill convenience only. Eligibility math
// runs off the quiz answer confirmed at completion — never these stored values.

function numberToSproutBracket(n: number): string {
  if (n < 35000) return 'under_35k';
  if (n < 60000) return '35k_60k';
  if (n < 90000) return '60k_90k';
  return '90k_plus';
}

const SPROUT_BRACKET_USD: Record<string, number> = {
  under_35k: 25000,
  '35k_60k': 47500,
  '60k_90k': 75000,
  '90k_plus': 120000,
};

function numberToHealthBracket(n: number): string {
  if (n <= 30000) return '30k_under';
  if (n <= 60000) return '31_60k';
  if (n <= 100000) return '61_100k';
  return '101k_plus';
}

// HealthGuide's income slider bounds (mirror the quiz); clamp pre-fill into range.
const HEALTH_INCOME_MIN = 20000;
const HEALTH_INCOME_MAX = 250000;
function clampHealthIncome(n: number): number {
  return Math.min(HEALTH_INCOME_MAX, Math.max(HEALTH_INCOME_MIN, n));
}

// ── Household size ────────────────────────────────────────────────────────────
// Canonical vocab matches Nourish ('1'|'2'|'3-4'|'5+'). HealthGuide uses tokens.

const HG_TO_CANONICAL: Record<string, FamilyContext['householdSize']> = {
  just_me: '1',
  me_partner: '2',
  family_3_4: '3-4',
  family_5_plus: '5+',
};
const CANONICAL_TO_HG: Record<string, string> = {
  '1': 'just_me',
  '2': 'me_partner',
  '3-4': 'family_3_4',
  '5+': 'family_5_plus',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Drop undefined keys so a patch never overwrites stored context with undefined. */
function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const EMPTY_PROFILE: FamilyProfile = { children: [], allergens: [], context: {} };

// ── Pre-fill: profile → quiz answers ──────────────────────────────────────────

/** Map the canonical profile to a tool's quiz answer keys (only fields we hold). */
export function profileToInitialAnswers(profile: FamilyProfile, toolId: ToolId): QuizAnswers {
  const { children, allergens, context } = profile;
  const a: QuizAnswers = {};

  switch (toolId) {
    case 'childcare': {
      const bands = childrenToSproutBands(children);
      if (bands.length) a.childAges = bands;
      if (context.zip) a.zip = context.zip;
      if (context.householdIncomeUsd !== undefined) {
        a.income = numberToSproutBracket(context.householdIncomeUsd);
      }
      break;
    }
    case 'health': {
      if (context.zip) a.zip = context.zip;
      if (context.householdSize) a.householdSize = CANONICAL_TO_HG[context.householdSize];
      if (context.householdIncomeUsd !== undefined) {
        a.income = clampHealthIncome(context.householdIncomeUsd);
        a.incomeBracket = numberToHealthBracket(context.householdIncomeUsd);
      }
      // Only pre-fill the affirmative; let users say "no" themselves.
      if (children.length > 0) a.hasChildren = 'yes';
      break;
    }
    case 'meal': {
      if (context.zip) a.zip = context.zip;
      if (context.householdSize) a.householdSize = context.householdSize;
      const dietary = groupsToDietaryValues(allergens);
      if (dietary.length) a.dietary = dietary;
      break;
    }
    case 'media': {
      const band = youngestBrightWatchBand(children);
      if (band) a.age = band;
      break;
    }
  }
  return a;
}

// ── Save-back: quiz answers → profile patch ────────────────────────────────────

/** Map a tool's completed quiz answers to a canonical profile patch (owned fields only). */
export function quizAnswersToProfilePatch(answers: QuizAnswers, toolId: ToolId): Partial<FamilyProfile> {
  const patch: Partial<FamilyProfile> = {};

  switch (toolId) {
    case 'childcare': {
      // Sprout is the SOLE writer of children.
      if (Array.isArray(answers.childAges)) {
        patch.children = sproutBandsToChildren(answers.childAges as string[]);
      }
      const ctx = definedOnly({
        zip: answers.zip as string | undefined,
        householdIncomeUsd:
          typeof answers.income === 'string' ? SPROUT_BRACKET_USD[answers.income] : undefined,
      });
      if (Object.keys(ctx).length) patch.context = ctx;
      break;
    }
    case 'health': {
      const ctx = definedOnly({
        zip: answers.zip as string | undefined,
        householdSize:
          typeof answers.householdSize === 'string'
            ? HG_TO_CANONICAL[answers.householdSize]
            : undefined,
        // HealthGuide's income is a numeric slider — store it exactly.
        householdIncomeUsd: typeof answers.income === 'number' ? answers.income : undefined,
      });
      if (Object.keys(ctx).length) patch.context = ctx;
      break;
    }
    case 'meal': {
      if (Array.isArray(answers.dietary)) {
        patch.allergens = dietaryValuesToGroups(answers.dietary as string[]);
      }
      const ctx = definedOnly({
        zip: answers.zip as string | undefined,
        householdSize: answers.householdSize as FamilyContext['householdSize'] | undefined,
      });
      if (Object.keys(ctx).length) patch.context = ctx;
      break;
    }
    case 'media':
      // BrightWatch owns no profile-writable fields (age is read-only pre-fill).
      break;
  }
  return patch;
}

/** Pure merge: last-write-wins per provided field; context shallow-merges. */
export function mergeProfile(existing: FamilyProfile | null, patch: Partial<FamilyProfile>): FamilyProfile {
  const base = existing ?? EMPTY_PROFILE;
  return {
    children: patch.children ?? base.children,
    allergens: patch.allergens ?? base.allergens,
    context: { ...base.context, ...(patch.context ?? {}) },
  };
}

// ── Supabase IO (RLS-enforced via publishable key) ────────────────────────────

export async function getFamilyProfile(supabase: SupabaseClient): Promise<FamilyProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('family_profiles')
    .select('children, allergens, context')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    children: (data.children as FamilyChild[]) ?? [],
    allergens: (data.allergens as AllergenGroup[]) ?? [],
    context: (data.context as FamilyContext) ?? {},
  };
}

/** Merge a patch into the user's single profile row (insert if none). No-op when signed out. */
export async function saveFamilyProfilePatch(
  supabase: SupabaseClient,
  patch: Partial<FamilyProfile>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (!patch.children && !patch.allergens && !patch.context) return;

  const existing = await getFamilyProfile(supabase);
  const merged = mergeProfile(existing, patch);

  await supabase.from('family_profiles').upsert(
    {
      user_id: user.id,
      children: merged.children,
      allergens: merged.allergens,
      context: merged.context,
    },
    { onConflict: 'user_id' },
  );
}
