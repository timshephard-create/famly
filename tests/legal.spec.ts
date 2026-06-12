import { test, expect } from '@playwright/test';

test.describe('Legal Pages', () => {
  test('Privacy Policy page loads with correct content', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Kindora/);
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText('Creative Mind Ventures LLC').first()).toBeVisible();
    await expect(page.getByText('tim@timshephard.co').first()).toBeVisible();
    await expect(page.getByText('kindora.world').first()).toBeVisible();
  });

  test('Terms of Service page loads with correct content', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Kindora/);
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText('Creative Mind Ventures LLC').first()).toBeVisible();
    await expect(page.getByText('Texas').first()).toBeVisible();
    await expect(page.getByText('tim@timshephard.co').first()).toBeVisible();
    await expect(page.getByText('educational and informational purposes only')).toBeVisible();
  });

  test('Privacy link in footer navigates to /privacy', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="footer-privacy-link"]').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('Terms link in footer navigates to /terms', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="footer-terms-link"]').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });
});
