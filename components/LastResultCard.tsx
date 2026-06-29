'use client';

/**
 * Last-result recall banner (Phase 5, Item 1). Shown on a tool's start screen
 * to signed-in users who have a saved result for that tool. Non-blocking and
 * dismissible — never gates the quiz. Uses v1.1 flat tokens (clover/shell/ink);
 * never the bg-* alias group that emits no CSS.
 */
export default function LastResultCard({
  toolName,
  onView,
  onDismiss,
}: {
  toolName: string;
  onView: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-auto mb-6 max-w-xl px-5">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-clover/20 bg-clover-soft px-5 py-4">
        <p className="text-sm text-ink">
          Pick up where you left off — your last {toolName} result is saved.
        </p>
        <div className="flex flex-shrink-0 items-center gap-3">
          <button
            onClick={onView}
            className="rounded-full bg-clover px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clover-dark"
            data-testid="recall-view"
          >
            View it
          </button>
          <button
            onClick={onDismiss}
            aria-label="Dismiss saved result"
            className="text-sm font-medium text-mute transition-colors hover:text-ink"
            data-testid="recall-dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
