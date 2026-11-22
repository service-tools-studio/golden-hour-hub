"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminMarketTabs, useAdminMarket } from "@/components/admin/admin-market";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, PlusIcon, Screen, SecondaryButton } from "@/components/ui";
import { useNow } from "@/components/use-now";
import { dismissDashboardJob, readDashboardDismissedJobIds } from "@/lib/admin/dashboard-dismissals";
import {
  calculateConfirmedHeadcount,
  jobCleaningHasEnded,
  jobCleaningInProgress,
  jobCountsAsUpcoming,
} from "@/lib/domain/scheduling";
import { dateFromIsoInBusinessZone, editableAvailabilityHorizonEnd } from "@/lib/domain/time";
import { customerMatchesAdminMarket, jobMatchesAdminMarket } from "@/lib/domain/markets";
import { deliverSchedulingCleanerSms } from "@/lib/cleaner/deliver-scheduling-sms";
import type { CalendarImport } from "@/lib/domain/types";
import {
  calendarImportCanceledJobId,
  normalizeCalendarEventTitle,
  calendarImportJobIsLinkedToGmail,
  calendarImportMatchedJobNeedsGmailLink,
  resolveCalendarImportScheduleMatch,
  visibleDashboardCalendarImports,
  visibleRecentlyDismissedCalendarImports,
  visibleRecentlySyncRemovedCalendarImports,
} from "@/lib/domain/calendar-import";
import {
  cleanerRemovedFromJobSms,
  crewLine,
  customerFirstNameForCleaner,
  formatLongDate,
  formatTimeLabel,
  jobHasCleanerScheduleReinvite,
  jobScheduleAttentionFlagLines,
  relativeDay,
  serviceLabel,
} from "@/lib/format";

const heading = "text-sm font-semibold uppercase tracking-[0.14em] text-ink/50";

