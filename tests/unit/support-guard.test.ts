import { describe, expect, it } from 'vitest';
import {
  SESSION_MAX_USER_MESSAGES,
  isBugReport,
  matchTopicRoute,
  routedRefusal,
  sessionCapped,
  userMessageCount,
  type ChatMessage,
} from '@/lib/support-guard';

describe('topic routing (refuse-and-route, deterministic)', () => {
  const domainCases: Array<[string, string]> = [
    ['Which health plan should I pick, the bronze or the silver?', 'HealthGuide'],
    ['What does a $3000 deductible actually mean for us?', 'HealthGuide'],
    ['Is COBRA worth it after leaving a job?', 'HealthGuide'],
    ['Do we qualify for childcare subsidies in Texas?', 'Sprout'],
    ['How do I apply for CCDF vouchers?', 'Sprout'],
    ['My toddler has a fever and a rash, what should I do?', 'HealthGuide'],
    ['What should my kid eat for more protein?', 'Nourish'],
    ['Can you give me a gluten-free meal plan?', 'Nourish'],
    ['How much screen time is okay for a 3 year old?', 'BrightWatch'],
    ['Is Bluey okay for a 2 year old?', 'BrightWatch'],
  ];

  it.each(domainCases)('routes %s → %s', (message, tool) => {
    const route = matchTopicRoute(message);
    expect(route, message).not.toBeNull();
    expect(route!.tool).toBe(tool);
  });

  it('refusal copy names the tool and its path', () => {
    const route = matchTopicRoute('Which health plan should I pick?');
    const refusal = routedRefusal(route!);
    expect(refusal).toContain('HealthGuide');
    expect(refusal).toContain('/health-guide');
  });

  const navCases = [
    'How do I go back to a previous question?',
    'Where do I find the waitlist?',
    'Can I get my results emailed to me?',
    'Do I need an account to use this?',
    'How do I start over?',
  ];

  it.each(navCases)('allows navigation/how-to: %s', (message) => {
    expect(matchTopicRoute(message)).toBeNull();
  });
});

describe('bug reports take precedence over topic routing', () => {
  const bugCases = [
    'The allergy filter is broken on Nourish',
    "The health plan results page won't load",
    'The screen time quiz crashes on question 2',
    'The subsidy calculator shows the wrong results',
    'The Continue button is not working on the meal plan quiz',
  ];

  it.each(bugCases)('treats as bug, not domain question: %s', (message) => {
    expect(isBugReport(message)).toBe(true);
    expect(matchTopicRoute(message)).toBeNull();
  });

  it('non-bug phrasing is not escalated', () => {
    expect(isBugReport('How do I email my results?')).toBe(false);
  });
});

describe('session cap', () => {
  const mk = (n: number): ChatMessage[] =>
    Array.from({ length: n * 2 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));

  it('counts only user messages', () => {
    expect(userMessageCount(mk(5))).toBe(5);
  });

  it('allows up to the cap, rejects beyond it', () => {
    expect(sessionCapped(mk(SESSION_MAX_USER_MESSAGES))).toBe(false);
    expect(sessionCapped(mk(SESSION_MAX_USER_MESSAGES + 1))).toBe(true);
  });
});
