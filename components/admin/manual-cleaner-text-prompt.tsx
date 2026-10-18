"use client";

export function ManualCleanerTextPrompt({
  firstName,
  href,
  detail,
  onDismiss,
}: {
  firstName: string;
  href: string;
  /** Short phrase after "Send the", e.g. "removal notice". */
  detail: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-cream px-4 py-3 ring-1 ring-ink/10">
      <p className="text-sm leading-6 text-ink/80">
        {firstName} has not opted in to automated texts. Send the {detail} yourself in iMessage.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={href}
          onClick={() => onDismiss?.()}
          className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-cream"
        >
          Text {firstName} manually
        </a>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-10 px-3 text-sm font-semibold text-ink/70 underline decoration-ink/25 underline-offset-4"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
