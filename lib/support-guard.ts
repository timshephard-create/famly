/**
 * Deterministic guards for the support chatbot. These run BEFORE any LLM
 * call so scoping and cost ceilings hold even if the model misbehaves.
 */

export const SESSION_MAX_USER_MESSAGES = 20;
export const IP_DAILY_MAX_REQUESTS = 60;
export const MAX_MESSAGE_CHARS = 2000;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export interface TopicRoute {
  topic: string;
  tool: string;
  href: string;
  patterns: RegExp[];
}

/**
 * Domain-substance topics the support bot must never answer. It routes
 * the user to the right tool instead. Order matters only for which
 * route wins when multiple match (first wins).
 */
const TOPIC_ROUTES: TopicRoute[] = [
  {
    topic: 'health insurance',
    tool: 'HealthGuide',
    href: '/health-guide',
    patterns: [
      /\b(deductible|premium|copay|co-pay|coinsurance|cobra|aca|obamacare|medicaid|medicare|hsa)\b/i,
      /\bhealth (insurance|plan|coverage)\b/i,
      /\bmarketplace plan\b/i,
      /\bwhich (insurance|plan) (should|do)\b/i,
    ],
  },
  {
    topic: 'childcare subsidies',
    tool: 'Sprout',
    href: '/sprout',
    patterns: [
      /\b(subsid(y|ies|ize)|ccdf|child ?care assistance|voucher|dependent care fsa)\b/i,
      /\b(child|childcare) tax credit\b/i,
      /\b(daycare|childcare|child care) (cost|price|afford)\w*\b/i,
    ],
  },
  {
    topic: 'medical advice',
    tool: 'HealthGuide',
    href: '/health-guide',
    patterns: [
      /\b(diagnos\w+|symptom|medicat\w+|dosage|vaccine|fever|rash|pediatrician)\b/i,
      /\bis my (child|kid|baby) (sick|ok|okay)\b/i,
      /\bshould (i|we) see a doctor\b/i,
    ],
  },
  {
    topic: 'nutrition advice',
    tool: 'Nourish',
    href: '/nourish',
    patterns: [
      /\b(meal plan|recipe|calorie|macro|nutrition|nutrient)\b/i,
      /\bwhat should (my (kid|child|family)|we|i) eat\b/i,
      /\b(vegan|vegetarian|gluten[- ]free|keto) (diet|meal)\b/i,
      /\ballerg(y|ies|en)\b.*\b(safe|eat|food|diet)\b/i,
    ],
  },
  {
    topic: 'kids’ media advice',
    tool: 'BrightWatch',
    href: '/bright-watch',
    patterns: [
      /\bscreen ?time\b/i,
      /\bwhat (show|app|game)s? (should|can)\b/i,
      /\b(is|are) .{0,40}\b(show|app|game|cartoon)s? (ok|okay|good|appropriate|safe)\b/i,
      /\b(ok|okay|good|appropriate|safe) for (a|my|our) .{0,20}\b(year|month)[- ]?olds?\b/i,
      /\bage[- ]appropriate\b/i,
    ],
  },
];

/**
 * Bug/issue phrasing takes precedence over topic routing: "the allergy
 * filter is broken" is a bug report, not a nutrition question.
 */
const BUG_PATTERNS: RegExp[] = [
  /\b(bug|broken|broke|crash\w*|error|glitch)\b/i,
  /\b(doesn'?t|does not|won'?t|will not|isn'?t|is not|can'?t|cannot) (work|load|open|submit|advance|respond|save)\w*\b/i,
  /\bnot working\b/i,
  /\b(stuck|frozen|freezes|blank (page|screen))\b/i,
  /\b(wrong|missing|disappear\w*) (result|answer|data|button|page)\w*\b/i,
];

export function isBugReport(message: string): boolean {
  return BUG_PATTERNS.some((p) => p.test(message));
}

/** Returns the matched route when the message is domain-substance, else null. */
export function matchTopicRoute(message: string): TopicRoute | null {
  if (isBugReport(message)) return null;
  for (const route of TOPIC_ROUTES) {
    if (route.patterns.some((p) => p.test(message))) return route;
  }
  return null;
}

export function routedRefusal(route: TopicRoute): string {
  return (
    `That one's bigger than support chat — ${route.topic} questions deserve real answers, ` +
    `not a chatbot's hot take. ${route.tool} is built exactly for this: head to ${route.href} ` +
    `and it'll walk you through it properly. I'm happy to help with anything about using the site itself.`
  );
}

/** Count of user messages, used for the per-session cap. */
export function userMessageCount(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user').length;
}

export function sessionCapped(messages: ChatMessage[]): boolean {
  return userMessageCount(messages) > SESSION_MAX_USER_MESSAGES;
}

export const SESSION_CAP_MESSAGE =
  "We've covered a lot this session! To keep things snappy for every family, chat sessions have a " +
  'message limit. If something still needs fixing, use "Report an issue" below and a human ' +
  '(hi, that’s Tim) will take it from here.';

export const IP_CAP_MESSAGE =
  "You've hit today's support-chat limit. Support is always free — this cap just keeps our " +
  'robots from melting. It resets tomorrow, or use "Report an issue" and Tim will follow up by email.';

/** Stable, non-reversible hash for per-IP rate limiting. */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`kindora-support:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
