# Kindora — repo rules for Claude Code

Kindora (kindora.world) — AI-powered family navigation platform. Four tools:
Sprout (childcare), HealthGuide (insurance), BrightWatch (kids' media),
Nourish (meal planning).

## One session per repo

Only ONE Claude Code session may work in this repo folder at a time.
Close/finish any other session before starting work here.

## Brand tokens (v1.1, locked)

Single source of truth: `app/styles/tokens.css`. If a value isn't there, it
doesn't exist — add it there first, then expose it in `tailwind.config.ts`.

- **Clover `#0E6B43`** (`--color-clover`) — primary. Buttons, headers, brand surfaces.
- **Clover dark `#085132`** — hover/pressed. **Clover soft `#DFEEE4`** — tints/badges.
- **Apricot `#EE9A6A`** (`--color-apricot`) — accent ONLY (the wordmark period,
  single CTAs on Clover surfaces, ≤5% of any screen).
- **Shell `#FBF8F2`** — page background (never pure white on marketing pages).
- Ink `#1A2321` text · Mute `#5C6664` secondary · Line `#EAE5DA` borders.
- Type: **DM Sans** display (`font-display`), **Inter** body (`font-sans`),
  JetBrains Mono for stamps.
- Primary button: Clover bg + white text, pill radius, hover Clover-dark.
- Retired/forbidden: "Famly" name, forest green, Plus Jakarta Sans, purple
  gradients, pure-white marketing backgrounds.

## The bg-* alias bug (DO NOT USE)

`bg-page`, `bg-surface`, `bg-brand`, `bg-brand-soft`, `bg-accent` **emit no
CSS**. The `bg: { page: … }` nesting in `tailwind.config.ts` generates
`bg-bg-page` etc., so the shorter names silently produce nothing.
Use `bg-clover`, `bg-apricot`, `bg-shell`, `bg-surface`→`bg-white` equivalents
from the flat color names (`clover`, `apricot`, `shell`, `surface`, `line`,
`mute`, `ink`) instead.

Legacy Famly-era names (`sage`, `sky`, `gold`, `terra`, `cream`, `charcoal`,
`mid`) are mapped onto the Clover family as compatibility aliases (see
tokens.css "legacy compatibility aliases" block). Don't use them in NEW code —
write `clover`/`apricot`/`shell` directly. Do not mass-refactor existing
usages (~386 instances, scheduled for Phase 6 cleanup).

## Compiled-CSS verification rule (visual changes)

A green build is NOT sufficient proof for any visual change:
1. `npm run build`, then grep `.next/static/css/*.css` for the rule you expect
   to be emitted (Tailwind silently drops unknown classes).
2. Confirm computed styles in a real browser (Playwright assertions on
   `getComputedStyle` are fine).
3. Report the emitted CSS rule in your output.

## Model routing

- **Haiku** (`claude-haiku-4-5-20251001`): Sprout, BrightWatch, support chatbot,
  output validation.
- **Sonnet** (current: `claude-sonnet-4-20250514` in code): HealthGuide, Nourish
  — temperature 0.2–0.3.

## Workflow

- Integration work happens on feature branches; Vercel auto-deploys a preview
  per branch. `main` deploys to production (www.kindora.world) — merge only
  with Tim's explicit approval.
- Secrets live in `.env.local` (gitignored). Never commit keys; add new vars
  to `.env.example` as placeholders.
- Tests: Playwright (`npm test`), helpers in `tests/helpers.ts`. No merge with
  failing tests.
