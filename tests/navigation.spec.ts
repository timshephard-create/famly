import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('Home page loads with all tool cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Kindora/);
    await expect(page.locator('nav')).toContainText(/kindora/i);
    await expect(page.getByText('Sprout')).toBeVisible();
    await expect(page.getByText('HealthGuide')).toBeVisible();
    await expect(page.getByText('BrightWatch')).toBeVisible();
    await expect(page.getByText('Nourish')).toBeVisible();
    await expect(page.locator('a[href="/sprout"]')).toBeVisible();
    await expect(page.locator('a[href="/health-guide"]')).toBeVisible();
    await expect(page.locator('a[href="/bright-watch"]')).toBeVisible();
    await expect(page.locator('a[href="/nourish"]')).toBeVisible();
  });

  test('Each tool page loads without error', async ({ page }) => {
    for (const path of ['/sprout', '/health-guide', '/bright-watch', '/nourish']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('nav')).toContainText(/kindora/i);
      await expect(page.getByText('All Tools')).toBeVisible();
      // Quiz loads — first question visible
      await expect(page.locator('h2').first()).toBeVisible();
    }
  });

  test('Footer links present on home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const privacyLink = page.locator('[data-testid="footer-privacy-link"]');
    const termsLink = page.locator('[data-testid="footer-terms-link"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute('href', '/privacy');
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveAttribute('href', '/terms');
  });

  test('Footer links present on tool page', async ({ page }) => {
    await page.goto('/sprout');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('[data-testid="footer-privacy-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="footer-terms-link"]')).toBeVisible();
  });
});
