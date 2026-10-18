"use client";

import Link from "next/link";

export function SmsOptInActionBanner() {
  return (
    <div className="rounded-3xl bg-ink p-4 text-cream ring-1 ring-ink/10">
      <div className="flex gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-cream/25 bg-cream/10"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5M6 20l1.5-3.5A9 9 0 1 1 21 12a9 9 0 0 1-1.5 4.5L18 20l-4.5-1.5A9 9 0 0 1 6 20z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-snug">Stay in the loop!</p>
          <p className="mt-2 text-sm leading-6 text-cream/85">
            Want to know when new jobs become available? Turn on text notifications to receive job invitations, schedule
            updates, and availability reminders right on your phone.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/onboarding/sms"
              className="inline-flex min-h-10 items-center rounded-full bg-cream px-4 text-sm font-semibold text-ink"
            >
              Set up text alerts
            </Link>
            <span className="text-sm text-cream/55">Optional</span>
          </div>
        </div>
      </div>
    </div>
  );
}
