"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { helpersApproved, maxCrewSize, typicalCrewSize } from "@/lib/domain/cleaners";
import { cleanerCrewSummary, formatPhone } from "@/lib/format";
import type { CleanerStatus } from "@/lib/domain/types";

export function TeamView() {
  const hub = useHub();
  return (
    <Screen>
      <PageHeader title="Team" subtitle="Helper approval is set by admins" />
      <div className="space-y-3 px-5 pt-4">
        {hub.cleaners.map((cleaner) => (
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

export function CleanerAdminDetail({ cleanerId }: { cleanerId: string }) {
  const hub = useHub();
  const router = useRouter();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const [helpersOn, setHelpersOn] = useState(cleaner ? helpersApproved(cleaner.maxHelperCount) : false);
  const [typicalHelperCount, setTypicalHelperCount] = useState(cleaner?.typicalHelperCount ?? 0);
  const [maxHelperCount, setMaxHelperCount] = useState(cleaner?.maxHelperCount ?? 0);
  const [status, setStatus] = useState<CleanerStatus>(cleaner?.status ?? "ACTIVE");
  const [message, setMessage] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const cleanerSnapshot = JSON.stringify({ helpersOn, typicalHelperCount, maxHelperCount, status });
  const cleanerBaseline = useRef<string | null>(null);
  if (cleaner && cleanerBaseline.current === null) cleanerBaseline.current = cleanerSnapshot;
  const cleanerDirty = cleanerBaseline.current !== null && cleanerBaseline.current !== cleanerSnapshot;
  useUnsavedNavigation(Boolean(cleaner), () => cleanerDirty, setLeaveHref);
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
    const result = hub.updateCleanerAdmin(profile.cleanerId, {
      typicalHelperCount: typical,
      maxHelperCount: maximum,
      status,
    });
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    cleanerBaseline.current = JSON.stringify({ helpersOn, typicalHelperCount, maxHelperCount, status });
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
          {message ? (
            <div className="mt-3">
              <Notice tone={message === "Saved." ? "ok" : "error"}>{message}</Notice>
            </div>
          ) : null}
          <button type="button" onClick={() => save()} className="mt-4 min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
            Save
          </button>
        </Card>
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
