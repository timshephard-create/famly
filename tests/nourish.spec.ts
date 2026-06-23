import { test, expect } from '@playwright/test';
import {
  selectAutoAdvance,
  fillTextAndContinue,
  setSliderAndContinue,
  selectMultiAndContinue,
  dismissEmailCapture,
  waitForResults,
  assertNoError,
} from './helpers';

test.describe('Nourish', () => {
  test.setTimeout(130000); // full AI plan (~5k tokens, 8000 cap) is slower than the old truncated fallback; +headroom for 3-worker concurrency

  test('Profile 1 — Nut allergy family', async ({ page }) => {
    await page.goto('/nourish');
    await page.waitForSelector('h2', { timeout: 10000 });

    // Q1: householdSize (auto-advance)
    await selectAutoAdvance(page, 'How many people', 'Family of 3');
    // Q2: budget (slider + continue)
    await setSliderAndContinue(page, 'weekly grocery budget', 200);
    // Q3: dietary (multi-select + continue)
    await selectMultiAndContinue(page, 'dietary preferences', ['Nut allergy']);
    // Q4: cookingTime (auto-advance)
    await selectAutoAdvance(page, 'time do you have to cook', 'Moderate');
    // Q5: zip (text + continue)
    await fillTextAndContinue(page, 'ZIP code', '76009');

    await dismissEmailCapture(page);
    await waitForResults(page, 110000);

    await expect(page.locator('[data-testid="results-container"]')).toBeVisible();
    await expect(page.getByText('Monday', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="disclaimer"]')).toBeVisible();
    await assertNoError(page);
  });

  test('Profile 2 — Vegan family', async ({ page }) => {
    await page.goto('/nourish');
    await page.waitForSelector('h2', { timeout: 10000 });

    await selectAutoAdvance(page, 'How many people', 'Family of 3');
    await setSliderAndContinue(page, 'weekly grocery budget', 125);
    await selectMultiAndContinue(page, 'dietary preferences', ['Vegan']);
    await selectAutoAdvance(page, 'time do you have to cook', 'Minimal');
    await fillTextAndContinue(page, 'ZIP code', '76009');

    await dismissEmailCapture(page);
    await waitForResults(page, 110000);

    await expect(page.locator('[data-testid="results-container"]')).toBeVisible();
    await assertNoError(page);
  });

  test('Profile 3 — Multiple restrictions', async ({ page }) => {
    await page.goto('/nourish');
    await page.waitForSelector('h2', { timeout: 10000 });

    await selectAutoAdvance(page, 'How many people', 'Family of 3');
    await setSliderAndContinue(page, 'weekly grocery budget', 200);
    await selectMultiAndContinue(page, 'dietary preferences', ['Gluten-free', 'Dairy-free']);
    await selectAutoAdvance(page, 'time do you have to cook', 'Moderate');
    await fillTextAndContinue(page, 'ZIP code', '76009');

    await dismissEmailCapture(page);
    await waitForResults(page, 110000);

    await expect(page.locator('[data-testid="results-container"]')).toBeVisible();
    await expect(page.getByText('Monday', { exact: true })).toBeVisible();
  });

  test('Profile 4 — Large family, tight budget', async ({ page }) => {
    await page.goto('/nourish');
    await page.waitForSelector('h2', { timeout: 10000 });

    await selectAutoAdvance(page, 'How many people', 'Family of 5');
    await setSliderAndContinue(page, 'weekly grocery budget', 100);
    await selectMultiAndContinue(page, 'dietary preferences', ['No restrictions']);
    await selectAutoAdvance(page, 'time do you have to cook', 'Batch cooking');
    await fillTextAndContinue(page, 'ZIP code', '76009');

    await dismissEmailCapture(page);
    await waitForResults(page, 110000);

    await expect(page.locator('[data-testid="results-container"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shopping List' })).toBeVisible();
    await assertNoError(page);
  });
});
