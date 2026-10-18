"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendAvailabilityReminders } from "@/app/actions/reminders";
import { useHub } from "@/components/hub-provider";
import { useHubSyncBlocker } from "@/components/hub-sync";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { listSubmissionStatus } from "@/lib/domain/availability";
import { helpersApproved, maxCrewSize, typicalCrewSize } from "@/lib/domain/cleaners";
import { formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { formatCentsToDollarsInput, parseDollarsToCents } from "@/lib/domain/compensation";
import { cleanerCrewSummary, formatPhone } from "@/lib/format";
import type { CleanerProfile, CleanerStatus } from "@/lib/domain/types";

export function TeamView() {
  const hub = useHub();
  const [query, setQuery] = useState("");
  const cleaners = useMemo(() => searchCleaners(hub.cleaners, query), [hub.cleaners, query]);
  const filtering = query.trim() !== "";
  return (
    <Screen>
      <PageHeader title="Team" />
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

function searchCleaners(cleaners: CleanerProfile[], query: string): CleanerProfile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return cleaners;
  const digits = needle.replace(/\D/g, "");
  return cleaners.filter((cleaner) => {
    const name = `${cleaner.firstName} ${cleaner.lastName}`.toLowerCase();
    if (name.includes(needle) || cleaner.firstName.toLowerCase().includes(needle)) return true;
    if (cleaner.email.toLowerCase().includes(needle)) return true;
    if (digits.length > 0 && cleaner.mobilePhone.replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
}

function CleanerSearchField({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-full bg-white px-3 text-ink ring-1 ring-ink/10">
      <TeamSearchIcon />
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search cleaners"
        aria-label="Search cleaners"
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-ink/40"
      />
      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onQuery("")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink/55 hover:bg-cream hover:text-ink"
        >
          <TeamClearSearchIcon />
        </button>
      ) : null}
    </label>
  );
}

function TeamSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-ink/45">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16.5L20 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TeamClearSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WeekSubmissions() {
  const hub = useHub();
  const week = nextAvailabilityWeek(hub.today);
  const submissions = listSubmissionStatus(hub.cleaners, hub.submissions, week.weekStart);
  const submittedCount = submissions.filter((item) => item.submitted).length;
  const missing = submissions.filter((item) => !item.submitted);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function remind(ids: string[]) {
    setSending(true);
    const result = await sendAvailabilityReminders(ids);
    setNotice(result.message);
    setSending(false);
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
                  disabled={sending}
                  onClick={() => remind([item.cleanerId])}
                  className="min-h-10 shrink-0 rounded-full bg-mint px-3 text-sm font-semibold text-ink"
                >
                  Send Reminder
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink/70">
          {submittedCount} of {submissions.length} cleaners submitted
        </p>
        {missing.length > 0 ? (
          <button
            type="button"
            disabled={sending}
            onClick={() => remind(missing.map((item) => item.cleanerId))}
            className="mt-3 min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream"
          >
            Send All Reminders
          </button>
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
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const cleanerSnapshot = JSON.stringify({ helpersOn, typicalHelperCount, maxHelperCount, status, hourlyRate });
  const cleanerBaseline = useRef<string | null>(null);
  if (cleaner && cleanerBaseline.current === null) cleanerBaseline.current = cleanerSnapshot;
  const cleanerDirty = cleanerBaseline.current !== null && cleanerBaseline.current !== cleanerSnapshot;
  useUnsavedNavigation(Boolean(cleaner), () => cleanerDirty, setLeaveHref);
  useHubSyncBlocker(() => cleanerDirty);
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

  function save(nextHref?: string) {
    const typicalHourlyRateCents = parseDollarsToCents(hourlyRate);
    if (typicalHourlyRateCents === null) {
      setMessage("Enter a valid hourly rate.");
      return false;
    }
    const result = hub.updateCleanerAdmin(profile.cleanerId, {
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

  function saveAndLeave() {
    if (!save(leaveHref ?? undefined)) setLeaveHref(null);
  }

  return (
    <Screen>
      <PageHeader
        title={`${cleaner.firstName} ${cleaner.lastName}`}
        subtitle={formatPhone(cleaner.mobilePhone)}
        crumb={{ href: "/admin/team", label: "Team" }}
      />
      <div className="space-y-3 px-5 pt-4">
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
        {message ? (
          <Notice tone={message === "Saved." ? "ok" : "error"}>{message}</Notice>
        ) : null}
        <button type="button" onClick={() => save()} className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
          Save
        </button>
      </div>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        onSave={saveAndLeave}
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
