'use client';

interface ErrorStateProps {
  title?: string;
  message?: string;
  icon?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Oops — we hit a snag',
  message = 'Something went wrong. Please try again.',
  icon = '\u{1F615}',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      <div className="mb-4 text-4xl">{icon}</div>
      <h2 className="mb-2 font-display text-xl font-bold text-charcoal">
        {title}
      </h2>
      <p className="mb-6 text-sm text-mid">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-xl bg-sage px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sage-light"
        >
          Try again
        </button>
      )}
    </div>
  );
}
