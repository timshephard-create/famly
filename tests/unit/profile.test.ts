import { describe, expect, it, vi } from 'vitest';
import type { FamilyProfile } from '@/types/profile';
import {
  profileToInitialAnswers,
  quizAnswersToProfilePatch,
  mergeProfile,
  childrenToSproutBands,
  sproutBandsToChildren,
  youngestBrightWatchBand,
  getFamilyProfile,
  saveFamilyProfilePatch,
} from '@/lib/profile';

const sorted = (a: unknown[]) => [...(a as string[])].sort();

describe('children band mapping (ageMonths is storage-only)', () => {
  it('round-trips Sprout bands → children → bands losslessly', () => {
    const bands = ['infant', 'toddler', 'preschool', 'prek'];
    const children = sproutBandsToChildren(bands);
    expect(sorted(childrenToSproutBands(children))).toEqual(sorted(bands));
  });

  it('collapses duplicate bands to a set (Sprout has no count)', () => {
    const children = [{ ageMonths: 6 }, { ageMonths: 8 }]; // both infants
    expect(childrenToSproutBands(children)).toEqual(['infant']);
  });

  it('pre-fills BrightWatch from the youngest child', () => {
    expect(youngestBrightWatchBand([{ ageMonths: 40 }, { ageMonths: 6 }])).toBe('under_12m');
    expect(youngestBrightWatchBand([])).toBeNull();
  });
});

describe('profileToInitialAnswers', () => {
  const profile: FamilyProfile = {
    children: [{ ageMonths: 6 }, { ageMonths: 42 }],
    allergens: ['peanut', 'treenut', 'milk'],
    context: { zip: '76009', householdSize: '3-4', householdIncomeUsd: 55000 },
  };

  it('Sprout: child bands + zip + income bracket', () => {
    const a = profileToInitialAnswers(profile, 'childcare');
    expect(sorted(a.childAges as string[])).toEqual(['infant', 'preschool']);
    expect(a.zip).toBe('76009');
    expect(a.income).toBe('35k_60k');
  });

  it('HealthGuide: zip + household token + numeric income + bracket + hasChildren', () => {
    const a = profileToInitialAnswers(profile, 'health');
    expect(a.zip).toBe('76009');
    expect(a.householdSize).toBe('family_3_4');
    expect(a.income).toBe(55000);
    expect(a.incomeBracket).toBe('31_60k');
    expect(a.hasChildren).toBe('yes');
  });

  it('Nourish: zip + household + dietary from canonical allergens', () => {
    const a = profileToInitialAnswers(profile, 'meal');
    expect(a.zip).toBe('76009');
    expect(a.householdSize).toBe('3-4');
    expect(sorted(a.dietary as string[])).toEqual(['dairy-free', 'nut-allergy']);
  });

  it('BrightWatch: youngest child age band only', () => {
    expect(profileToInitialAnswers(profile, 'media')).toEqual({ age: 'under_12m' });
  });

  it('omits keys with no stored data', () => {
    const empty: FamilyProfile = { children: [], allergens: [], context: {} };
    expect(profileToInitialAnswers(empty, 'childcare')).toEqual({});
    expect(profileToInitialAnswers(empty, 'health')).toEqual({});
  });
});

describe('quizAnswersToProfilePatch', () => {
  it('Sprout writes children + zip + bracket-midpoint income', () => {
    const patch = quizAnswersToProfilePatch(
      { childAges: ['infant', 'preschool'], zip: '76009', income: '35k_60k' },
      'childcare',
    );
    expect(patch.children).toEqual([{ ageMonths: 6 }, { ageMonths: 42 }]);
    expect(patch.context).toEqual({ zip: '76009', householdIncomeUsd: 47500 });
  });

  it('Nourish writes canonical allergens + household + zip', () => {
    const patch = quizAnswersToProfilePatch(
      { dietary: ['nut-allergy', 'dairy-free'], householdSize: '3-4', zip: '76009' },
      'meal',
    );
    expect(sorted(patch.allergens as string[])).toEqual(['milk', 'peanut', 'treenut']);
    expect(patch.context).toEqual({ householdSize: '3-4', zip: '76009' });
  });

  it('HealthGuide writes exact numeric income, never children', () => {
    const patch = quizAnswersToProfilePatch(
      { householdSize: 'family_5_plus', income: 82000, hasChildren: 'yes', zip: '76009' },
      'health',
    );
    expect(patch.children).toBeUndefined();
    expect(patch.context).toEqual({ householdSize: '5+', householdIncomeUsd: 82000, zip: '76009' });
  });

  it('BrightWatch writes nothing to the profile', () => {
    expect(quizAnswersToProfilePatch({ age: '2_3y', context: 'learning' }, 'media')).toEqual({});
  });
});

describe('mergeProfile (last-write-wins per field; context shallow-merges)', () => {
  const base: FamilyProfile = {
    children: [{ ageMonths: 6 }],
    allergens: ['milk'],
    context: { zip: '11111', householdSize: '2' },
  };

  it('merges context keys without dropping existing ones', () => {
    const merged = mergeProfile(base, { context: { householdIncomeUsd: 50000 } });
    expect(merged.context).toEqual({ zip: '11111', householdSize: '2', householdIncomeUsd: 50000 });
    expect(merged.children).toBe(base.children);
    expect(merged.allergens).toBe(base.allergens);
  });

  it('replaces children/allergens only when provided', () => {
    const merged = mergeProfile(base, { allergens: ['peanut', 'treenut'] });
    expect(merged.allergens).toEqual(['peanut', 'treenut']);
    expect(merged.children).toBe(base.children);
  });

  it('starts from empty when there is no existing profile', () => {
    expect(mergeProfile(null, { context: { zip: '5' } })).toEqual({
      children: [],
      allergens: [],
      context: { zip: '5' },
    });
  });
});

// ── Supabase IO (mocked client) ───────────────────────────────────────────────

function mockClient(opts: {
  user: { id: string } | null;
  row?: Record<string, unknown> | null;
  upsert?: (table: string, row: unknown, options: unknown) => void;
}) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
    upsert: async (row: unknown, options: unknown) => {
      opts.upsert?.('family_profiles', row, options);
      return { data: null, error: null };
    },
  };
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: () => query,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('getFamilyProfile / saveFamilyProfilePatch', () => {
  it('returns null when signed out', async () => {
    expect(await getFamilyProfile(mockClient({ user: null }))).toBeNull();
  });

  it('maps a row into the canonical FamilyProfile', async () => {
    const client = mockClient({
      user: { id: 'u1' },
      row: { children: [{ ageMonths: 6 }], allergens: ['milk'], context: { zip: '76009' } },
    });
    expect(await getFamilyProfile(client)).toEqual({
      children: [{ ageMonths: 6 }],
      allergens: ['milk'],
      context: { zip: '76009' },
    });
  });

  it('upserts the merged profile keyed on user_id', async () => {
    const upsert = vi.fn();
    const client = mockClient({
      user: { id: 'u1' },
      row: { children: [], allergens: [], context: { zip: '11111' } },
      upsert,
    });
    await saveFamilyProfilePatch(client, { context: { householdSize: '2' } });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [, row, options] = upsert.mock.calls[0];
    expect(row).toMatchObject({ user_id: 'u1', context: { zip: '11111', householdSize: '2' } });
    expect(options).toEqual({ onConflict: 'user_id' });
  });

  it('is a no-op when signed out', async () => {
    const upsert = vi.fn();
    await saveFamilyProfilePatch(mockClient({ user: null, upsert }), { context: { zip: '5' } });
    expect(upsert).not.toHaveBeenCalled();
  });
});
