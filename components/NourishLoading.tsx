'use client';

import { useEffect, useState } from 'react';

/**
 * Nourish-specific loading experience. A real meal plan takes ~45-70s to
 * generate, so a bare spinner reads as "broken." This sets the ~1-minute
 * expectation, narrates what the tool is doing (honest — these are the real
 * stages, framed generally, not per-request telemetry), and shows calm
 * forward motion via an indeterminate progress bar. Brand: Clover + DM Sans.
 */

// Framed as what Nourish generally does, in order. Advances on a timer and
// CLAMPS at the last stage (never loops back — looping over a long wait reads
// as a stall).
const STAGES = [
  'Planning your meals for the week…',
  'Optimizing every meal for your budget…',
  'Finding the best local stores…',
  'Putting your shopping list together…',
  'Almost there — plating it up…',
];

const STAGE_MS = 9000;

export default function NourishLoading() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStage((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, STAGE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      data-testid="nourish-loading"
      className="mx-auto flex max-w-md flex-col items-center px-5 py-20 text-center"
    >
      <span className="text-4xl" aria-hidden="true">🥗</span>

      <h2 className="mt-4 font-display text-2xl font-bold text-ink">
        Building your personalized 7-day plan
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        This takes about a minute — we&apos;re matching meals to your budget, schedule, and local
        stores. Hang tight; it&apos;s worth the wait.
      </p>

      {/* Indeterminate progress bar — honest motion, no fake percentage */}
      <div className="mt-7 h-2 w-full overflow-hidden rounded-pill bg-clover-soft">
        <div className="h-full w-1/3 rounded-pill bg-clover" style={{ animation: 'nourish-sweep 1.6s ease-in-out infinite' }} />
      </div>

      {/* Staged status — advances, then holds on the last line */}
      <p className="mt-4 text-sm font-semibold text-clover transition-opacity duration-300" aria-live="polite">
        {STAGES[stage]}
      </p>
    </div>
  );
}
