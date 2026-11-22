"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  loadSyncLinkWorkspaceAction,
  type LoadSyncLinkWorkspaceResult,
} from "@/app/actions/calendar-sync-link";
import type {
  SyncLinkGcalEventSnapshot,
  SyncLinkWorkspace,
  SyncLinkSuggestion,
} from "@/lib/calendar/calendar-sync-link";
import type { SyncLinkGcalFallback } from "@/lib/calendar/resolve-google-calendar-event";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";

function confidenceLabel(level: SyncLinkSuggestion["confidence"]): string {
  switch (level) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
}

function confidenceClass(level: SyncLinkSuggestion["confidence"]): string {
  switch (level) {
    case "high":
      return "bg-mint/25 text-ink";
    case "medium":
      return "bg-gold/25 text-ink";
    default:
      return "bg-ink/10 text-ink/70";
  }
}

export function SyncLinkView() {
  const hub = useHub();
  const [workspace, setWorkspace] = useState<SyncLinkWorkspace | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [fuzzyDays, setFuzzyDays] = useState(7);
  const [alignSchedule, setAlignSchedule] = useState(true);
  const [manualEventId, setManualEventId] = useState("");
  const [manualJobId, setManualJobId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result: LoadSyncLinkWorkspaceResult = await loadSyncLinkWorkspaceAction(fuzzyDays);
      if (!result.ok) {
        setMessage(result.message);
        setWorkspace(null);
        return;
      }
      setWorkspace(result.workspace);
    } finally {
      setLoading(false);
    }
  }, [fuzzyDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function linkPair(
    googleCalendarEventId: string,
    jobId: string,
    gcalEvent?: SyncLinkGcalEventSnapshot | null,
    fallback?: SyncLinkGcalFallback | null,
  ) {
    const key = `${googleCalendarEventId}|${jobId}`;
    setLinkingKey(key);
    setMessage(null);
    try {
      const eventId = googleCalendarEventId.trim();
      const result = await hub.linkCalendarSync(eventId, jobId, alignSchedule, gcalEvent, fallback);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      hub.flash(result.message ?? "Linked.");
      await refresh();
    } finally {
      setLinkingKey(null);
    }
  }

  async function linkManual() {
    if (!manualEventId || !manualJobId) {
      setMessage("Choose a Gmail event and a hub cleaning.");
      return;
    }
    const manualEvent = workspace?.unlinkedEvents.find(
      (item) => item.googleCalendarEventId === manualEventId,
    );
    await linkPair(manualEventId, manualJobId, manualEvent?.gcalEvent, {
      serviceDate: manualEvent?.serviceDate,
      title: manualEvent?.title,
    });
    setManualEventId("");
    setManualJobId("");
  }

  return (
    <Screen>
      <PageHeader
        title="Link Gmail ↔ Hub"
        crumb={{ href: "/admin", label: "Dashboard" }}
        subtitle="Match unlinked calendar events to cleanings already on the schedule."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SecondaryButton type="button" disabled={loading} onClick={() => void refresh()}>
          {loading ? "Loading…" : "Refresh from Gmail"}
        </SecondaryButton>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={fuzzyDays > 0}
            onChange={(event) => setFuzzyDays(event.target.checked ? 7 : 0)}
            className="size-4 rounded border-ink/30"
          />
          Allow dates ±7 days when suggesting
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={alignSchedule}
            onChange={(event) => setAlignSchedule(event.target.checked)}
            className="size-4 rounded border-ink/30"
          />
          Align hub date/time from Gmail when linking
        </label>
      </div>

      {message ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{message}</p>
      ) : null}

      {workspace ? (
        <p className="mb-6 text-sm text-ink/60">
          {workspace.fetchedEvents} Gmail events through {workspace.horizonEnd} · {workspace.linkedPairs} already
          linked · {workspace.suggestions.length} suggestion{workspace.suggestions.length === 1 ? "" : "s"} ·{" "}
          {workspace.unlinkedEvents.length} unlinked events · {workspace.unlinkedJobs.length} unlinked cleanings
        </p>
      ) : null}

      {workspace && workspace.suggestions.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-ink">Suggested links</h2>
          <div className="flex flex-col gap-3">
            {workspace.suggestions.map((row) => {
              const busy = linkingKey === `${row.googleCalendarEventId}|${row.jobId}`;
              return (
                <Card key={`${row.googleCalendarEventId}|${row.jobId}`} className="p-4">
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${confidenceClass(row.confidence)}`}
                      >
                        {confidenceLabel(row.confidence)}
                      </span>
                      <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-ink/70">
                        {row.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5 rounded-xl bg-ink/[0.04] p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Gmail</p>
                        <p className="text-base font-semibold leading-snug text-ink break-words">{row.eventTitle}</p>
                        <p className="text-sm text-ink/70">
                          {row.eventDate}
                          {row.dateDeltaDays !== 0
                            ? ` (${row.dateDeltaDays > 0 ? "+" : ""}${row.dateDeltaDays}d vs hub)`
                            : ""}
                        </p>
                      </div>
                      <div className="space-y-1.5 rounded-xl bg-ink/[0.04] p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Hub cleaning</p>
                        <p className="text-base font-semibold leading-snug text-ink break-words">{row.jobCustomerName}</p>
                        <p className="text-sm text-ink/70">{row.jobDate}</p>
                        <Link
                          href={`/admin/jobs/${row.jobId}`}
                          className="inline-block pt-1 text-sm font-medium text-mint underline decoration-mint/40 underline-offset-2"
                        >
                          Open job
                        </Link>
                      </div>
                    </div>
                    <PrimaryButton
                      type="button"
                      disabled={busy}
                      loading={busy}
                      onClick={() =>
                        void linkPair(row.googleCalendarEventId, row.jobId, row.gcalEvent, {
                          serviceDate: row.eventDate,
                          title: row.eventTitle,
                        })
                      }
                    >
                      Link
                    </PrimaryButton>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : workspace && !loading ? (
        <p className="mb-10 text-sm text-ink/60">No automatic suggestions — use manual pairing below or widen date matching.</p>
      ) : null}

      {workspace ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Manual pairing</h2>
          <Card className="grid gap-4 p-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Unlinked Gmail events</h3>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-ink/10">
                {workspace.unlinkedEvents.length === 0 ? (
                  <p className="p-3 text-sm text-ink/50">None in window.</p>
                ) : (
                  <ul className="divide-y divide-ink/10">
                    {workspace.unlinkedEvents.map((event) => (
                      <li key={event.googleCalendarEventId}>
                        <button
                          type="button"
                          onClick={() => setManualEventId(event.googleCalendarEventId)}
                          className={`w-full px-3 py-2 text-left text-sm transition hover:bg-ink/[0.04] ${
                            manualEventId === event.googleCalendarEventId ? "bg-mint/15 ring-1 ring-mint/40" : ""
                          }`}
                        >
                          <span className="font-semibold text-ink">{event.title}</span>
                          <span className="mt-0.5 block text-ink/65">
                            {event.serviceDate} · {event.arrivalLabel}
                            {event.importStatus ? ` · import ${event.importStatus}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Unlinked hub cleanings</h3>
              <div className="max-h-80 overflow-y-auto rounded-xl border border-ink/10">
                {workspace.unlinkedJobs.length === 0 ? (
                  <p className="p-3 text-sm text-ink/50">None in window.</p>
                ) : (
                  <ul className="divide-y divide-ink/10">
                    {workspace.unlinkedJobs.map((job) => (
                      <li key={job.jobId}>
                        <button
                          type="button"
                          onClick={() => setManualJobId(job.jobId)}
                          className={`w-full px-3 py-2 text-left text-sm transition hover:bg-ink/[0.04] ${
                            manualJobId === job.jobId ? "bg-mint/15 ring-1 ring-mint/40" : ""
                          }`}
                        >
                          <span className="font-semibold text-ink">{job.customerName}</span>
                          <span className="mt-0.5 block text-ink/65">
                            {job.serviceDate} · {job.addressLine}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PrimaryButton
              type="button"
              disabled={!manualEventId || !manualJobId || linkingKey !== null}
              onClick={() => void linkManual()}
            >
              Link selected pair
            </PrimaryButton>
            {manualEventId && manualJobId ? (
              <span className="text-sm text-ink/60">Event + cleaning selected.</span>
            ) : null}
          </div>
        </section>
      ) : null}
    </Screen>
  );
}