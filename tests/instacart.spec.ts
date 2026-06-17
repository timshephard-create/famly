import { test, expect, Page } from '@playwright/test';
import { selectAutoAdvance, fillTextAndContinue, setSliderAndContinue, selectMultiAndContinue, dismissEmailCapture, waitForResults } from './helpers';

/**
 * Instacart shoppable-list integration.
 * /api/nourish is fixtured so results render deterministically;
 * /api/instacart/list is mocked per scenario (live smoke runs separately).
 * The hard contract under test: Nourish NEVER errors because of Instacart.
 */

const meal = (name: string) => ({ name, prepTime: '15 min', cost: '$3.00' });
const day = (d: string) => ({
  day: d,
  breakfast: meal('Oatmeal'),
  lunch: meal('Turkey wrap'),
  dinner: { ...meal('Sheet-pan chicken'), steps: ['Roast it'], tip: 'Double it for leftovers' },
});

const NOURISH_FIXTURE = {
  weeklyPlan: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day),
  shoppingList: [
    { item: 'Chicken thighs (3 lbs)', quantity: '1 pack', estimatedCost: '$8.50', category: 'Protein' },
    { item: 'Bananas', quantity: '6', estimatedCost: '$1.80', category: 'Produce' },
    { item: 'Milk (1 gallon)', quantity: '1', estimatedCost: '$3.20', category: 'Dairy' },
  ],
  weeklyTotal: '$84.50',
  savingsTips: ['Frozen veg is just as good and half the price.'],
  insight: 'A calm week of dinners on your budget.',
};

async function completeNourishQuiz(page: Page) {
  await page.route('**/api/nourish', (route) => route.fulfill({ json: { data: NOURISH_FIXTURE } }));
  await page.route('**/api/nearby-stores', (route) => route.fulfill({ json: { stores: [] } }));
  await page.goto('/nourish');
  await selectAutoAdvance(page, 'How many people are you feeding', '2 people');
  await setSliderAndContinue(page, 'weekly grocery budget', 100);
  await selectMultiAndContinue(page, 'dietary preferences', ['No restrictions']);
  await selectAutoAdvance(page, 'time do you have to cook', 'Minimal');
  await fillTextAndContinue(page, 'ZIP code', '76009');
  await dismissEmailCapture(page);
  await waitForResults(page);
}

test.describe('Instacart shoppable list', () => {
  test.setTimeout(90000);

  test('happy path: button creates link, opens new tab, fires GA4 event', async ({ page, context }) => {
    await completeNourishQuiz(page);
    await page.route('**/api/instacart/list', (route) =>
      route.fulfill({ json: { url: 'https://customers.dev.instacart.tools/store/shopping_lists/test123', ambiguous: [] } }),
    );

    const button = page.getByTestId('instacart-button');
    await expect(button).toBeVisible();

    const popupPromise = context.waitForEvent('page');
    await button.click();
    const popup = await popupPromise;
    expect(popup.url()).toContain('instacart');

    const fired = await page.evaluate(() =>
      (window as unknown as { dataLayer?: unknown[] }).dataLayer?.some((e) =>
        Array.from(e as ArrayLike<unknown>).includes('instacart_list_created'),
      ),
    );
    expect(fired).toBe(true);
  });

  test('degradation: API failure leaves the plain list fully usable, no error UI', async ({ page }) => {
    await completeNourishQuiz(page);
    await page.route('**/api/instacart/list', (route) =>
      route.fulfill({ status: 503, json: { error: 'unavailable' } }),
    );

    await page.getByTestId('instacart-button').click();

    // Quiet fallback note, button gone, list + copy/print intact, no error state
    await expect(page.getByTestId('instacart-fallback')).toBeVisible();
    await expect(page.getByTestId('instacart-button')).toHaveCount(0);
    await expect(page.getByText('Chicken thighs')).toBeVisible();
    await expect(page.locator('button:has-text("Copy List")')).toBeVisible();
    await expect(page.locator('button:has-text("Print List")')).toBeVisible();
    await expect(page.getByText('Oops')).not.toBeVisible();
  });

  test('shopping list renders complete without ever touching Instacart', async ({ page }) => {
    await completeNourishQuiz(page);
    await expect(page.getByRole('heading', { name: 'Shopping List' })).toBeVisible();
    await expect(page.getByText('Bananas')).toBeVisible();
    await expect(page.getByText('$84.50').first()).toBeVisible();
  });
});
