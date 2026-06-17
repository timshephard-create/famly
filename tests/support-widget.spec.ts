import { test, expect } from '@playwright/test';

/**
 * Support chatbot tests.
 *
 * Topic refusals and the session cap are deterministic code paths that run
 * BEFORE any LLM call, so they're asserted against the real API route with
 * no API key required. The LLM reply itself and the Supabase ticket insert
 * are mocked at the page level here; live verification with real keys
 * happens in the keyed smoke pass.
 */

test.describe('Support widget placement', () => {
  test('renders on app routes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('support-launcher')).toBeVisible();
    await page.goto('/nourish');
    await expect(page.getByTestId('support-launcher')).toBeVisible();
  });

  test('suppressed on legal pages', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByTestId('support-widget')).toHaveCount(0);
    await page.goto('/terms');
    await expect(page.getByTestId('support-widget')).toHaveCount(0);
  });
});

test.describe('Support chat API (deterministic guards, real route)', () => {
  test('domain-substance questions are refused and routed', async ({ request }) => {
    const cases = [
      { q: 'Which health plan should I pick for my family?', tool: 'HealthGuide', href: '/health-guide' },
      { q: 'Do we qualify for childcare subsidies?', tool: 'Sprout', href: '/sprout' },
      { q: 'How much screen time is okay for a toddler?', tool: 'BrightWatch', href: '/bright-watch' },
      { q: 'Can you build me a vegan meal plan?', tool: 'Nourish', href: '/nourish' },
    ];
    for (const c of cases) {
      const res = await request.post('/api/support/chat', {
        data: { messages: [{ role: 'user', content: c.q }] },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.routed).toBe(c.tool);
      expect(data.reply).toContain(c.tool);
      expect(data.reply).toContain(c.href);
    }
  });

  test('session message cap is enforced', async ({ request }) => {
    const messages = Array.from({ length: 21 }, () => ({
      role: 'user' as const,
      content: 'How do I go back a question?',
    }));
    const res = await request.post('/api/support/chat', { data: { messages } });
    const data = await res.json();
    expect(data.capped).toBe('session');
    expect(data.reply).toContain('Report an issue');
  });

  test('bug phrasing sets the escalate flag', async ({ request }) => {
    const res = await request.post('/api/support/chat', {
      data: { messages: [{ role: 'user', content: 'The Continue button is not working on Nourish' }] },
    });
    const data = await res.json();
    expect(data.escalate).toBe(true);
  });

  test('rejects malformed payloads', async ({ request }) => {
    const res = await request.post('/api/support/chat', { data: { messages: [] } });
    expect(res.status()).toBe(400);
  });
});

test.describe('Support widget happy path (chat + bug capture, mocked backends)', () => {
  test('open widget, ask nav question, get answer; file bug, ticket submitted', async ({ page }) => {
    let ticketPayload: Record<string, unknown> | null = null;

    await page.route('**/api/support/chat', async (route) => {
      await route.fulfill({
        json: { reply: 'Tap the Back button under any question — bottom-left.', escalate: false },
      });
    });
    await page.route('**/api/support/ticket', async (route) => {
      ticketPayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, ticketId: 'test-ticket-id' } });
    });

    await page.goto('/nourish');
    await page.getByTestId('support-launcher').click();
    await expect(page.getByText("Kindora's support helper")).toBeVisible();

    await page.getByLabel('Support message').fill('How do I go back to a previous question?');
    await page.locator('button:has-text("Send")').first().click();
    await expect(page.getByText('Tap the Back button under any question')).toBeVisible();

    // File a bug via the capture form
    await page.locator('button:has-text("Report an issue")').click();
    await page.getByLabel('Issue description').fill('The budget slider will not move on my phone.');
    await page.getByLabel('Email for updates').fill('test@kindora-test.com');
    await page.locator('button:has-text("Send report")').click();
    await expect(page.getByText('Got it. One less tab.')).toBeVisible();

    // Page/tool auto-attached, transcript included
    expect(ticketPayload).not.toBeNull();
    expect(ticketPayload!.page).toBe('/nourish');
    expect(ticketPayload!.tool).toBe('Nourish');
    expect(ticketPayload!.description).toContain('budget slider');
    expect(ticketPayload!.email).toBe('test@kindora-test.com');
    expect(Array.isArray(ticketPayload!.transcript)).toBeTruthy();
  });
});
