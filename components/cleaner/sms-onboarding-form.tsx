"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordSmsOnboardingChoice } from "@/app/actions/sms-onboarding";
import { useHub } from "@/components/hub-provider";
import { ButtonLoadingLabel } from "@/components/ui";

export function SmsOnboardingForm() {
  const hub = useHub();
  const router = useRouter();
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function continueToHub() {
    setError(null);
    startTransition(async () => {
      const result = await recordSmsOnboardingChoice(optIn);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      hub.applyCleanerSmsConsent({
        smsSchedulingOptIn: result.smsSchedulingOptIn,
        smsOptInRecordedAt: result.smsOptInRecordedAt,
      });
      router.replace("/cleaner");
    });
  }

  return (
    <div className="mt-8 rounded-3xl bg-white p-5 text-ink shadow-[0_8px_30px_rgba(51,51,51,0.08)] ring-1 ring-ink/10">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Stay in the loop!</h1>
      <p className="mt-3 text-center text-base leading-6 text-ink/75">
        Get notified when new cleaning jobs become available, when your schedule changes, and when it&apos;s time to
        submit your availability.
      </p>
      <label className="mt-6 flex cursor-pointer gap-3 rounded-2xl border border-ink/10 bg-cream/40 p-4">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(event) => setOptIn(event.target.checked)}
          className="mt-1 size-5 shrink-0 rounded border-ink/20 accent-ink"
        />
        <span className="text-sm leading-5 text-ink/80">
          I agree to receive recurring automated SMS messages from Golden Hour Cleaning Co. about job invitations,
          scheduling updates, confirmations, and availability reminders at the mobile number associated with my account.
        </span>
      </label>
      <p className="mt-4 text-xs leading-5 text-ink/55">
        Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance.
        Consent is optional and not required to use Golden Hour Hub.
      </p>
      <p className="mt-3 text-xs leading-5 text-ink/55">
        By opting in, you agree to our{" "}
        <Link href="/terms" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-2">
          Terms &amp; Conditions
        </Link>{" "}
        and acknowledge our{" "}
        <Link href="/privacy" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={continueToHub}
        className="mt-6 flex min-h-14 w-full items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream disabled:opacity-60"
      >
        {pending ? (
          <ButtonLoadingLabel label="Saving…" />
        ) : optIn ? (
          "Turn on text alerts"
        ) : (
          "Continue without text alerts"
        )}
      </button>
    </div>
  );
}
