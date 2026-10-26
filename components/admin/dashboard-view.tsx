"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, PlusIcon, Screen } from "@/components/ui";
import { useNow } from "@/components/use-now";
import { dismissDashboardJob, readDashboardDismissedJobIds } from "@/lib/admin/dashboard-dismissals";
import {
  calculateConfirmedHeadcount,
  jobCleaningHasEnded,
  jobCleaningInProgress,
  jobCountsAsUpcoming,
} from "@/lib/domain/scheduling";
import { editableAvailabilityHorizonEnd } from "@/lib/domain/time";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { crewLine, formatLongDate, relativeDay, serviceLabel } from "@/lib/format";

const heading = "text-sm font-semibold uppercase tracking-[0.14em] text-ink/50";

export function DashboardView() {
  const hub = useHub();
  const now = useNow();
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissedJobIds(readDashboardDismissedJobIds(hub.today));
  }, [hub.today]);

  function dismissFromDashboard(jobId: string) {
    dismissDashboardJob(hub.today, jobId);
    setDismissedJobIds((current) => new Set([...current, jobId]));
  }

  const happening = hub.jobs
    .filter((job) => jobCleaningInProgress(job, hub.assignments, now))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = hub.jobs
    .filter(
      (job) => jobCountsAsUpcoming(job, hub.assignments, hub.today, now) && !happening.includes(job),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const staffingHorizon = editableAvailabilityHorizonEnd(hub.today);
  const unstaffed = upcoming.filter((job) => {
    if (job.status === "DRAFT" || job.headcountNeeded < 1) return true;
    const people = calculateConfirmedHeadcount(hub.assignments.filter((item) => item.jobId === job.jobId));
    return people < job.headcountNeeded;
  });
  const needsAttention = unstaffed.filter((job) => job.date <= staffingHorizon);
  const missingPhone = hub.customers
    .filter((customer) => customer.phone.replace(/\D/g, "") === "")
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  const staffed = upcoming
    .filter((job) => !unstaffed.includes(job) && job.date <= staffingHorizon)
    .filter((job) => !dismissedJobIds.has(job.jobId));

  return (
    <Screen>
      <PageHeader
        title="Dashboard"
        subtitle={formatLongDate(hub.today)}
        action={
          <Link
            href={`/admin/jobs/new?date=${hub.today}`}
            aria-label="Book a new cleaning"
            className="mt-1 flex size-11 shrink-0 items-center justify-center self-center rounded-full bg-ink text-cream"
          >
            <PlusIcon />
          </Link>
        }
      />
      <div className="space-y-8 px-5 pt-5">
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
  const showDismiss = dismissable && jobCleaningHasEnded(job, hub.assignments, hub.today, now);
  return (
    <Card
      className={`relative ${showDismiss ? "pb-10" : ""} ${full ? "ring-2 ring-mint" : availabilityFollowUp ? "ring-2 ring-red-600/35" : ""}`}
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
              {serviceLabel(job.serviceType)} · {relativeDay(job.date, hub.today)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
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
                : assignment.status === "CONFIRMED" || assignment.status === "PENDING_AVAILABILITY"
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
