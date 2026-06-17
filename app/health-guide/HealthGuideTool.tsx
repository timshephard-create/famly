'use client';

import { useState, useCallback } from 'react';
import { TOOLS } from '@/config/platform';
import QuizShell from '@/components/QuizShell';
import EmailCapture from '@/components/EmailCapture';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import PlanCard from '@/components/PlanCard';
import AIInsightBlock from '@/components/AIInsightBlock';
import CrossToolFooter from '@/components/CrossToolFooter';
import RecommendationDisclaimer from '@/components/RecommendationDisclaimer';
import PremiumWaitlistCard from '@/components/PremiumWaitlistCard';
import PlanComparisonCard from '@/components/health/PlanComparisonCard';
import { generateRecommendations } from '@/lib/healthguide-logic';
import { calculateHealthCosts, type UserHealthInputs, type HealthCostResult } from '@/lib/health-calculations';
import type { PlanRecommendation, HealthProfile, CMSPlanResult } from '@/types';
import type { QuizQuestion } from '@/types';

const tool = TOOLS.health;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUIZ QUESTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const questions: QuizQuestion[] = [
  // Q1 — Always show
  {
    id: 'coverageReason',
    type: 'single',
    label: 'Why are you looking for coverage?',
    helpText: 'This helps us route you to the right options.',
    autoAdvance: true,
    options: [
      { value: 'lost_job', label: 'I recently lost job-based coverage' },
      { value: 'too_expensive', label: 'My current plan is too expensive' },
      { value: 'never_had', label: "I've never had insurance" },
      { value: 'life_change', label: 'Life change (marriage, baby, moved states)' },
      { value: 'self_employed', label: "I'm self-employed or a freelancer" },
      { value: 'exploring', label: 'Just exploring my options' },
    ],
  },
  // Q2 — Always show
  {
    id: 'hasChildren',
    type: 'single',
    label: 'Are there children under 19 in your household?',
    autoAdvance: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  // Q3 — ONLY if Q1 = lost_job
  {
    id: 'daysSinceLostCoverage',
    type: 'single',
    label: 'How long ago did you lose coverage?',
    autoAdvance: true,
    shouldShow: (a) => a.coverageReason === 'lost_job',
    options: [
      { value: 'under_30', label: 'Less than 30 days ago' },
      { value: '30_60', label: '30\u201360 days ago' },
      { value: 'over_60', label: 'More than 60 days ago' },
    ],
  },
  // Q4 — Always show
  {
    id: 'faithCommunityMember',
    type: 'single',
    label: 'Are you a member of a faith community?',
    helpText: 'This determines if health sharing options are relevant for you.',
    autoAdvance: true,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  // Q5 — Always show
  {
    id: 'zip',
    type: 'text',
    label: 'What\u2019s your ZIP code?',
    helpText: 'We\u2019ll look up real plans available in your area.',
    placeholder: 'e.g. 78701',
    validate: (v: string) => /^\d{5}$/.test(v) ? null : 'Please enter a 5-digit ZIP code',
  },
  // Q6 — Always show
  {
    id: 'householdSize',
    type: 'single',
    label: 'What\u2019s your household size?',
    autoAdvance: true,
    options: [
      { value: 'just_me', label: 'Just me' },
      { value: 'me_partner', label: 'Me + partner' },
      { value: 'family_3_4', label: 'Family of 3\u20134' },
      { value: 'family_5_plus', label: 'Family of 5+' },
    ],
  },
  // Q7 — Always show
  {
    id: 'income',
    type: 'slider',
    label: 'What\u2019s your annual household income?',
    helpText: 'This helps us estimate subsidy eligibility.',
    min: 20000,
    max: 250000,
    step: 5000,
    prefix: '$',
  },
  // Q8 — Skip if lost_job or never_had
  {
    id: 'employerCoverage',
    type: 'single',
    label: 'Do you have employer-sponsored coverage?',
    autoAdvance: true,
    shouldShow: (a) => a.coverageReason !== 'lost_job' && a.coverageReason !== 'never_had',
    options: [
      { value: 'good', label: 'Yes \u2014 good coverage (70%+)' },
      { value: 'poor', label: 'Yes \u2014 but poor coverage (<70%)' },
      { value: 'none', label: 'No employer coverage' },
      { value: 'medicaid', label: 'Currently on Medicaid' },
    ],
  },
  // Q9 — Always show
  {
    id: 'healthUsage',
    type: 'single',
    label: 'How often does your family use healthcare?',
    autoAdvance: true,
    options: [
      { value: 'minimal', label: 'Minimal \u2014 yearly checkup only' },
      { value: 'moderate', label: 'Moderate \u2014 a few visits per year' },
      { value: 'frequent', label: 'Frequent \u2014 ongoing care or prescriptions' },
      { value: 'unpredictable', label: 'Unpredictable \u2014 young kids, expect surprises' },
    ],
  },
  // Q10 — Always show
  {
    id: 'priority',
    type: 'single',
    label: 'What matters most to you in a plan?',
    autoAdvance: true,
    options: [
      { value: 'lowest_premium', label: 'Lowest monthly premium' },
      { value: 'low_oop', label: 'Low out-of-pocket costs' },
      { value: 'balance', label: 'Balance of both' },
      { value: 'want_hsa', label: 'I want an HSA' },
    ],
  },
  // Q11 — Always show (reworded)
  {
    id: 'doctorImportance',
    type: 'single',
    label: 'Do you have doctors you want to be able to keep seeing?',
    autoAdvance: true,
    options: [
      { value: 'essential', label: 'Yes \u2014 must keep my doctors' },
      { value: 'preferred', label: 'Preferred but flexible' },
      { value: 'open', label: 'Open to finding new doctors' },
    ],
  },
  // Q12 — Always show
  {
    id: 'riskTolerance',
    type: 'single',
    label: 'How much financial risk are you comfortable with?',
    helpText: 'Higher risk = lower premiums but higher potential out-of-pocket costs.',
    autoAdvance: true,
    options: [
      { value: 'low', label: 'Low \u2014 I want predictability' },
      { value: 'medium', label: 'Medium \u2014 some risk is fine' },
      { value: 'high', label: 'High \u2014 I\u2019ll gamble on lower premiums' },
    ],
  },
  // Q13 — Always show
  {
    id: 'planMembers',
    type: 'single',
    label: 'How many people are on this plan?',
    autoAdvance: true,
    options: [
      { value: 'just_me', label: 'Just me' },
      { value: 'me_spouse', label: 'Me + spouse' },
      { value: 'me_kids', label: 'Me + kids' },
      { value: 'whole_family', label: 'Whole family' },
    ],
  },
  // Q14 — Always show
  {
    id: 'prescriptions',
    type: 'single',
    label: 'Any ongoing prescriptions?',
    autoAdvance: true,
    options: [
      { value: 'none', label: 'None' },
      { value: 'generic', label: 'Generic only' },
      { value: 'brand', label: 'Brand name' },
    ],
  },
  // Q15 — Always show
  {
    id: 'specialistVisits',
    type: 'single',
    label: 'Specialist visits expected this year?',
    autoAdvance: true,
    options: [
      { value: 'none', label: 'None' },
      { value: '1_3', label: '1\u20133 visits' },
      { value: '4_8', label: '4\u20138 visits' },
      { value: '8_plus', label: '8+' },
    ],
  },
  // Q16 — Always show
  {
    id: 'plannedProcedures',
    type: 'single',
    label: 'Any planned procedures this year?',
    autoAdvance: true,
    options: [
      { value: 'none', label: 'None' },
      { value: 'pregnancy', label: 'Pregnancy / delivery' },
      { value: 'surgery', label: 'Surgery' },
      { value: 'dental', label: 'Major dental' },
    ],
  },
  // Q17 — Always show
  {
    id: 'cashFlowComfort',
    type: 'single',
    label: 'If you got a $3,000 medical bill tomorrow, could you pay it?',
    autoAdvance: true,
    options: [
      { value: 'comfortable', label: 'Yes, comfortably' },
      { value: 'tight', label: 'Yes, but it would hurt' },
      { value: 'no', label: 'No' },
    ],
  },
  // Q18 — Skip if lost_job, never_had, or no employer coverage
  {
    id: 'employerHsa',
    type: 'single',
    label: 'Does your employer offer an HSA-eligible plan?',
    autoAdvance: true,
    shouldShow: (a) => {
      if (a.coverageReason === 'lost_job' || a.coverageReason === 'never_had') return false;
      if (a.employerCoverage === 'none' || a.employerCoverage === 'medicaid') return false;
      // Also show if they want HSA regardless
      if (a.priority === 'want_hsa') return true;
      return true;
    },
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  // Q19 — Always show
  {
    id: 'incomeBracket',
    type: 'single',
    label: 'Rough household income bracket?',
    helpText: 'For tax savings calculation only.',
    autoAdvance: true,
    options: [
      { value: '30k_under', label: '$30k or under' },
      { value: '31_60k', label: '$31\u2013$60k' },
      { value: '61_100k', label: '$61\u2013$100k' },
      { value: '101k_plus', label: '$101k+' },
    ],
  },
];

const KEY_TERMS = [
  { term: 'Deductible', definition: 'The amount you pay out-of-pocket before your insurance starts covering costs.' },
  { term: 'OOP Max', definition: 'The most you\'ll pay in a year. After this, your plan covers 100% of covered services.' },
  { term: 'Premium', definition: 'Your monthly payment to keep your insurance active, regardless of whether you use it.' },
  { term: 'HSA', definition: 'Health Savings Account \u2014 a tax-advantaged savings account for medical expenses, paired with high-deductible plans.' },
  { term: 'ACA Subsidy', definition: 'Government financial help to lower your Marketplace premium, based on income and household size.' },
  { term: 'Copay', definition: 'A fixed amount you pay for a covered service (e.g., $25 for a doctor visit).' },
  { term: 'Network', definition: 'The group of doctors, hospitals, and pharmacies your plan has agreements with for lower rates.' },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUB-COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const METAL_COLORS: Record<string, string> = {
  Bronze: 'bg-[#CD7F32] text-white', Silver: 'bg-[#C0C0C0] text-charcoal',
  Gold: 'bg-[#FFD700] text-charcoal', Platinum: 'bg-[#E5E4E2] text-charcoal', Catastrophic: 'bg-mid text-white',
};

function RealPlanCard({ plan }: { plan: CMSPlanResult }) {
  const hasSubsidy = plan.subsidyAmount > 0 && plan.monthlyWithSubsidy < plan.monthlyPremium;
  const metalClass = METAL_COLORS[plan.metalLevel] || METAL_COLORS.Bronze;
  return (
    <div className="rounded-2xl border border-border bg-white p-5 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${metalClass}`}>{plan.metalLevel}</span>
        <span className="text-xs text-mid">{plan.type}</span>
      </div>
      <h3 className="mb-1 font-display text-lg font-bold text-charcoal">{plan.name}</h3>
      <p className="mb-3 text-xs text-mid">{plan.issuer}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="text-xs text-mid">Monthly</p>{hasSubsidy ? (<><p className="text-sm font-bold text-sky">{fmt(plan.monthlyWithSubsidy)}<span className="text-xs font-normal">/mo</span></p><p className="text-xs text-mid line-through">{fmt(plan.monthlyPremium)}/mo</p></>) : (<p className="text-sm font-bold text-charcoal">{fmt(plan.monthlyPremium)}<span className="text-xs font-normal">/mo</span></p>)}</div>
        <div><p className="text-xs text-mid">Deductible</p><p className="text-sm font-bold text-charcoal">{fmt(plan.annualDeductible)}</p></div>
        <div><p className="text-xs text-mid">OOP Max</p><p className="text-sm font-bold text-charcoal">{fmt(plan.annualMoop)}</p></div>
        {hasSubsidy && <div><p className="text-xs text-mid">Subsidy</p><p className="text-sm font-bold text-sage">Est. {fmt(plan.subsidyAmount)}/mo</p></div>}
      </div>
      <div className="flex gap-2">
        {plan.benefitsUrl && <a href={plan.benefitsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-xs font-medium text-charcoal hover:bg-cream">View Plan Details &rarr;</a>}
        <a href="https://www.healthcare.gov" target="_blank" rel="noopener noreferrer" className="flex-1 rounded-lg bg-sky px-3 py-2 text-center text-xs font-medium text-white hover:bg-sky-light">Enroll on Healthcare.gov &rarr;</a>
      </div>
    </div>
  );
}

function PlansSkeleton() {
  return (<div className="mb-8 animate-pulse space-y-4"><div className="h-7 w-56 rounded bg-border/50" /><div className="h-4 w-72 rounded bg-border/30" />{[1, 2, 3].map((i) => (<div key={i} className="rounded-2xl border border-border bg-white p-5"><div className="mb-3 h-5 w-20 rounded bg-border/50" /><div className="mb-2 h-6 w-48 rounded bg-border/40" /><div className="grid grid-cols-3 gap-3"><div className="h-10 rounded bg-border/30" /><div className="h-10 rounded bg-border/30" /><div className="h-10 rounded bg-border/30" /></div></div>))}</div>);
}

function OptionCard({ title, bestFor, pros, cons, ctaLabel, ctaUrl, note }: {
  title: string; bestFor: string; pros: string[]; cons?: string[]; ctaLabel: string; ctaUrl: string; note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h3 className="mb-1 font-display text-base font-bold text-charcoal">{title}</h3>
      <p className="mb-3 text-xs italic text-mid">{bestFor}</p>
      <ul className="mb-2 space-y-1">{pros.map((p, i) => <li key={i} className="flex items-start gap-2 text-xs text-charcoal"><span className="mt-0.5 text-sage">&#10003;</span>{p}</li>)}</ul>
      {cons && cons.length > 0 && <ul className="mb-3 space-y-1">{cons.map((c, i) => <li key={i} className="flex items-start gap-2 text-xs text-mid"><span className="mt-0.5 text-gold-dark">&#9888;</span>{c}</li>)}</ul>}
      {note && <p className="mb-3 text-xs text-mid">{note}</p>}
      <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-sky px-4 py-2 text-xs font-semibold text-white hover:bg-sky-light">{ctaLabel} &rarr;</a>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROUTING CARDS (Part 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isTexasZip(zip: string): boolean {
  const prefix = parseInt(zip?.slice(0, 3) || '0', 10);
  return prefix >= 750 && prefix <= 799;
}

function RoutingCards({ answers }: { answers: Record<string, string | string[] | number> }) {
  const hasKids = answers.hasChildren === 'yes';
  const reason = answers.coverageReason as string;
  const daysSince = answers.daysSinceLostCoverage as string;
  const income = answers.income as number;
  const zip = answers.zip as string || '';
  const householdSize = answers.householdSize as string;
  const isFamily = householdSize === 'family_3_4' || householdSize === 'family_5_plus' || householdSize === 'me_partner';
  const showCobra = reason === 'lost_job' && (daysSince === 'under_30' || daysSince === '30_60');
  const isTexas = isTexasZip(zip);
  const showCoverageGap = isFamily && income < 31000;
  const showChip = hasKids;

  if (!showChip && !showCobra && !showCoverageGap) return null;

  return (
    <div className="mb-8 space-y-4">
      <h2 className="font-display text-xl font-bold text-charcoal">Important for your situation</h2>

      {showChip && (
        <div className="rounded-2xl border-2 border-sage bg-sage-pale p-5" data-testid="chip-card">
          <h3 className="mb-2 font-display text-base font-bold text-sage">Your kids may qualify for CHIP</h3>
          <p className="mb-3 text-sm leading-relaxed text-charcoal">
            In Texas, families earning up to about $60,000 for a family of 4 may qualify for free or low-cost coverage for their children through the Children&apos;s Health Insurance Program, regardless of your own insurance situation. We recommend checking CHIP eligibility first &mdash; it&apos;s often free.
          </p>
          <a href="https://www.hhs.texas.gov/services/health/medicaid-chip" target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-sage px-4 py-2 text-xs font-semibold text-white hover:bg-sage-light">Check CHIP eligibility in Texas &rarr;</a>
          <p className="mt-3 text-xs text-mid">Your kids&apos; coverage may be sorted. Let&apos;s now find the best option for the adults.</p>
        </div>
      )}

      {showCobra && (
        <div className="rounded-2xl border-2 border-gold bg-gold-pale p-5" data-testid="cobra-card">
          <h3 className="mb-2 font-display text-base font-bold text-gold-dark">You have a COBRA decision to make</h3>
          <p className="mb-2 text-sm leading-relaxed text-charcoal">
            When you lose employer coverage, you have 60 days to elect COBRA &mdash; which lets you keep your exact same plan and doctors. After 60 days, that window closes permanently.
          </p>
          <div className="mb-2 text-xs text-charcoal">
            <p className="font-semibold">COBRA keeps:</p>
            <p>Your doctors, your network, your deductible progress</p>
            <p className="mt-1 font-semibold">COBRA costs:</p>
            <p>Full premium (often $500&ndash;$1,500/month for a family) plus a 2% admin fee</p>
          </div>
          <p className="text-xs text-mid">Marketplace plans may cost less (especially with subsidies) but you start fresh with a new network. We&apos;ll show you both options so you can compare.</p>
        </div>
      )}

      {showCoverageGap && (
        <div className="rounded-2xl border-2 border-[#B85C3A] bg-[#FDF0EC] p-5" data-testid="coverage-gap-card">
          {isTexas ? (
            <>
              <h3 className="mb-2 font-display text-base font-bold text-[#B85C3A]">Texas coverage gap &mdash; know your options</h3>
              <p className="mb-2 text-sm leading-relaxed text-charcoal">
                Texas has not expanded Medicaid under the ACA. If your household income is below about $31,000 for a family of 4, you may fall into the &ldquo;coverage gap&rdquo; &mdash; earning too much for traditional Medicaid but too little for meaningful marketplace subsidies.
              </p>
              <p className="mb-2 text-xs font-semibold text-charcoal">If you&apos;re in this gap, here are your real options:</p>
              <ul className="mb-3 space-y-1 text-xs text-charcoal">
                <li>&#8226; Federally Qualified Health Centers (FQHCs) &mdash; sliding scale fees based on income</li>
                <li>&#8226; Your children likely qualify for CHIP regardless</li>
                <li>&#8226; Community health programs through your county</li>
                <li>&#8226; Short-term health plans as a bridge (limited coverage, not ACA-compliant)</li>
              </ul>
              <a href="https://findahealthcenter.hrsa.gov" target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-[#B85C3A] px-4 py-2 text-xs font-semibold text-white hover:opacity-90">Find an FQHC near you &rarr;</a>
            </>
          ) : (
            <>
              <h3 className="mb-2 font-display text-base font-bold text-sage">Your state expanded Medicaid</h3>
              <p className="mb-2 text-sm leading-relaxed text-charcoal">
                Based on your income, you may qualify for free or low-cost Medicaid coverage. Your state expanded Medicaid under the ACA, which means adults at your income level are eligible.
              </p>
              <a href="https://www.medicaid.gov/about-us/beneficiary-resources/index.html" target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-sage px-4 py-2 text-xs font-semibold text-white hover:bg-sage-light">Check Medicaid eligibility &rarr;</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ALL YOUR OPTIONS (Part 2 + 5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AllOptionsSection({ answers }: { answers: Record<string, string | string[] | number> }) {
  const employer = answers.employerCoverage as string;
  const hasKids = answers.hasChildren === 'yes';
  const reason = answers.coverageReason as string;
  const daysSince = answers.daysSinceLostCoverage as string;
  const usage = answers.healthUsage as string;
  const priority = answers.priority as string;
  const income = answers.income as number;
  const faith = answers.faithCommunityMember === 'yes';
  const showCobra = reason === 'lost_job' && (daysSince === 'under_30' || daysSince === '30_60');
  const isHdhp = priority === 'want_hsa' || usage === 'minimal';
  const aboveSubsidy = income > 100000;
  const hasMixedHousehold = (answers.planMembers === 'me_spouse' || answers.planMembers === 'whole_family' || answers.planMembers === 'me_kids');
  const hasEmployerForOne = answers.employerCoverage === 'good' || answers.employerCoverage === 'poor';
  const showSplitCoverage = hasMixedHousehold && (hasEmployerForOne || aboveSubsidy);

  return (
    <section className="mt-10">
      <h2 className="mb-4 font-display text-xl font-bold text-charcoal">All Your Options</h2>
      <div className="space-y-4">
        {employer !== 'good' && (
          <OptionCard title="ACA Marketplace Plans" bestFor="Best for: Most uninsured families"
            pros={['Subsidies can dramatically reduce cost', 'Comprehensive ACA coverage', 'Guaranteed coverage regardless of pre-existing conditions']}
            cons={['Network may differ from current doctors']}
            ctaLabel="Browse plans on Healthcare.gov" ctaUrl="https://www.healthcare.gov" />
        )}

        {hasKids && (
          <OptionCard title="CHIP (Children's Health Insurance Program)" bestFor="Best for: Kids in families who don't qualify for Medicaid"
            pros={['Often free or very low cost', 'Comprehensive pediatric coverage', "Separate from adult coverage \u2014 kids can have CHIP while parents use marketplace"]}
            cons={['Income limits apply']}
            ctaLabel="Check Texas CHIP eligibility" ctaUrl="https://www.hhs.texas.gov/services/health/medicaid-chip" />
        )}

        {showCobra && (
          <OptionCard title="COBRA Continuation Coverage" bestFor="Best for: Families mid-treatment or with preferred doctors"
            pros={['Keep exact same plan and doctors', 'Keep deductible progress from current year']}
            cons={['You pay full premium + 2% fee', 'Usually $800\u2013$2,000/month for families', 'Only available for 18 months']}
            ctaLabel="Contact your HR department" ctaUrl="https://www.dol.gov/general/topic/health-plans/cobra" />
        )}

        {isHdhp && (
          <OptionCard title="Direct Primary Care + Catastrophic Coverage" bestFor="Best for: Generally healthy families wanting lower monthly costs"
            pros={['Unlimited primary care visits for flat monthly fee ($50\u2013$150)', 'Transparent cash pricing for everything else', 'Catastrophic plan covers emergencies']}
            cons={['Not traditional insurance \u2014 specialist and hospital care paid separately', 'Works best when you\'re healthy']}
            ctaLabel="Find DPC practices near you" ctaUrl="https://www.dpcfrontier.com" />
        )}

        {(aboveSubsidy || reason === 'self_employed') && (
          <OptionCard title="Off-Marketplace Direct from Insurer" bestFor="Best for: Families over the subsidy income threshold"
            pros={['Same ACA plans, purchased directly from BCBS, Aetna, UHC etc.']}
            note="No subsidies available this way \u2014 only consider if you don't qualify for marketplace subsidies."
            ctaLabel="Compare insurers directly" ctaUrl="https://www.healthcare.gov/see-plans/" />
        )}

        {faith && (
          <OptionCard title="Health Sharing Ministries" bestFor="Best for: Healthy families in faith communities"
            pros={['Often lower monthly costs than insurance', 'Community-based model']}
            cons={['NOT insurance \u2014 no guarantee of payment', 'Pre-existing conditions often excluded', 'Not regulated by state insurance laws']}
            ctaLabel="Learn about health sharing" ctaUrl="https://www.healthcare.gov/other-coverage/health-sharing/" />
        )}

        {/* Part 5 — Two-Plan Strategy */}
        {showSplitCoverage && (
          <div className="rounded-2xl border-2 border-sky-light bg-sky-pale p-5">
            <h3 className="mb-1 font-display text-base font-bold text-sky">Split Coverage Strategy</h3>
            <p className="mb-2 text-xs italic text-mid">Best for: Couples with different health needs or income situations</p>
            <p className="mb-2 text-sm text-charcoal">Each person in a household can be on a different insurance plan. This is legal and sometimes optimal.</p>
            <p className="mb-1 text-xs font-semibold text-charcoal">When it makes sense:</p>
            <ul className="mb-2 space-y-1 text-xs text-charcoal">
              <li>&#10003; One spouse has expensive ongoing care (put on better plan)</li>
              <li>&#10003; One spouse has employer coverage available while other uses marketplace</li>
              <li>&#10003; Income differences affect subsidy eligibility</li>
              <li>&#10003; Children on CHIP while parents use marketplace</li>
            </ul>
            <p className="text-xs text-mid">This is exactly what many families do and it&apos;s rarely explained anywhere.</p>
          </div>
        )}

        {/* Always show FQHC */}
        <OptionCard title="Federally Qualified Health Centers (FQHCs)" bestFor="Best for: Anyone needing affordable primary care regardless of insurance"
          pros={['Sliding scale fees based on income', 'Available in most Texas counties', 'Dental, mental health, and primary care', 'Serves insured and uninsured']}
          note="This is not insurance but a resource for affordable care."
          ctaLabel="Find an FQHC near you" ctaUrl="https://findahealthcenter.hrsa.gov" />
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CASH PAY SECTION (Part 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CashPaySection({ costResult }: { costResult: HealthCostResult }) {
  const winner = costResult.recommendation.winner;
  const deductible = winner.plan.annualDeductible;
  const oop = winner.estimatedOop;
  const underDeductible = oop < deductible;

  return (
    <section className="mt-10" data-testid="cash-pay-section">
      <h2 className="mb-4 font-display text-xl font-bold text-charcoal">Should you pay cash or use insurance?</h2>
      {underDeductible ? (
        <div className="rounded-2xl border border-border bg-white p-5">
          <p className="mb-3 text-sm leading-relaxed text-charcoal">
            Based on your estimated healthcare usage, you&apos;re unlikely to hit your {fmt(deductible)} deductible this year. That means insurance won&apos;t kick in for most of your expenses &mdash; making cash pay worth considering for routine care.
          </p>
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold text-sage">When cash pay makes sense:</p>
            <ul className="space-y-0.5 text-xs text-charcoal">
              <li>&#10003; Routine doctor visits and sick visits</li>
              <li>&#10003; Lab work and basic diagnostics</li>
              <li>&#10003; Prescriptions (check GoodRx first)</li>
            </ul>
          </div>
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold text-sky">When to go through insurance:</p>
            <ul className="space-y-0.5 text-xs text-charcoal">
              <li>&#10003; Specialist visits if you&apos;re close to your deductible</li>
              <li>&#10003; Any planned procedure or surgery</li>
              <li>&#10003; Emergency care</li>
            </ul>
          </div>
          <div className="rounded-xl bg-cream p-4">
            <p className="mb-1 text-xs font-semibold text-charcoal">Cash pay resources:</p>
            <ul className="space-y-1 text-xs text-charcoal">
              <li>&#8226; <a href="https://mdsave.com" target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">MDsave.com</a> &mdash; bundled procedure pricing</li>
              <li>&#8226; <a href="https://goodrx.com" target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">GoodRx.com</a> &mdash; prescription cash prices</li>
              <li>&#8226; Call any provider and ask: &ldquo;What is your cash pay rate?&rdquo; &mdash; most discount 20&ndash;40%</li>
              <li>&#8226; <a href="https://findahealthcenter.hrsa.gov" target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">FQHCs</a> &mdash; sliding scale for primary care</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white p-5">
          <p className="mb-3 text-sm leading-relaxed text-charcoal">
            Based on your expected healthcare usage, you&apos;re likely to hit or approach your {fmt(deductible)} deductible. Running expenses through insurance makes more sense &mdash; every dollar counts toward your deductible, and once you hit it, insurance starts covering costs.
          </p>
          <div className="rounded-xl bg-gold-pale p-4">
            <p className="text-xs font-semibold text-gold-dark">Exception &mdash; prescriptions:</p>
            <p className="mt-1 text-xs leading-relaxed text-charcoal">
              Always check <a href="https://goodrx.com" target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">GoodRx.com</a> before filling a prescription. If the GoodRx cash price is lower than your insurance copay, use GoodRx. Note: GoodRx purchases don&apos;t count toward your deductible.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HSA OPTIMIZATION GUIDE (Part 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function HSAGuide({ hsaAnalysis }: { hsaAnalysis: HealthCostResult['hsaAnalysis'] }) {
  return (
    <section className="mt-10" data-testid="hsa-guide">
      <h2 className="mb-4 font-display text-xl font-bold text-charcoal">HSA Strategies most people don&apos;t know about</h2>
      <div className="space-y-4">
        {/* Strategy 1 */}
        <div className="rounded-2xl border border-sage-light/40 bg-sage-pale p-5">
          <h3 className="mb-2 text-sm font-bold text-sage">Strategy 1: Max your contribution</h3>
          <p className="mb-2 text-xs text-charcoal">2025 HSA limits: Individual {fmt(4300)} / Family {fmt(8550)} (55+: add {fmt(1000)} catch-up)</p>
          <p className="mb-2 text-xs text-charcoal">Your estimated tax savings at your income bracket: <strong className="text-sage">{fmt(hsaAnalysis.annualTaxSavings)}/year</strong></p>
          <p className="text-xs text-mid">Every dollar contributed reduces your taxable income. Employer contributions are free money &mdash; always accept the full match.</p>
        </div>

        {/* Strategy 2 */}
        <div className="rounded-2xl border border-border bg-white p-5">
          <h3 className="mb-2 text-sm font-bold text-charcoal">Strategy 2: The receipt strategy (almost nobody knows this)</h3>
          <p className="mb-2 text-xs leading-relaxed text-charcoal">
            Pay medical expenses out of pocket. Save every receipt. Reimburse yourself from your HSA later &mdash; years or even decades later if you want.
          </p>
          <p className="mb-2 text-xs leading-relaxed text-charcoal">
            Your HSA can be invested like a 401k. If you pay $500 cash for medical care today and let that $500 sit invested in your HSA for 10 years at 7% average return, it grows to ~$985. Then you withdraw $500 tax-free to reimburse yourself &mdash; and keep the $485 growth.
          </p>
          <p className="mb-2 text-xs leading-relaxed text-charcoal">
            There is no IRS deadline for reimbursement as long as the expense occurred after you opened your HSA.
          </p>
          <p className="text-xs text-mid">What to do: Keep a simple spreadsheet or folder of medical receipts with the date and amount. These are future tax-free withdrawals.</p>
        </div>

        {/* Strategy 3 */}
        <div className="rounded-2xl border border-border bg-white p-5">
          <h3 className="mb-2 text-sm font-bold text-charcoal">Strategy 3: HSA as retirement account</h3>
          <p className="text-xs leading-relaxed text-charcoal">
            After age 65, HSA funds can be withdrawn for ANY reason (not just medical) and taxed like a traditional IRA &mdash; making it effectively a bonus retirement account with triple tax advantages: (1) pre-tax contributions, (2) tax-free growth, (3) tax-free withdrawals for medical (or taxed like IRA after 65).
          </p>
        </div>

        {/* Strategy 4 */}
        <div className="rounded-2xl border border-border bg-white p-5">
          <h3 className="mb-2 text-sm font-bold text-charcoal">Strategy 4: GoodRx vs HSA</h3>
          <ul className="space-y-1 text-xs text-charcoal">
            <li>&#8226; If GoodRx is cheaper: pay cash with GoodRx (does NOT count toward deductible but saves money now)</li>
            <li>&#8226; If insurance copay is cheaper: pay through insurance (counts toward deductible)</li>
            <li>&#8226; You can pay GoodRx price using your HSA debit card &mdash; it counts as a qualified medical expense</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function HealthGuideTool() {
  const [phase, setPhase] = useState<'quiz' | 'loading' | 'email' | 'results'>('quiz');
  const [plans, setPlans] = useState<PlanRecommendation[]>([]);
  const [realPlans, setRealPlans] = useState<CMSPlanResult[]>([]);
  const [costResult, setCostResult] = useState<HealthCostResult | null>(null);
  const [realPlansLoading, setRealPlansLoading] = useState(true);
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(true);
  const [emailData, setEmailData] = useState<Record<string, unknown>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[] | number>>({});
  const [error, setError] = useState(false);

  const handleComplete = useCallback(async (answers: Record<string, string | string[] | number>) => {
    setPhase('loading');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setError(false);
    setRealPlansLoading(true);
    setQuizAnswers(answers);

    try {
      // Default employerCoverage when Q8 was skipped (lost_job → none, never_had → none)
      const reason = answers.coverageReason as string;
      let employerCov = answers.employerCoverage as string;
      if (!employerCov || employerCov === 'undefined') {
        employerCov = reason === 'lost_job' || reason === 'never_had' ? 'none' : 'none';
      }

      const profile: HealthProfile = {
        householdSize: answers.householdSize as string,
        income: answers.income as number,
        employerCoverage: employerCov,
        healthUsage: answers.healthUsage as string,
        priority: answers.priority as string,
        doctorImportance: answers.doctorImportance as string,
        riskTolerance: answers.riskTolerance as string,
      };

      const healthInputs: UserHealthInputs = {
        planMembers: (answers.planMembers as UserHealthInputs['planMembers']) || 'just_me',
        prescriptions: (answers.prescriptions as UserHealthInputs['prescriptions']) || 'none',
        specialistVisits: (answers.specialistVisits as UserHealthInputs['specialistVisits']) || 'none',
        plannedProcedures: (answers.plannedProcedures as UserHealthInputs['plannedProcedures']) || 'none',
        cashFlowComfort: (answers.cashFlowComfort as UserHealthInputs['cashFlowComfort']) || 'comfortable',
        employerHsa: (answers.employerHsa as UserHealthInputs['employerHsa']) || 'no',
        incomeBracket: (answers.incomeBracket as UserHealthInputs['incomeBracket']) || '31_60k',
        coverageReason: answers.coverageReason as string,
        hasChildren: answers.hasChildren === 'yes',
        daysSinceLostCoverage: answers.daysSinceLostCoverage as string,
        faithCommunityMember: answers.faithCommunityMember === 'yes',
      };

      const recommendations = generateRecommendations(profile);
      setPlans(recommendations);

      const topPlan = recommendations[0];
      setEmailData({
        topPlanName: topPlan?.name,
        topPlanWhy: topPlan?.why,
        topWatchOut: topPlan?.watchOut?.[0],
        employerCoverage: profile.employerCoverage,
      });

      // Fetch AI insight in background
      setInsightLoading(true);
      fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'health', profile: answers }),
      })
        .then((r) => r.json())
        .then((data) => {
          setInsight(data.data?.insight || '');
          setInsightLoading(false);
        })
        .catch(() => setInsightLoading(false));

      // Fetch CMS real plans + run decision engine.
      // costResult (which powers the cash-pay + HSA sections) ONLY comes from
      // this path, so fetch whenever those sections will show — not just for
      // none/poor employer coverage. Otherwise an HDHP / HSA / tight-cash-flow
      // profile with good employer coverage silently loses those sections.
      const zip = answers.zip as string;
      const needsCostDetail =
        profile.employerCoverage === 'none' ||
        profile.employerCoverage === 'poor' ||
        answers.priority === 'want_hsa' ||
        answers.employerHsa === 'yes' ||
        answers.cashFlowComfort === 'tight' ||
        answers.cashFlowComfort === 'no';
      if (zip && needsCostDetail) {
        fetch('/api/health-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zip, income: profile.income, householdSize: profile.householdSize }),
        })
          .then((r) => r.json())
          .then((data) => {
            const fetchedPlans = (data.data || []) as CMSPlanResult[];
            setRealPlans(fetchedPlans);
            if (fetchedPlans.length >= 1) {
              const result = calculateHealthCosts(fetchedPlans, healthInputs);
              setCostResult(result);
            }
            setRealPlansLoading(false);
          })
          .catch(() => setRealPlansLoading(false));
      } else {
        setRealPlansLoading(false);
      }

      setPhase('email');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(true);
      setPhase('results');
    }
  }, []);

  if (phase === 'quiz') {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-sky-pale px-5 py-8 text-center">
          <span className="text-3xl">{tool.icon}</span>
          <h1 className="mt-2 font-display text-3xl font-bold text-charcoal">{tool.name}</h1>
          <p className="mt-1 text-sm text-mid">{tool.badge} Navigator</p>
        </div>
        <QuizShell toolColor={tool.color} toolId={tool.id} questions={questions} onComplete={handleComplete} />
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-cream">
        <LoadingState color="sky" messages={['Analyzing your situation...', 'Running cost scenarios...', 'Looking up plans in your area...', 'Preparing your recommendations...']} />
      </div>
    );
  }

  if (error || plans.length === 0) {
    return (
      <div className="min-h-screen bg-cream">
        <ErrorState message="We couldn't generate your recommendations. Please try again." onRetry={() => setPhase('quiz')} />
      </div>
    );
  }

  const isHdhp = costResult?.recommendation?.winner?.plan?.type?.toLowerCase().includes('hdhp') ||
    costResult?.recommendation?.winner?.plan?.name?.toLowerCase().includes('hsa') ||
    quizAnswers.priority === 'want_hsa' ||
    quizAnswers.employerHsa === 'yes';

  // Show cash pay for HDHP profiles OR families with tight cash flow
  const showCashPay = isHdhp || quizAnswers.cashFlowComfort === 'tight' || quizAnswers.cashFlowComfort === 'no';

  // Show HSA guide when HSA eligible OR marketplace HSA plan recommended OR user wants HSA
  const showHsaGuide = costResult?.hsaAnalysis?.eligible ||
    quizAnswers.priority === 'want_hsa' ||
    costResult?.recommendation?.winner?.plan?.name?.toLowerCase().includes('hsa');

  // Coverage gap: Texas ZIP + low income family — marketplace subsidy recommendation contradicts gap reality
  const zip = quizAnswers.zip as string || '';
  const txPrefix = parseInt(zip.slice(0, 3) || '0', 10);
  const isTexasZipResult = txPrefix >= 750 && txPrefix <= 799;
  const householdStr = quizAnswers.householdSize as string;
  const isFamilyResult = householdStr === 'family_3_4' || householdStr === 'family_5_plus' || householdStr === 'me_partner';
  const incomeVal = quizAnswers.income as number;
  const isCoverageGap = isFamilyResult && incomeVal < 31000 && isTexasZipResult;
  const hasKidsResult = quizAnswers.hasChildren === 'yes';

  return (
    <div className="min-h-screen bg-cream">
      {phase === 'email' && (
        <EmailCapture tool={tool} emailResultsData={emailData} onDismiss={() => setPhase('results')} />
      )}

      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12" data-testid="results-container">
        <h1 className="mb-2 font-display text-3xl font-bold text-charcoal sm:text-4xl">Your Plan Analysis</h1>
        <p className="mb-8 text-sm text-mid">Based on your profile, here are your best options.</p>

        {/* Part 1 — Routing Cards */}
        <RoutingCards answers={quizAnswers} />

        {/* AI Insight */}
        {insightLoading ? (
          <div className="mb-8 rounded-2xl border border-sky-light/30 bg-sky-pale p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-mid">
                Generating your personalized insight&hellip;
              </span>
            </div>
            <div className="animate-pulse space-y-2">
              <div className="h-4 w-full rounded bg-sky-light/20" />
              <div className="h-4 w-5/6 rounded bg-sky-light/20" />
              <div className="h-4 w-3/4 rounded bg-sky-light/20" />
            </div>
          </div>
        ) : insight ? (
          <div className="mb-8 transition-opacity duration-500">
            <AIInsightBlock insight={insight} color="sky" />
          </div>
        ) : null}

        {/* Decision Engine Comparison */}
        {costResult && (
          <section className="mb-10">
            <h2 className="mb-1 font-display text-xl font-bold text-charcoal">Cost Comparison</h2>
            <p className="mb-4 text-sm text-mid">Based on your expected healthcare usage, prescriptions, and procedures.</p>
            <div data-testid="plan-comparison-card"><PlanComparisonCard recommendation={costResult.recommendation} hsaAnalysis={costResult.hsaAnalysis} /></div>
          </section>
        )}

        {/* Coverage gap path — replace normal recommendations */}
        {isCoverageGap ? (
          <>
            {/* Best path for coverage gap families */}
            <section className="mb-10">
              <h2 className="mb-4 font-display text-xl font-bold text-charcoal">Your best path right now</h2>
              <div className="space-y-4">
                {hasKidsResult && (
                  <div className="rounded-2xl border-2 border-sage bg-sage-pale p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-sage px-3 py-1 text-xs font-bold text-white">Step 1</span>
                      <h3 className="font-display text-base font-bold text-charcoal">CHIP for your children</h3>
                    </div>
                    <p className="mb-3 text-sm leading-relaxed text-charcoal">
                      Your children likely qualify for CHIP regardless of your own coverage situation. CHIP provides comprehensive pediatric coverage &mdash; often free or very low cost &mdash; including doctor visits, prescriptions, dental, and vision.
                    </p>
                    <a href="https://www.hhs.texas.gov/services/health/medicaid-chip" target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-sage px-4 py-2 text-xs font-semibold text-white hover:bg-sage-light">Check CHIP eligibility &rarr;</a>
                  </div>
                )}

                <div className="rounded-2xl border-2 border-sky bg-sky-pale p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-sky px-3 py-1 text-xs font-bold text-white">{hasKidsResult ? 'Step 2' : 'Step 1'}</span>
                    <h3 className="font-display text-base font-bold text-charcoal">Federally Qualified Health Centers for adults</h3>
                  </div>
                  <p className="mb-3 text-sm leading-relaxed text-charcoal">
                    FQHCs offer primary care, dental, mental health, and prescriptions on a sliding scale based on your income. They serve everyone &mdash; insured or uninsured &mdash; and are available in most Texas counties.
                  </p>
                  <a href="https://findahealthcenter.hrsa.gov" target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-sky px-4 py-2 text-xs font-semibold text-white hover:bg-sky-light">Find an FQHC near you &rarr;</a>
                </div>

                <div className="rounded-xl border border-border bg-white p-5">
                  <p className="text-sm leading-relaxed text-charcoal">
                    <strong>If your income changes:</strong> If your household income rises above approximately $31,000 for a family of 4, you become eligible for meaningful ACA Marketplace subsidies that can make insurance surprisingly affordable. The plans below show what would be available at that point.
                  </p>
                </div>
              </div>
            </section>

            {/* CMS Plans shown as future reference */}
            {realPlansLoading ? (
              <PlansSkeleton />
            ) : realPlans.length > 0 ? (
              <section className="mb-10 opacity-80">
                <h2 className="mb-1 font-display text-xl font-bold text-charcoal">If your income changes</h2>
                <p className="mb-4 text-sm text-mid">These plans become available with subsidies if your income rises above the coverage gap threshold.</p>
                <div className="space-y-4">{realPlans.map((plan) => <RealPlanCard key={plan.id} plan={plan} />)}</div>
              </section>
            ) : null}
          </>
        ) : (
          <>
            {/* Normal path — Real CMS Plans */}
            {realPlansLoading ? (
              <PlansSkeleton />
            ) : realPlans.length > 0 ? (
              <section className="mb-10">
                <h2 className="mb-1 font-display text-xl font-bold text-charcoal">Plans Available in Your Area</h2>
                <p className="mb-4 text-sm text-mid">Real plans from Healthcare.gov &mdash; updated for {new Date().getFullYear()}</p>
                <div className="space-y-4">{realPlans.map((plan) => <RealPlanCard key={plan.id} plan={plan} />)}</div>
                <p className="mt-3 text-xs leading-relaxed text-mid">
                  Plan data from the Federal Health Insurance Marketplace. Premiums shown are estimates. Always verify on Healthcare.gov before enrolling.
                </p>
              </section>
            ) : null}

            {/* Our Recommendation (deterministic) */}
            <section>
              <h2 className="mb-4 font-display text-xl font-bold text-charcoal">Our Recommendation</h2>
              <div className="space-y-6">{plans.map((plan, i) => <PlanCard key={i} plan={plan} />)}</div>
            </section>
          </>
        )}

        {/* Part 3 — Cash Pay (HDHP/HSA or tight cash flow) */}
        {showCashPay && costResult && <CashPaySection costResult={costResult} />}

        {/* Part 4 — HSA Guide (eligible, wants HSA, or HSA plan recommended) */}
        {showHsaGuide && costResult && <HSAGuide hsaAnalysis={costResult.hsaAnalysis} />}

        {/* Graceful degradation: these sections need live plan data (costResult).
            If it couldn't be computed, say so explicitly — never render nothing. */}
        {(showCashPay || showHsaGuide) && !costResult && !realPlansLoading && (
          <section data-testid="cost-detail-unavailable" className="mt-10 rounded-xl border border-border bg-white p-6">
            <h2 className="mb-2 font-display text-xl font-bold text-charcoal">
              Cash-pay &amp; HSA guidance needs your local plan data
            </h2>
            <p className="text-sm text-mid">
              We couldn&apos;t pull live marketplace plans for your area just now, so we&apos;re holding
              back the cash-pay and HSA breakdown rather than show you numbers we can&apos;t stand behind.
              Add or recheck your ZIP code and try again, or compare plans directly at{' '}
              <a href="https://www.healthcare.gov" target="_blank" rel="noopener noreferrer" className="font-semibold text-sky underline">
                healthcare.gov
              </a>.
            </p>
          </section>
        )}

        {/* Part 2 + 5 — All Options + Split Coverage */}
        <AllOptionsSection answers={quizAnswers} />

        {/* Key Terms */}
        <section className="mt-12">
          <h2 className="mb-4 font-display text-xl font-bold text-charcoal">Key Terms Glossary</h2>
          <div className="space-y-3">{KEY_TERMS.map((item) => (
            <div key={item.term} className="rounded-xl border border-border bg-white p-4">
              <p className="text-sm font-semibold text-charcoal">{item.term}</p>
              <p className="mt-1 text-sm text-mid">{item.definition}</p>
            </div>
          ))}</div>
        </section>

        {/* Action Strip */}
        <section className="mt-8 rounded-2xl bg-clover p-6 sm:p-8">
          <h2 className="mb-4 font-display text-xl font-bold text-white">Ready to take action?</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <a href="https://www.healthcare.gov" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-sky px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-sky-light">Browse ACA Plans &rarr;</a>
            <a href="https://www.medicaid.gov/about-us/beneficiary-resources/index.html" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/20">Check Medicaid Eligibility</a>
            <a href="https://www.policygenius.com" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white/10 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/20">Talk to a Free Broker</a>
          </div>
        </section>

        <PremiumWaitlistCard toolId={tool.id} />

        <RecommendationDisclaimer tool="health" />
        <CrossToolFooter currentToolId={tool.id} />
      </div>
    </div>
  );
}
