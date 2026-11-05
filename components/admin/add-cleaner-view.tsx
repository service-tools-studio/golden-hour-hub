"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCleanerAccountAction } from "@/app/actions/cleaner-admin";
import { useHub } from "@/components/hub-provider";
import { Card, FormSubmitNotice, PageHeader, PrimaryButton, Screen } from "@/components/ui";
import { maxCrewSize, typicalCrewSize } from "@/lib/domain/cleaners";
import { formatPhoneInput } from "@/lib/domain/customers";
import { formatCentsToDollarsInput, parseDollarsToCents } from "@/lib/domain/compensation";
import type { CreateCleanerAccountFieldErrors } from "@/lib/hub/create-cleaner-account";

export function AddCleanerView() {
  const hub = useHub();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [helpersOn, setHelpersOn] = useState(false);
  const [typicalHelperCount, setTypicalHelperCount] = useState(0);
  const [maxHelperCount, setMaxHelperCount] = useState(0);
  const [hourlyRate, setHourlyRate] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CreateCleanerAccountFieldErrors>({});

  const typical = helpersOn ? typicalHelperCount : 0;
  const maximum = helpersOn ? Math.max(maxHelperCount, 1) : 0;
  const usualCrew = typicalCrewSize(typical);
  const approvedCrew = maxCrewSize(maximum);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    setFieldErrors({});
    const typicalHourlyRateCents = parseDollarsToCents(hourlyRate);
    if (typicalHourlyRateCents === null) {
      setFieldErrors({ typicalHourlyRateCents: "Enter a valid hourly rate." });
      setMessage("Enter a valid hourly rate.");
      setSubmitting(false);
      return;
    }
    const result = await createCleanerAccountAction({
      firstName,
      lastName,
      email,
      mobilePhone,
      typicalHelperCount: typical,
      maxHelperCount: maximum,
      typicalHourlyRateCents,
    });
    setSubmitting(false);
    if (!result.ok) {
      setMessage(result.message);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      return;
    }
    hub.mergeAdminHub(result.hub);
    const flashParts = [
      "Cleaner added.",
      `Cognito emailed ${result.email} a temporary password.`,
    ];
    if (result.profileLinkPending) {
      flashParts.push("Hub could not save the sign-in link— they can still sign in with this email.");
    }
    hub.flash(flashParts.join(" "));
    router.push(`/admin/team/${result.cleanerId}`);
  }

  return (
    <Screen>
      <PageHeader title="Add cleaner" crumb={{ href: "/admin/team", label: "Team" }} />
      <div className="space-y-3 px-5 pt-4 pb-8">
        <p className="text-sm text-ink/70">
          Create a cleaner profile in Hub, then a sign-in account. Cognito will email them a temporary password after the
          profile is saved.
        </p>

        <Card>
          <p className="text-base font-semibold">Contact</p>
          <label className="mt-4 block">
            <span className="text-sm font-medium">First name</span>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              className="mt-2 min-h-12 w-full rounded-2xl bg-cream px-4 text-base outline-none"
            />
            {fieldErrors.firstName ? (
              <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.firstName}</span>
            ) : null}
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Last name</span>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              className="mt-2 min-h-12 w-full rounded-2xl bg-cream px-4 text-base outline-none"
            />
            {fieldErrors.lastName ? (
              <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.lastName}</span>
            ) : null}
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Email</span>
            <p className="mt-1 text-sm text-ink/60">Used to sign in. Cognito sends the temporary password here.</p>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-2 min-h-12 w-full rounded-2xl bg-cream px-4 text-base outline-none"
            />
            {fieldErrors.email ? (
              <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.email}</span>
            ) : null}
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Mobile phone</span>
            <input
              type="tel"
              value={mobilePhone}
              onChange={(event) => setMobilePhone(formatPhoneInput(event.target.value, mobilePhone))}
              autoComplete="tel"
              className="mt-2 min-h-12 w-full rounded-2xl bg-cream px-4 text-base outline-none"
            />
            {fieldErrors.mobilePhone ? (
              <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.mobilePhone}</span>
            ) : null}
          </label>
        </Card>

        <Card>
          <p className="text-base font-semibold">Typical hourly rate</p>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Rate</span>
            <div className="mt-2 flex items-center gap-2 rounded-2xl bg-cream px-4 py-3">
              <span className="text-lg font-semibold text-ink/70">$</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
                className="min-h-12 w-full bg-transparent text-2xl font-semibold outline-none"
                aria-label="Typical hourly rate in dollars"
              />
              <span className="shrink-0 text-sm font-medium text-ink/60">/ hour</span>
            </div>
            {fieldErrors.typicalHourlyRateCents ? (
              <span className="mt-1 block text-sm font-semibold text-red-700">{fieldErrors.typicalHourlyRateCents}</span>
            ) : null}
          </label>
        </Card>

        <Card>
          <p className="text-base font-semibold">Helpers approved?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setHelpersOn(false)}
              className={`min-h-12 rounded-2xl text-sm font-semibold ${!helpersOn ? "bg-ink text-cream" : "bg-cream"}`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => {
                setHelpersOn(true);
                setMaxHelperCount((value) => Math.max(value, 1));
              }}
              className={`min-h-12 rounded-2xl text-sm font-semibold ${helpersOn ? "bg-ink text-cream" : "bg-cream"}`}
            >
              Yes
            </button>
          </div>
          {helpersOn ? (
            <div className="mt-4 space-y-4">
              <HelperStepper
                label="Typical number of helpers"
                value={typicalHelperCount}
                onChange={(value) => {
                  setTypicalHelperCount(value);
                  setMaxHelperCount((current) => Math.max(current, value));
                }}
              />
              <HelperStepper
                label="Maximum number of helpers approved"
                value={Math.max(maxHelperCount, 1)}
                min={1}
                onChange={(value) => {
                  setMaxHelperCount(value);
                  setTypicalHelperCount((current) => Math.min(current, value));
                }}
              />
            </div>
          ) : null}
          <p className="mt-4 text-base">Typical crew size: {usualCrew}</p>
          <p className="mt-1 text-base">Maximum approved crew size: {approvedCrew}</p>
        </Card>

        <p className="text-sm text-ink/60">New cleaners are Active immediately.</p>

        {message ? <FormSubmitNotice message={message} tone="error" /> : null}

        <PrimaryButton type="button" loading={submitting} loadingLabel="Creating…" onClick={() => void submit()}>
          Create cleaner
        </PrimaryButton>
        <Link
          href="/admin/team"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-cream text-base font-semibold text-ink"
        >
          Cancel
        </Link>
      </div>
    </Screen>
  );
}

function HelperStepper({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex items-center justify-between rounded-2xl bg-cream px-3 py-2">
        <button
          type="button"
          className="min-h-12 min-w-12 text-2xl"
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="text-2xl font-semibold">{value}</span>
        <button type="button" className="min-h-12 min-w-12 text-2xl" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}
