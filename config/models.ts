/**
 * Central registry of Anthropic model IDs — the ONE place to change on a
 * model deprecation. When Anthropic retires a model, update it here and every
 * route follows. Do not hardcode `claude-*` strings in routes.
 *
 * Routing rationale (see CLAUDE.md §model routing):
 *  - `sonnet`: reasoning-grade tools — HealthGuide + Sprout insight (/api/insight),
 *    Nourish meal planning, BrightWatch recommendations.
 *  - `haiku`:  cheap/fast paths — support chatbot, AI-output validation.
 *
 * History: `claude-sonnet-4-20250514` was retired 2026-06-15; replaced by
 * `claude-sonnet-4-6`.
 */
export const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