export function DashboardView() {
  const {
    syncCalendarImports,
    rejectCalendarImport,
    reopenCalendarImport,
    dismissCalendarCanceledImport,
    markCalendarCanceledNotified,
    queueSchedulingSms,
    flash,
    flashLoading,
    clearActionLoading,
    linkCalendarSync,
    ...hub
  } = useHub();
  const { marketFilter, viewingToday } = useAdminMarket();
  const now = useNow();
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(() => new Set());
  const [checkingGmail, setCheckingGmail] = useState(false);
  const [dismissingImportId, setDismissingImportId] = useState<string | null>(null);
  const [reopeningImportId, setReopeningImportId] = useState<string | null>(null);
  const [notifyingImportId, setNotifyingImportId] = useState<string | null>(null);
  const [linkingImportId, setLinkingImportId] = useState<string | null>(null);
  const [showSyncRemoved, setShowSyncRemoved] = useState(false);
  const [showRecentlyDismissed, setShowRecentlyDismissed] = useState(false);
  const syncRemovedRef = useRef<HTMLDivElement>(null);

  async function linkImportToMatchedJob(item: CalendarImport, jobId: string) {
    setLinkingImportId(item.importId);
    try {
      const result = await linkCalendarSync(item.googleCalendarEventId, jobId, false, null, {
        serviceDate: item.serviceDate,
        title: item.raw.title,
      });
      if (result.message) flash(result.message);
    } finally {
      setLinkingImportId(null);
    }
  }

  async function dismissCalendarImport(importId: string) {
    setDismissingImportId(importId);
    try {
      const result = await rejectCalendarImport(importId);
      if (result.message) flash(result.message);
    } finally {
      setDismissingImportId(null);
    }
  }

  async function checkGmailForJobs() {
    setCheckingGmail(true);
    flashLoading("Checking Gmail…");
    try {
      const result = await syncCalendarImports();
      if (result.message) flash(result.message);
    } finally {
      clearActionLoading();
      setCheckingGmail(false);
    }
  }

  useEffect(() => {
    setDismissedJobIds(readDashboardDismissedJobIds(viewingToday));
  }, [viewingToday]);

  function dismissFromDashboard(jobId: string) {
    dismissDashboardJob(viewingToday, jobId);
    setDismissedJobIds((current) => new Set([...current, jobId]));
  }

  const marketJobs = hub.jobs.filter((job) => jobMatchesAdminMarket(job, marketFilter));
  const happening = marketJobs
    .filter((job) => jobCleaningInProgress(job, hub.assignments, now))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = marketJobs
    .filter(
      (job) => jobCountsAsUpcoming(job, hub.assignments, viewingToday, now) && !happening.includes(job),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const staffingHorizon = editableAvailabilityHorizonEnd(hub.today);
  const unstaffed = upcoming.filter((job) => {
    if (job.status === "DRAFT" || job.headcountNeeded < 1) return true;
    const people = calculateConfirmedHeadcount(hub.assignments.filter((item) => item.jobId === job.jobId));
    return people < job.headcountNeeded;
  });
  const unstaffedInHorizon = unstaffed.filter((job) => job.date <= staffingHorizon);
  const scheduleReinviteInHorizon = upcoming.filter(
    (job) => job.date <= staffingHorizon && jobHasCleanerScheduleReinvite(job, hub.assignments),
  );
  const needsAttentionById = new Map<string, (typeof upcoming)[number]>();
  for (const job of [...unstaffedInHorizon, ...scheduleReinviteInHorizon]) {
    needsAttentionById.set(job.jobId, job);
  }
  const needsAttention = [...needsAttentionById.values()].sort((a, b) => a.date.localeCompare(b.date));
  const missingPhone = hub.customers
    .filter(
      (customer) =>
        customer.phone.replace(/\D/g, "") === "" &&
        customerMatchesAdminMarket(customer.customerId, hub.properties, marketFilter),
    )
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  const staffed = upcoming
    .filter((job) => !unstaffed.includes(job) && job.date <= staffingHorizon)
    .filter((job) => !needsAttentionById.has(job.jobId))
    .filter((job) => !dismissedJobIds.has(job.jobId));
  const calendarImports = visibleDashboardCalendarImports(
    hub.calendarImports,
    viewingToday,
    marketFilter,
    hub,
  );
  const recentlyDismissed = visibleRecentlyDismissedCalendarImports(
    hub.calendarImports,
    viewingToday,
    marketFilter,
  ).filter((item) => item.status === "REJECTED");
  const syncRemoved = visibleRecentlySyncRemovedCalendarImports(
    hub.calendarImports,
    viewingToday,
    marketFilter,
    hub,
  );

  function reviewSyncRemovedImports() {
    setShowSyncRemoved(true);
    requestAnimationFrame(() => {
      syncRemovedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function renderRecoverableImportCard(
    item: CalendarImport,
    statusLabel: string,
    options?: { showDismiss?: boolean },
  ) {
    const reopening = reopeningImportId === item.importId;
    const dismissing = dismissingImportId === item.importId;
    const rowBusy = reopeningImportId !== null || dismissingImportId !== null;
    return (
      <Card key={item.importId} className="bg-cream/60">
        <Link href={`/admin/calendar-imports/${item.importId}`} className="block">
          <p className="text-base font-semibold">
            {normalizeCalendarEventTitle(item.raw.title) ||
              [item.parsed.suggestedFirstName, item.parsed.suggestedLastName].filter(Boolean).join(" ") ||
              "Calendar event"}
          </p>
          <p className="text-sm text-ink/70">
            {formatLongDate(item.serviceDate)}
            {item.arrivalWindowStart ? ` · ${formatTimeLabel(item.arrivalWindowStart)}` : null}
          </p>
          <p className="mt-1 text-xs text-ink/50">
            {statusLabel} · withdrawn {relativeDay(dateFromIsoInBusinessZone(item.updatedAt), viewingToday)}
          </p>
        </Link>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-ink/8 pt-3">
          {options?.showDismiss ? (
            <button
              type="button"
              disabled={rowBusy}
              onClick={() => void dismissCalendarImport(item.importId)}
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-2 disabled:opacity-50"
            >
              {dismissing ? "Dismissing…" : "Dismiss"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={rowBusy}
            onClick={() => void reopenDismissedImport(item.importId)}
            className="min-h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-cream disabled:opacity-50"
          >
            {reopening ? "Reopening…" : "Reopen for review"}
          </button>
        </div>
      </Card>
    );
  }

  async function reopenDismissedImport(importId: string, options?: { refreshFromGmail?: boolean }) {
    setReopeningImportId(importId);
    const wasSyncRemoved = hub.calendarImports.find((item) => item.importId === importId)?.status === "WITHDRAWN";
    try {
      const result = await reopenCalendarImport(importId);
      if (!result.ok) {
        if (result.message) flash(result.message);
        return;
      }
      if (options?.refreshFromGmail || wasSyncRemoved) {
        flashLoading("Checking Gmail…");
        const sync = await syncCalendarImports();
        clearActionLoading();
        flash(sync.message ?? result.message ?? "Import returned to the review queue.");
        return;
      }
      if (result.message) flash(result.message);
    } finally {
      setReopeningImportId(null);
    }
  }

  async function notifyCalendarCanceledCleaners(item: CalendarImport) {
    const jobId = calendarImportCanceledJobId(hub, item);
    const job = jobId ? hub.jobs.find((row) => row.jobId === jobId) : undefined;
    const cleanerIds = item.calendarCanceledNotifyCleanerIds ?? [];
    if (!job || cleanerIds.length === 0) {
      flash("No confirmed cleaners to notify for this import.");
      return;
    }
    setNotifyingImportId(item.importId);
    try {
      let queued = 0;
      for (const cleanerId of cleanerIds) {
        const cleaner = hub.cleaners.find((row) => row.cleanerId === cleanerId);
        if (!cleaner) continue;
        const assignment = hub.assignments.find(
          (row) => row.jobId === job.jobId && row.cleanerId === cleanerId,
        );
        const body = cleanerRemovedFromJobSms({
          cleanerFirstName: cleaner.firstName,
          customerFirstName: customerFirstNameForCleaner(job.snapshot),
          date: job.date,
        });
        queueSchedulingSms(
          deliverSchedulingCleanerSms({
            cleaner,
            body,
            manualDetail: "calendar cancel removal",
            assignmentLog: assignment
              ? { assignmentId: assignment.assignmentId, jobId: job.jobId, kind: "removal" }
              : undefined,
          }),
        );
        queued += 1;
      }
      if (queued === 0) {
        flash("No confirmed cleaners to notify for this import.");
        return;
      }
      const saved = await markCalendarCanceledNotified(item.importId);
      if (saved.message) flash(saved.message);
    } finally {
      setNotifyingImportId(null);
    }
  }

  async function dismissCalendarCanceledImportRow(importId: string) {
    setDismissingImportId(importId);
    try {
      const result = await dismissCalendarCanceledImport(importId);
      if (result.message) flash(result.message);
    } finally {
      setDismissingImportId(null);
    }
  }

  return (
    <Screen>
      <PageHeader
        title="Dashboard"
        subtitle={formatLongDate(viewingToday)}
        action={
          <Link
            href={`/admin/jobs/new?date=${viewingToday}`}
            aria-label="Book a new cleaning"
            className="mt-1 flex size-11 shrink-0 items-center justify-center self-center rounded-full bg-ink text-cream"
          >
            <PlusIcon />
          </Link>
        }
      />
      <div className="space-y-8 px-5 pt-4">
        <AdminMarketTabs />
        {happening.length > 0 ? (
          <section className="space-y-3">
            <h2 className={heading}>Happening Now</h2>
            {happening.map((job) => (
              <JobStaffingCard key={job.jobId} jobId={job.jobId} />
            ))}
          </section>
        ) : null}

        {missingPhone.length > 0 ? (
          <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-600">
            <p className="text-base font-semibold">
              {missingPhone.length === 1 ? "1 customer has" : `${missingPhone.length} customers have`} no phone number
            </p>
            <ul className="mt-1 space-y-1">
              {missingPhone.map((customer) => (
                <li key={customer.customerId}>
                  <Link
                    href={`/admin/customers/${customer.customerId}`}
                    className="text-base underline decoration-red-600/40 decoration-2 underline-offset-4"
                  >
                    {customer.firstName} {customer.lastName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className={heading}>Jobs needing attention</h2>
          {needsAttention.length === 0 ? (
            <Card>
              <p className="text-base text-ink/70">
                Nothing through {formatLongDate(staffingHorizon)} needs attention.
              </p>
            </Card>
          ) : (
            needsAttention.map((job) => (
              <JobStaffingCard key={job.jobId} jobId={job.jobId} />
            ))
          )}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                Jobs imported from Gmail
              </h3>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {syncRemoved.length > 0 ? (
                  <button
                    type="button"
                    onClick={reviewSyncRemovedImports}
                    className="min-h-10 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/90"
                  >
                    {syncRemoved.length} import{syncRemoved.length === 1 ? "" : "s"} removed by sync — review
                  </button>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2 [&_button]:min-h-10 [&_button]:w-auto [&_button]:px-4 [&_button]:text-sm">
                  <SecondaryButton
                    type="button"
                    disabled={checkingGmail}
                    loading={checkingGmail}
                    loadingLabel="Checking…"
                    onClick={() => void checkGmailForJobs()}
                  >
                    Check Gmail
                  </SecondaryButton>
                </div>
              </div>
            </div>
            {calendarImports.length > 0 ? (
              calendarImports.map((item) => {
                const canceledOnGmail = item.status === "CALENDAR_CANCELED";
                const scheduleMatch = canceledOnGmail
                  ? { kind: "none" as const }
                  : resolveCalendarImportScheduleMatch(hub.jobs, hub.customers, hub.properties, item);
                const matchedJobId = canceledOnGmail
                  ? calendarImportCanceledJobId(hub, item)
                  : scheduleMatch.kind === "on_schedule"
                    ? scheduleMatch.jobId
                    : undefined;
                const addressMismatchJobId =
                  scheduleMatch.kind === "visit_address_mismatch" ? scheduleMatch.jobId : undefined;
                const dismissing = dismissingImportId === item.importId;
                const notifying = notifyingImportId === item.importId;
                const notifyIds = item.calendarCanceledNotifyCleanerIds ?? [];
                const needsCleanerNotice = canceledOnGmail && notifyIds.length > 0 && !item.cleanerRemovalNotifiedAt;
                const matchedJob = matchedJobId
                  ? hub.jobs.find((job) => job.jobId === matchedJobId && job.status !== "CANCELED")
                  : undefined;
                const gmailLinked = matchedJob ? calendarImportJobIsLinkedToGmail(matchedJob, item) : false;
                const needsGmailLink = calendarImportMatchedJobNeedsGmailLink(hub.jobs, item, matchedJobId);
                const linking = linkingImportId === item.importId;
                const showFooter = (matchedJobId && !canceledOnGmail) || needsGmailLink;
                return (
                  <Card
                    key={item.importId}
                    className={`${showFooter ? "relative pb-11" : ""} ${canceledOnGmail ? "ring-2 ring-red-600/40" : ""}`}
                  >
                    {canceledOnGmail ? (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                          Canceled on Gmail
                        </span>
                        {item.cleanerRemovalNotifiedAt ? (
                          <span className="text-xs font-medium text-ink/55">Cleaners notified</span>
                        ) : null}
                      </div>
                    ) : null}
                    {showFooter ? (
                      <div className="absolute bottom-3 right-4 z-10 flex flex-wrap items-center justify-end gap-2">
                        {needsGmailLink && matchedJobId ? (
                          <button
                            type="button"
                            disabled={linking || dismissing || dismissingImportId !== null || linkingImportId !== null}
                            onClick={() => void linkImportToMatchedJob(item, matchedJobId)}
                            className="min-h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-cream disabled:opacity-50"
                          >
                            {linking ? "Linking…" : "Link to Hub cleaning"}
                          </button>
                        ) : null}
                        {matchedJobId && !canceledOnGmail ? (
                          <button
                            type="button"
                            disabled={dismissing || linking || dismissingImportId !== null || linkingImportId !== null}
                            onClick={() => void dismissCalendarImport(item.importId)}
                            className="min-h-10 rounded-xl px-3 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-2 disabled:opacity-50"
                          >
                            {dismissing ? "Dismissing…" : "Dismiss"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {canceledOnGmail && matchedJobId ? (
                      <Link href={`/admin/jobs/${matchedJobId}?from=dashboard`} className="block">
                        <p className="text-lg font-semibold">
                          {normalizeCalendarEventTitle(item.raw.title) ||
                            [item.parsed.suggestedFirstName, item.parsed.suggestedLastName]
                              .filter(Boolean)
                              .join(" ") ||
                            "Calendar event"}
                        </p>
                        <p className="text-sm text-ink/70">
                          {formatLongDate(item.serviceDate)}
                          {item.arrivalWindowStart ? ` · ${formatTimeLabel(item.arrivalWindowStart)}` : null}
                        </p>
                        {item.raw.location ? <p className="mt-1 text-sm text-ink/70">{item.raw.location}</p> : null}
                        <p className="mt-2 text-sm font-semibold text-red-700">
                          Removed from Gmail — hub job canceled
                        </p>
                      </Link>
                    ) : (
                      <Link
                        href={
                          matchedJobId && canceledOnGmail
                            ? `/admin/jobs/${matchedJobId}?from=dashboard`
                            : `/admin/calendar-imports/${item.importId}`
                        }
                        className="block"
                      >
                        <p className="text-lg font-semibold">
                          {normalizeCalendarEventTitle(item.raw.title) ||
                            [item.parsed.suggestedFirstName, item.parsed.suggestedLastName]
                              .filter(Boolean)
                              .join(" ") ||
                            "Calendar event"}
                        </p>
                        <p className="text-sm text-ink/70">
                          {formatLongDate(item.serviceDate)}
                          {item.arrivalWindowStart ? ` · ${formatTimeLabel(item.arrivalWindowStart)}` : null}
                        </p>
                        {item.raw.location ? <p className="mt-1 text-sm text-ink/70">{item.raw.location}</p> : null}
                        {matchedJobId ? (
                          <p className="mt-2 text-sm font-semibold text-gold">
                            {gmailLinked ? "Already on schedule · Linked" : "Already on schedule"}
                          </p>
                        ) : addressMismatchJobId ? (
                          <p className="mt-2 text-sm font-semibold text-amber-800">
                            Possible match in Hub — address differs. Review.
                          </p>
                        ) : (
                          <p className="mt-2 text-sm font-semibold text-ink">Review import</p>
                        )}
                      </Link>
                    )}
                    {canceledOnGmail ? (
                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-ink/8 pt-4">
                        {needsCleanerNotice ? (
                          <button
                            type="button"
                            disabled={notifying || dismissingImportId !== null}
                            onClick={() => void notifyCalendarCanceledCleaners(item)}
                            className="min-h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-cream disabled:opacity-50"
                          >
                            {notifying ? "Notifying…" : "Notify confirmed cleaners"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={dismissing || notifying}
                          onClick={() => void dismissCalendarCanceledImportRow(item.importId)}
                          className="min-h-10 rounded-xl px-3 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-2 disabled:opacity-50"
                        >
                          {dismissing ? "Dismissing…" : "Dismiss"}
                        </button>
                      </div>
                    ) : null}
                  </Card>
                );
              })
            ) : (
              <Card>
                <p className="text-base text-ink/70">No pending Gmail imports. Use Check Gmail to refresh from the calendar.</p>
              </Card>
            )}
            {syncRemoved.length > 0 ? (
              <div ref={syncRemovedRef} className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSyncRemoved((open) => !open)}
                  className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink/45"
                  aria-expanded={showSyncRemoved}
                >
                  <span>Removed by sync ({syncRemoved.length})</span>
                  <span className="text-ink/35 normal-case tracking-normal">{showSyncRemoved ? "Hide" : "Show"}</span>
                </button>
                {showSyncRemoved
                  ? syncRemoved.map((item) =>
                      renderRecoverableImportCard(item, "Removed by sync", { showDismiss: true }),
                    )
                  : null}
              </div>
            ) : null}
            {recentlyDismissed.length > 0 ? (
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecentlyDismissed((open) => !open)}
                  className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-ink/45"
                  aria-expanded={showRecentlyDismissed}
                >
                  <span>Recently dismissed ({recentlyDismissed.length})</span>
                  <span className="text-ink/35 normal-case tracking-normal">{showRecentlyDismissed ? "Hide" : "Show"}</span>
                </button>
                {showRecentlyDismissed
                  ? recentlyDismissed.map((item) => renderRecoverableImportCard(item, "Dismissed"))
                  : null}
              </div>
            ) : null}
          </div>
        </section>

        {staffed.length > 0 ? (
          <section className="space-y-3">
            <h2 className={heading}>Fully staffed</h2>
            {staffed.map((job) => (
              <JobStaffingCard key={job.jobId} jobId={job.jobId} dismissable onDismiss={dismissFromDashboard} />
            ))}
          </section>
        ) : null}
      </div>
    </Screen>
  );
}

function JobStaffingCard({
  jobId,
  dismissable = false,
  onDismiss,
}: {
  jobId: string;
  dismissable?: boolean;
  onDismiss?: (jobId: string) => void;
}) {
  const hub = useHub();
  const { viewingToday } = useAdminMarket();
  const now = useNow();
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return null;
  const assignments = hub.assignments.filter(
    (item) => item.jobId === job.jobId && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED",
  );
  const assignedIds = new Set(assignments.map((item) => item.cleanerId));
  const pendingCleaners = (job.draftCleanerIds ?? [])
    .filter((id) => !assignedIds.has(id))
    .map((id) => hub.cleaners.find((item) => item.cleanerId === id))
    .filter((item) => item !== undefined);
  const confirmed = calculateConfirmedHeadcount(assignments);
  const draft = job.status === "DRAFT";
  const full = !draft && job.headcountNeeded > 0 && confirmed >= job.headcountNeeded;
  const availabilityFollowUp = assignments.some((item) => item.availabilityConflictWeekStart);
  const scheduleReinvite = jobHasCleanerScheduleReinvite(job, hub.assignments);
  const scheduleAttentionLines = jobScheduleAttentionFlagLines(job, assignments, (cleanerId) =>
    hub.cleaners.find((cleaner) => cleaner.cleanerId === cleanerId)?.firstName,
  );
  const showDismiss = dismissable && jobCleaningHasEnded(job, hub.assignments, viewingToday, now);
  return (
    <Card
      className={`relative ${showDismiss ? "pb-10" : ""} ${full ? "ring-2 ring-mint" : scheduleReinvite ? "ring-2 ring-gold/50" : availabilityFollowUp ? "ring-2 ring-red-600/35" : ""}`}
    >
      {showDismiss ? (
        <button
          type="button"
          onClick={() => onDismiss?.(job.jobId)}
          className="absolute bottom-3 right-4 z-10 text-xs font-semibold text-ink/50 underline decoration-ink/25 underline-offset-2"
        >
          Dismiss
        </button>
      ) : null}
      <Link href={`/admin/jobs/${job.jobId}?from=dashboard`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{job.snapshot.customerDisplayName}</p>
            <p className="text-sm text-ink/70">
              {serviceLabel(job.serviceType)} · {relativeDay(job.date, viewingToday)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {scheduleReinvite ? (
              <span className="rounded-full bg-gold/25 px-2.5 py-0.5 text-xs font-semibold text-ink ring-1 ring-inset ring-gold/40">
                Re-invite cleaners
              </span>
            ) : null}
            {availabilityFollowUp ? (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-600/35">
                Availability follow-up
              </span>
            ) : null}
            {full ? (
              <span className="rounded-full bg-mint px-3 py-1 text-sm font-semibold">Fully Staffed</span>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-base font-medium">
          {draft ? "Draft" : `Headcount: ${confirmed} / ${job.headcountNeeded} confirmed`}
        </p>
        {scheduleAttentionLines.map((line) => (
          <p key={line} className="mt-2 text-sm font-semibold text-red-700">
            {line}
          </p>
        ))}
        <ul className="mt-2 space-y-1 text-sm text-ink/80">
          {assignments.length === 0 && pendingCleaners.length === 0 ? <li>No cleaners assigned yet</li> : null}
          {pendingCleaners.map((cleaner) => (
            <li key={cleaner.cleanerId}>
              <span role="img" aria-label="Draft">📝</span> {cleaner.firstName}  —  Draft
            </li>
          ))}
          {assignments.map((assignment) => {
            const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
            if (!cleaner) return null;
            const mark =
              assignment.availabilityConflictWeekStart
                ? "⚠"
                : assignment.status === "CONFIRMED"
                  ? "✓"
                  : assignment.status === "DECLINED"
                    ? "✕"
                    : "⏳";
            return (
              <li key={assignment.assignmentId}>
                {mark} {crewLine(cleaner, assignment)}
              </li>
            );
          })}
        </ul>
      </Link>
    </Card>
  );
}
