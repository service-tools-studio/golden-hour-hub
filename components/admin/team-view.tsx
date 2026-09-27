"use client";

import Link from "next/link";
import { useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { formatPhone } from "@/lib/format";
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
              <p className="mt-3 text-sm">
                {cleaner.helpersApproved
                  ? `Approved for helpers · usual crew ${cleaner.typicalCrewSize}`
                  : "Works alone · crew of 1"}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </Screen>
  );
}

export function CleanerAdminDetail({ cleanerId }: { cleanerId: string }) {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  const [helpersApproved, setHelpersApproved] = useState(cleaner?.helpersApproved ?? false);
  const [typicalHelperCount, setTypicalHelperCount] = useState(cleaner?.typicalHelperCount ?? 0);
  const [status, setStatus] = useState<CleanerStatus>(cleaner?.status ?? "ACTIVE");
  const [message, setMessage] = useState<string | null>(null);
  if (!cleaner) {
    return (
      <Screen>
        <PageHeader title="Cleaner" crumb={{ href: "/admin/team", label: "Team" }} />
        <p className="px-5 pt-4">That cleaner could not be found.</p>
      </Screen>
    );
  }
  const profile = cleaner;
  const crewSize = helpersApproved ? 1 + typicalHelperCount : 1;

  function save() {
    const result = hub.updateCleanerAdmin(profile.cleanerId, {
      helpersApproved,
      typicalHelperCount: helpersApproved ? typicalHelperCount : 0,
      status,
    });
    setMessage(result.ok ? "Saved." : result.message);
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
          <p className="text-base font-semibold">Approved to bring helpers?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setHelpersApproved(false)}
              className={`min-h-12 rounded-2xl text-sm font-semibold ${!helpersApproved ? "bg-ink text-cream" : "bg-cream"}`}
            >
              No
            </button>
            <button
              type="button"
              onClick={() => setHelpersApproved(true)}
              className={`min-h-12 rounded-2xl text-sm font-semibold ${helpersApproved ? "bg-ink text-cream" : "bg-cream"}`}
            >
              Yes
            </button>
          </div>
          {helpersApproved ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Typical number of helpers</p>
              <div className="mt-2 flex items-center justify-between rounded-2xl bg-cream px-3 py-2">
                <button type="button" className="min-h-12 min-w-12 text-2xl" onClick={() => setTypicalHelperCount((value) => Math.max(0, value - 1))}>
                  −
                </button>
                <span className="text-2xl font-semibold">{typicalHelperCount}</span>
                <button type="button" className="min-h-12 min-w-12 text-2xl" onClick={() => setTypicalHelperCount((value) => Math.min(8, value + 1))}>
                  +
                </button>
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-base">Typical crew size: {crewSize}</p>
          <p className="mt-1 text-sm text-ink/60">Typical crew size = primary cleaner + helpers.</p>
          {message ? (
            <div className="mt-3">
              <Notice tone={message === "Saved." ? "ok" : "error"}>{message}</Notice>
            </div>
          ) : null}
          <button type="button" onClick={save} className="mt-4 min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream">
            Save
          </button>
        </Card>
      </div>
    </Screen>
  );
}
