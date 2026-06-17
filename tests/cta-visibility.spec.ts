import { test, expect, Page } from '@playwright/test';
import { selectAutoAdvance } from './helpers';

/**
 * CTA visibility regression suite.
 *
 * Guards against the legacy-token bug where bg-sage/bg-sky/bg-gold/bg-terra
 * (and --sage/--border/--white CSS vars) emitted no CSS, leaving primary
 * CTAs as white text on the cream page. Asserts COMPUTED styles — a green
 * build is not sufficient proof (see CLAUDE.md verification rule).
 */

const CLOVER = 'rgb(14, 107, 67)';
const CLOVER_DARK = 'rgb(8, 81, 50)'; // hover/pressed state
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const continueButton = (page: Page) =>
  page.locator('button:has-text("Continue"), button:has-text("See my results")').first();

async function bgColor(page: Page, selectorHandle: ReturnType<Page['locator']>) {
  return selectorHandle.evaluate((el) => getComputedStyle(el).backgroundColor);
}

async function assertCloverCta(page: Page, button: ReturnType<Page['locator']>) {
  await expect(button).toBeVisible();
  const bg = await bgColor(page, button);
  // Clover at rest, Clover-dark if the pointer happens to hover it
  expect([CLOVER, CLOVER_DARK], 'CTA must have a solid Clover fill, not transparent').toContain(bg);
  const color = await button.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(255, 255, 255)');
}

const viewports = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
];

for (const vp of viewports) {
  test.describe(`CTA visibility — ${vp.name}`, () => {
    test.use({ viewport: vp.viewport });
    test.setTimeout(60000);

    test('Sprout: Continue is Clover, disabled-but-visible, enabled on answer, advances', async ({ page }) => {
      await page.goto('/sprout');
      await selectAutoAdvance(page, 'describes your situation', 'Actively looking for care');

      // Multi-select question — Continue rendered, no answer yet
      await page.waitForSelector('h2:has-text("How old are your children")');
      const cta = continueButton(page);
      await expect(cta).toBeDisabled();
      // Disabled state must still be VISIBLE: solid fill + reduced opacity, never transparent
      const disabledBg = await bgColor(page, cta);
      expect(disabledBg).not.toBe(TRANSPARENT);
      expect(disabledBg).toBe(CLOVER);
      const opacity = await cta.evaluate((el) => getComputedStyle(el).opacity);
      expect(parseFloat(opacity)).toBeGreaterThanOrEqual(0.3);

      // Answer exists -> enabled, full Clover + white text
      await page.locator('button').filter({ hasText: /^\s*Toddler/ }).first().click();
      await expect(cta).toBeEnabled();
      await assertCloverCta(page, cta);

      // Click advances
      await cta.click();
      await expect(page.locator('h2:has-text("ZIP code")')).toBeVisible({ timeout: 5000 });

      // Progress bar fill is Clover (was invisible pre-fix)
      const fill = page.locator('.h-1\\.5 > div').first();
      expect(await bgColor(page, fill)).toBe(CLOVER);
    });

    test('HealthGuide: ZIP Continue is Clover, enabled on value, advances', async ({ page }) => {
      await page.goto('/health-guide');
      await selectAutoAdvance(page, 'looking for coverage', 'I recently lost job-based coverage');
      await selectAutoAdvance(page, 'children under 19', 'Yes');
      await selectAutoAdvance(page, 'How long ago did you lose coverage', 'Less than 30 days ago');
      await selectAutoAdvance(page, 'faith community', 'No');

      await page.waitForSelector('h2:has-text("ZIP code")');
      const cta = continueButton(page);
      await expect(cta).toBeDisabled();
      expect(await bgColor(page, cta)).toBe(CLOVER);

      await page.locator('input[type="text"]').fill('76009');
      await expect(cta).toBeEnabled();
      await assertCloverCta(page, cta);

      await cta.click();
      await expect(page.locator('h2:has-text("household size")')).toBeVisible({ timeout: 5000 });
    });

    test('BrightWatch: option buttons visible and advance; capture CTA is Clover when shown', async ({ page }) => {
      await page.goto('/bright-watch');
      // All questions auto-advance — the options ARE the CTAs here
      await page.waitForSelector('h2:has-text("How old is your child")');
      const option = page.locator('button').filter({ hasText: /^\s*2–3 years/ }).first();
      await expect(option).toBeVisible();
      await option.click();
      await expect(page.locator('h2:has-text("viewing context")')).toBeVisible({ timeout: 5000 });

      await selectAutoAdvance(page, 'viewing context', 'Learning time');
      await selectAutoAdvance(page, 'What type of content', 'TV shows');

      // Email capture (if shown) submit must be Clover; otherwise results render
      const send = page.locator('button:has-text("Send")').first();
      const results = page.locator('[data-testid="results-container"]');
      await expect(send.or(results).first()).toBeVisible({ timeout: 50000 });
      if (await send.isVisible().catch(() => false)) {
        await assertCloverCta(page, send);
      } else {
        await expect(results).toBeVisible();
      }
      await expect(page.getByText('Oops')).not.toBeVisible();
    });

    test('Nourish: budget slider thumb is Clover, Continue enables and advances', async ({ page }) => {
      await page.goto('/nourish');
      await selectAutoAdvance(page, 'How many people are you feeding', '2 people');

      await page.waitForSelector('h2:has-text("weekly grocery budget")');
      const cta = continueButton(page);
      await expect(cta).toBeDisabled();
      expect(await bgColor(page, cta)).toBe(CLOVER);

      // Slider thumb (the famously invisible Nourish budget thumb).
      // Chromium won't compute ::-webkit-slider-thumb styles, so prove it
      // two ways: the thumb rule exists with a var(--sage) fill, and
      // --sage resolves to Clover in the live cascade.
      const slider = page.locator('input[type="range"]');
      const thumbRuleBg = await page.evaluate(() => {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule && rule.selectorText.includes('::-webkit-slider-thumb')) {
              return rule.style.background || rule.style.backgroundColor;
            }
          }
        }
        return null;
      });
      expect(thumbRuleBg, 'thumb rule must exist with a token fill').toContain('var(--sage)');
      const sageResolved = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--sage').trim().toUpperCase(),
      );
      expect(sageResolved, '--sage must resolve to Clover').toBe('#0E6B43');
      // Track gradient must reference resolved colors (no undefined vars -> transparent)
      const trackBg = await slider.evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(trackBg).toContain('linear-gradient');

      // Move slider -> value exists -> Continue enabled
      await slider.evaluate((el) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value',
        )?.set;
        setter?.call(input, 150);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect(cta).toBeEnabled();
      await assertCloverCta(page, cta);

      await cta.click();
      await expect(page.locator('h2:has-text("dietary preferences")')).toBeVisible({ timeout: 5000 });
    });

    test('Waitlist: join CTA is Clover on cream page', async ({ page }) => {
      await page.goto('/waitlist');
      const join = page.locator('button[type="submit"], button:has-text("Join")').first();
      await expect(join).toBeVisible();
      const bg = await bgColor(page, join);
      expect(bg).not.toBe(TRANSPARENT);
      expect(bg).toBe(CLOVER);
    });

    test('Back button is visibly subordinate (text link, no fill)', async ({ page }) => {
      await page.goto('/sprout');
      await selectAutoAdvance(page, 'describes your situation', 'Actively looking for care');
      const back = page.locator('button:has-text("Back")');
      await expect(back).toBeVisible();
      expect(await bgColor(page, back)).toBe(TRANSPARENT);
      // Mute-colored text, readable on cream
      const color = await back.evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe('rgb(92, 102, 100)');
    });
  });
}
