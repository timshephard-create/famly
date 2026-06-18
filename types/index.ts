import type { ToolId } from '@/config/platform';

// --- Places ---

export interface PlaceResult {
  name: string;
  address: string;
  phone: string | null;
  rating: number | null;
  totalRatings: number;
  hours: string[] | null;
  distance: string | null;
  placeId: string;
  mapsUrl: string;
}

// --- Sprout ---

export interface SproutProfile {
  situation: string;
  childAges: string[];
  zip: string;
  income: string;
  schedule: string;
  budget: number;
}

export interface SavingsBreakdown {
  ccdf: number;
  fsa: number;
  ctc: number;
  total: number;
}

// --- HealthGuide ---

export interface HealthProfile {
  householdSize: string;
  income: number;
  employerCoverage: string;
  healthUsage: string;
  priority: string;
  doctorImportance: string;
  riskTolerance: string;
}

export type PlanRank = 'best' | 'strong' | 'consider';

export interface PlanRecommendation {
  rank: PlanRank;
  rankLabel: string;
  name: string;
  why: string;
  pros: string[];
  watchOut: string[];
}

// --- BrightWatch ---

export interface BrightWatchRecommendation {
  name: string;
  type: 'TV Show' | 'App' | 'Game';
  platform: string;
  score: number;
  stimulation: 'Low' | 'Medium' | 'High';
  why: string;
  tip: string;
  viewing_type?: 'together' | 'independent' | 'either';
}

export interface BrightWatchResponse {
  insight: string;
  recommendations: BrightWatchRecommendation[];
  avoid: string;
}

// --- Nourish ---

export interface NourishMeal {
  name: string;
  prepTime: string;
  cost: string;
  steps?: string[];
  tip?: string;
}

export interface NourishDay {
  day: string;
  breakfast: NourishMeal;
  lunch: NourishMeal;
  dinner: NourishMeal;
}

export interface NourishShoppingItem {
  item: string;
  quantity: string;
  estimatedCost: string;
  category: 'Produce' | 'Protein' | 'Dairy' | 'Pantry' | 'Frozen';
}

export interface NourishStoreStrategy {
  category: string;
  bestStore: string;
  reason: string;
  estimatedSavings: string;
}

export interface NourishResponse {
  weeklyPlan: NourishDay[];
  shoppingList: NourishShoppingItem[];
  weeklyTotal: string;
  savingsTips: string[];
  insight: string;
  storeStrategy?: NourishStoreStrategy[];
  splitShoppingPlan?: string;
  /** Deterministic allergen scan results (Phase 4A). Present when the family
   *  declared an allergen; UI renders an unmissable warning. */
  allergenWarnings?: AllergenWarning[];
  /** True when the plan was served from fallback due to the spend ceiling. */
  degraded?: boolean;
}

export interface AllergenWarning {
  allergen: string;
  matchedTerms: string[];
  affectedItems: string[];
}

export interface NearbyStore {
  chain: string;
  name: string;
  address: string;
  distance: string;
  phone: string | null;
  hours: string | null;
  mapsUrl: string;
  placeId: string;
}

// --- CMS Health Plans ---

export interface CMSPlanResult {
  id: string;
  name: string;
  issuer: string;
  metalLevel: string;
  type: string;
  monthlyPremium: number;
  monthlyWithSubsidy: number;
  annualDeductible: number;
  annualMoop: number;
  benefitsUrl: string;
  subsidyAmount: number;
}

// --- Lead / Email ---

export interface LeadInput {
  name: string;
  email: string;
  tool: string;
  profileSummary?: string;
}

export interface EmailInput {
  name: string;
  email: string;
  tool: string;
}

// --- API Responses ---

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// --- Quiz ---

export type QuestionType = 'single' | 'multi' | 'text' | 'slider';

export interface QuizOption {
  value: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  label: string;
  helpText?: string;
  options?: QuizOption[];
  autoAdvance?: boolean;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  validate?: (value: string) => string | null;
  shouldShow?: (answers: Record<string, string | string[] | number>) => boolean;
}
