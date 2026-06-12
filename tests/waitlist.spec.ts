import { test, expect } from '@playwright/test';

test.describe('Waitlist Page', () => {
  test('Waitlist page loads with all elements', async ({ page }) => {
    await page.goto('/waitlist');
    // networkidle never settles with live analytics beacons (Clarity/GA)
    await page.waitForLoadState('domcontentloaded');

    // Page loads without error
    await expect(page.getByText('Oops')).not.toBeVisible();

    // Hero content
    await expect(page.getByRole('heading', { name: /Kindora Premium/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /founding member/ })).toBeVisible();

    // Email form
    const form = page.locator('[data-testid="waitlist-page-form"]');
    await expect(form).toBeVisible();
    await expect(form.locator('input[type="email"]')).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeVisible();

    // All 4 tool Premium cards
    await expect(page.getByText('HealthGuide Premium')).toBeVisible();
    await expect(page.getByText('Sprout Premium')).toBeVisible();
    await expect(page.getByText('BrightWatch Premium')).toBeVisible();
    await expect(page.getByText('Nourish Premium')).toBeVisible();

    // Footer links
    await expect(page.locator('[data-testid="footer-privacy-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="footer-terms-link"]')).toBeVisible();
  });

  test('Form shows success state after submit', async ({ page }) => {
    await page.goto('/waitlist');
    // networkidle never settles with live analytics beacons (Clarity/GA)
    await page.waitForLoadState('domcontentloaded');

    const form = page.locator('[data-testid="waitlist-page-form"]');
    await form.locator('input[type="email"]').fill('playwright-test@kindora-test.com');
    await form.locator('button[type="submit"]').click();

    // Wait for success state
    await expect(page.getByText("You're on the list")).toBeVisible({ timeout: 10000 });

    // Form input no longer visible
    await expect(form.locator('input[type="email"]')).not.toBeVisible();
  });
});
