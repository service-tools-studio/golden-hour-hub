"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AvailabilityWeekEditor,
  type AvailabilityWeekEditorHandle,
} from "@/components/availability-week-editor";
import { useRouter } from "next/navigation";
import { sendAvailabilityReminders } from "@/app/actions/reminders";
import { useHub } from "@/components/hub-provider";
import { useHubSyncBlocker } from "@/components/hub-sync";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { ContractorBusinessAdminPanel } from "@/components/admin/contractor-business-admin-panel";
import { ButtonLoadingLabel, Card, FormSubmitNotice, Notice, PageHeader, PrimaryButton, Screen } from "@/components/ui";
import { listSubmissionStatus } from "@/lib/domain/availability";
import { helpersApproved, maxCrewSize, typicalCrewSize } from "@/lib/domain/cleaners";
import { editableAvailabilityWeeks, formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { formatCentsToDollarsInput, parseDollarsToCents } from "@/lib/domain/compensation";
import { cleanerCrewSummary, formatPhone } from "@/lib/format";
import { CleanerSearchField, searchCleaners } from "@/components/admin/cleaner-search";
import type { CleanerStatus } from "@/lib/domain/types";

export function TeamView() {
  const hub = useHub();
  const [query, setQuery] = useState("");
  const cleaners = useMemo(() => searchCleaners(hub.cleaners, query), [hub.cleaners, query]);
  const filtering = query.trim() !== "";
  return (
    <Screen>
      <PageHeader
        title="Team"
        action={
          <Link
            href="/admin/team/new"
            className="mt-1 flex min-h-11 shrink-0 items-center justify-center self-center rounded-2xl bg-gold px-3 text-sm font-semibold text-ink"
          >
            + Add cleaner
          </Link>
        }
      />
      <div className="space-y-3 px-5 pt-4">
        <WeekSubmissions />
        <CleanerSearchField query={query} onQuery={setQuery} />
        {filtering && cleaners.length === 0 ? (
          <p className="px-1 text-sm text-ink/55">No cleaners match.</p>
        ) : null}
        {cleaners.map((cleaner) => (
          <Link key={cleaner.cleanerId} href={`/admin/team/${cleaner.cleanerId}`} className="block">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">
                    {cleaner.firstName} {cleaner.lastName}
                  </p>
                  <p className="text-sm text-ink/70">{formatPhone(cleaner.mobilePhone)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cleaner.status === "ACTIVE" ? "bg-mint" : "bg-cream"}`}>
                  {cleaner.status === "ACTIVE" ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-3 text-sm">{cleanerCrewSummary(cleaner)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </Screen>
  );
}

function WeekSubmissions() {
  const hub = useHub();
  const week = nextAvailabilityWeek(hub.today);
  const submissions = listSubmissionStatus(hub.cleaners, hub.submissions, week.weekStart);
  const submittedCount = submissions.filter((item) => item.submitted).length;
  const missing = submissions.filter((item) => !item.submitted);
  const [notice, setNotice] = useState<string | null>(null);
  const [reminding, setReminding] = useState<"all" | string | null>(null);

  async function remind(ids: string[]) {
    const key = ids.length === 1 ? ids[0]! : "all";
    setReminding(key);
    const result = await sendAvailabilityReminders(ids);
    setNotice(result.message);
    setReminding(null);
  }

  return (
    <>
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Next Week Availability</p>
        <h2 className="mt-1 text-2xl font-semibold">{formatWeekRange(week.weekStart, week.weekEnd)}</h2>
        <ul className="mt-4 space-y-3">
          {submissions.map((item) => (
            <li key={item.cleanerId} className="flex items-center justify-between gap-3">
              <p className="text-base">
                <span>{item.submitted ? "✓" : "⚠"}</span> {item.firstName}
                <span className="text-ink/60"> — {item.submitted ? "Submitted" : "Missing"}</span>
              </p>
              {item.submitted ? null : (
                <button
                  type="button"
                  disabled={reminding !== null}
                  aria-busy={reminding === item.cleanerId}
                  onClick={() => remind([item.cleanerId])}
                  className="flex min-h-10 shrink-0 items-center justify-center rounded-full bg-mint px-3 text-sm font-semibold text-ink disabled:opacity-70"
                >
                  {reminding === item.cleanerId ? (
                    <ButtonLoadingLabel label="Sending…" tone="onLight" />
                  ) : (
                    "Send Reminder"
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink/70">
          {submittedCount} of {submissions.length} cleaners submitted
        </p>
        {missing.length > 0 ? (
          <div className="mt-3">
            <PrimaryButton
              type="button"
              disabled={reminding !== null}
              loading={reminding === "all"}
              loadingLabel="Sending…"
              onClick={() => remind(missing.map((item) => item.cleanerId))}
            >
              Send All Reminders
            </PrimaryButton>
          </div>
        ) : null}
      </Card>
    </>
  );
}

export function CleanerAdminDetail({ cleanerId }: { cleanerId: string }) {
  const hub = useHub();
  const router = useRouter();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const [helpersOn, setHelpersOn] = useState(cleaner ? helpersApproved(cleaner.maxHelperCount) : false);
  const [typicalHelperCount, setTypicalHelperCount] = useState(cleaner?.typicalHelperCount ?? 0);
  const [maxHelperCount, setMaxHelperCount] = useState(cleaner?.maxHelperCount ?? 0);
  const [status, setStatus] = useState<CleanerStatus>(cleaner?.status ?? "ACTIVE");
  const [hourlyRate, setHourlyRate] = useState(
    cleaner ? formatCentsToDollarsInput(cleaner.typicalHourlyRateCents) : "50",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [availabilityDirty, setAvailabilityDirty] = useState(false);
  const [availabilityWeekStart, setAvailabilityWeekStart] = useState(
    () => editableAvailabilityWeeks(hub.today)[0]?.weekStart ?? hub.today,
  );
  const availabilityRef = useRef<AvailabilityWeekEditorHandle>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"general" | "business" | "availability">("general");
  const cleanerSnapshot = JSON.stringify({ helpersOn, typicalHelperCount, maxHelperCount, status, hourlyRate });
  const cleanerBaseline = useRef<string | null>(null);
  if (cleaner && cleanerBaseline.current === null) cleanerBaseline.current = cleanerSnapshot;
  const cleanerDirty = cleanerBaseline.current !== null && cleanerBaseline.current !== cleanerSnapshot;
  const hasUnsaved = cleanerDirty || availabilityDirty;
  useUnsavedNavigation(Boolean(cleaner), () => hasUnsaved, setLeaveHref);
  useHubSyncBlocker(() => hasUnsaved);
  if (!cleaner) {
    return (
      <Screen>
        <PageHeader title="Cleaner" crumb={{ href: "/admin/team", label: "Team" }} />
        <p className="px-5 pt-4">That cleaner could not be found.</p>
      </Screen>
    );
  }
  const profile = cleaner;
  const typical = helpersOn ? typicalHelperCount : 0;
  const maximum = helpersOn ? Math.max(maxHelperCount, 1) : 0;
  const usualCrew = typicalCrewSize(typical);
  const approvedCrew = maxCrewSize(maximum);

  async function save(nextHref?: string) {
    const typicalHourlyRateCents = parseDollarsToCents(hourlyRate);
    if (typicalHourlyRateCents === null) {
      setMessage("Enter a valid hourly rate.");
      return false;
    }
    const result = await hub.updateCleanerAdmin(profile.cleanerId, {
      typicalHelperCount: typical,
      maxHelperCount: maximum,
      typicalHourlyRateCents,
      status,
    });
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    cleanerBaseline.current = JSON.stringify({ helpersOn, typicalHelperCount, maxHelperCount, status, hourlyRate });
    if (nextHref) {
      hub.flash("Saved.");
      router.push(nextHref);
      return true;
    }
    setMessage("Saved.");
    return true;
  }

  async function saveAndLeave() {
    const href = leaveHref ?? undefined;
    const ok = await runSave(href);
    if (!ok) setLeaveHref(null);
    return ok;
  }

  async function runSave(nextHref?: string) {
    if (saving) return false;
    setSaving(true);
    setMessage(null);
    try {
      if (availabilityDirty || availabilityRef.current?.isDirty()) {
        const availabilitySaved = await availabilityRef.current!.save({ quiet: true });
        if (!availabilitySaved.ok) {
          if (availabilitySaved.message) setMessage(availabilitySaved.message);
          return false;
        }
        setAvailabilityDirty(false);
      }
      return await save(nextHref);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PageHeader
        title={`${cleaner.firstName} ${cleaner.lastName}`}
        subtitle={formatPhone(cleaner.mobilePhone)}
        crumb={{ href: "/admin/team", label: "Team" }}
      />
      <div className="space-y-3 px-5 pt-4">
        <div className="flex border-b border-ink/12" role="tablist" aria-label="Cleaner profile sections">
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "general"}
            onClick={() => setDetailTab("general")}
            className={`-mb-px flex-1 border-b-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
              detailTab === "general" ? "border-gold text-ink" : "border-transparent text-ink/45"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              General
              {cleanerDirty ? (
                <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-label="Unsaved changes" />
              ) : null}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "business"}
            onClick={() => setDetailTab("business")}
            className={`-mb-px flex-1 border-b-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
              detailTab === "business" ? "border-gold text-ink" : "border-transparent text-ink/45"
            }`}
          >
            Business
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "availability"}
            onClick={() => setDetailTab("availability")}
            className={`-mb-px flex-1 border-b-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
              detailTab === "availability" ? "border-gold text-ink" : "border-transparent text-ink/45"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              Availability
              {availabilityDirty ? (
                <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-label="Unsaved changes" />
              ) : null}
            </span>
          </button>
        </div>

        <div role="tabpanel" hidden={detailTab !== "general"} className={detailTab === "general" ? "space-y-3 pt-1" : "hidden"}>
        <Card>
          <p className="text-base font-semibold">Sign-in</p>
          {cleaner.cognitoSub ? (
            <>
              <p className="mt-2 text-sm font-medium text-ink">Sign-in account linked</p>
              <p className="mt-1 text-sm text-ink/70">
                Sign-in email: <span className="font-medium text-ink">{cleaner.email}</span>
              </p>
              <p className="mt-2 text-sm text-ink/60">
                Cognito emailed a temporary password when this account was created. On first sign-in they must set a new
                password.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink/70">
              No sign-in account is linked on this profile yet. They may still sign in if Cognito uses the same email.
            </p>
          )}
        </Card>
        <Card>
          <p className="text-sm text-ink/70">{cleaner.email}</p>
          <p className="mt-4 text-base font-medium">Status</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["ACTIVE", "INACTIVE"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={`min-h-12 rounded-2xl text-sm font-semibold ${status === option ? "bg-ink text-cream" : "bg-cream"}`}
              >
                {option === "ACTIVE" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-base font-semibold">Typical hourly rate</p>
          <p className="mt-1 text-sm text-ink/60">Per person. Job offers can still use a different rate.</p>
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
          </label>
        </Card>
        <Card>
          <p className="text-base font-semibold">Helpers approved?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setHelpersOn(false);
                setTypicalHelperCount(0);
                setMaxHelperCount(0);
              }}
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
              <HelperCount
                label="Typical number of helpers"
                value={typicalHelperCount}
                onChange={(value) => {
                  setTypicalHelperCount(value);
                  setMaxHelperCount((current) => Math.max(current, value));
                }}
              />
              <HelperCount
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
          <p className="mt-1 text-sm text-ink/60">Crew size is the cleaner plus their helpers. Only admins can change these limits.</p>
        </Card>
        </div>

        <div
          role="tabpanel"
          hidden={detailTab !== "business"}
          className={detailTab === "business" ? "space-y-3 pt-1" : "hidden"}
        >
          <ContractorBusinessAdminPanel
            cleaner={cleaner}
            submissionHistory={hub.contractorQuestionnaireSubmissions ?? []}
          />
        </div>

        <div
          role="tabpanel"
          hidden={detailTab !== "availability"}
          className={detailTab === "availability" ? "space-y-3 pt-1" : "hidden"}
        >
        <Card>
          <p className="text-base font-semibold">Availability</p>
          <p className="mt-1 text-sm text-ink/60">Current and next week. Saves apply the same rules as when the cleaner submits.</p>
          <div className="mt-4">
            <AvailabilityWeekEditor
              ref={availabilityRef}
              cleanerId={profile.cleanerId}
              weekStart={availabilityWeekStart}
              onWeekStartChange={setAvailabilityWeekStart}
              variant="admin"
              embedded
              onDirtyChange={setAvailabilityDirty}
            />
          </div>
        </Card>
        </div>

        {message ? (
          <FormSubmitNotice message={message} tone={message === "Saved." ? "ok" : "error"} />
        ) : null}
        {hasUnsaved || saving ? (
          <PrimaryButton type="button" loading={saving} loadingLabel="Saving…" onClick={() => void runSave()}>
            Save
          </PrimaryButton>
        ) : null}
      </div>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        pendingHref={leaveHref}
        onSave={saveAndLeave}
        onNavigationComplete={() => setLeaveHref(null)}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onDismiss={() => setLeaveHref(null)}
      />
    </Screen>
  );
}

function HelperCount({
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
        <button type="button" className="min-h-12 min-w-12 text-2xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Decrease ${label}`}>
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
