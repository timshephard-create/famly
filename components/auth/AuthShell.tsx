import Link from 'next/link';

/**
 * Shared page chrome for the auth screens (Phase 5, Item 2): shell background,
 * centered card, wordmark with the single apricot accent. Server-compatible —
 * the mode-dependent heading lives inside the client forms it wraps.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-shell px-5 py-16">
      <div className="mx-auto max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center font-display text-2xl font-bold tracking-tight text-ink"
        >
          kindora<span className="text-apricot">.</span>
        </Link>
        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
