"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ButtonLoadingLabel, Field, fieldClass } from "@/components/ui";
import { normalizePhone } from "@/lib/domain/customers";
import { formatPhoneInput } from "@/lib/format";

export type SmsOptInSubmitResult =
  | { ok: true }
  | { ok: false; phoneError?: string; error?: string };

type SmsOptInFormCardProps = {
  prepopulatePhone?: string;
  onSubmit: (input: { optIn: boolean; mobilePhone: string }) => Promise<SmsOptInSubmitResult>;
};

export function SmsOptInFormCard({ prepopulatePhone = "", onSubmit }: SmsOptInFormCardProps) {
  const [optIn, setOptIn] = useState(false);
  const [mobilePhone, setMobilePhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMobilePhone((current) => {
      if (current.replace(/\D/g, "").length > 0) return current;
      return formatPhoneInput(prepopulatePhone);
    });
  }, [prepopulatePhone]);

  function handleContinue() {
    setError(null);
    setPhoneError(null);
    const normalized = normalizePhone(mobilePhone);
    if (!normalized) {
      setPhoneError("Enter a 10-digit mobile number.");
      return;
    }
    startTransition(async () => {
      const result = await onSubmit({ optIn, mobilePhone });
      if (!result.ok) {
        if (result.phoneError) setPhoneError(result.phoneError);
        if (result.error) setError(result.error);
      }
    });
  }

  return (
    <div className="mt-8 rounded-3xl bg-white p-5 text-ink shadow-[0_8px_30px_rgba(51,51,51,0.08)] ring-1 ring-ink/10">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Stay in the loop!</h1>
      <p className="mt-3 text-center text-base leading-6 text-ink/75">
        Get notified when new cleaning jobs become available, when your schedule changes, and when it&apos;s time to
        submit your availability.
      </p>
      <div className="mt-6">
        <Field label="Mobile phone number" error={phoneError ?? undefined}>
          <input
            className={
              phoneError
                ? "min-h-12 w-full rounded-2xl border border-red-600 bg-white px-3 text-base text-ink outline-none focus:border-red-600"
                : fieldClass
            }
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={mobilePhone}
            onChange={(event) => {
              setPhoneError(null);
              setMobilePhone(formatPhoneInput(event.target.value, mobilePhone));
            }}
            aria-invalid={Boolean(phoneError)}
          />
        </Field>
        <p className="mt-2 text-sm leading-5 text-ink/70">
          We&apos;ll send notifications to the number on your profile. Please verify that this number is correct.
        </p>
      </div>
      <label className="mt-6 flex cursor-pointer gap-3 rounded-2xl border border-ink/10 bg-cream/40 p-4">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(event) => setOptIn(event.target.checked)}
          className="mt-1 size-5 shrink-0 rounded border-ink/20 accent-ink"
        />
        <span className="text-sm leading-5 text-ink/80">
          I agree to receive recurring automated SMS messages from Golden Hour Cleaning Co. about job invitations,
          scheduling updates, confirmations, and availability reminders at the mobile number entered above.
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
      {error ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={handleContinue}
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
