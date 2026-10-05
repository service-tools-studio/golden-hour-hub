"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { useNow } from "@/components/use-now";
import {
  calculateBlockedRange,
  calculateConfirmedHeadcount,
  cleaningCoverage,
  isWithinRange,
} from "@/lib/domain/scheduling";
import { addDays } from "@/lib/domain/time";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { crewLine, formatLongDate, relativeDay, serviceLabel } from "@/lib/format";

const heading = "text-sm font-semibold uppercase tracking-[0.14em] text-ink/50";

function jobInProgress(job: Job, assignments: JobAssignment[], now: number): boolean {
  if (job.status !== "SCHEDULED") return false;
  const coverage = cleaningCoverage(assignments.filter((item) => item.jobId === job.jobId));
  if (coverage) return isWithinRange(coverage, now);
  if (!job.arrivalWindowStart || !job.arrivalWindowEnd || job.expectedDurationMinutes === undefined) return false;
  return isWithinRange(
    calculateBlockedRange({
      date: job.date,
      arrivalWindowStart: job.arrivalWindowStart,
      arrivalWindowEnd: job.arrivalWindowEnd,
      expectedDurationMinutes: job.expectedDurationMinutes,
    }),
    now,
  );
}

export function DashboardView() {
  const hub = useHub();
  const now = useNow();

  const happening = hub.jobs
    .filter((job) => jobInProgress(job, hub.assignments, now))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = hub.jobs
    .filter(
      (job) =>
        (job.status === "SCHEDULED" || job.status === "DRAFT") && job.date >= hub.today && !happening.includes(job),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const horizon = addDays(hub.today, 7);
  const unstaffed = upcoming.filter((job) => {
    if (job.status === "DRAFT" || job.headcountNeeded < 1) return true;
    const people = calculateConfirmedHeadcount(hub.assignments.filter((item) => item.jobId === job.jobId));
    return people < job.headcountNeeded;
  });
  const needsAttention = unstaffed.filter((job) => job.date <= horizon);
  const missingPhone = hub.customers
    .filter((customer) => customer.phone.replace(/\D/g, "") === "")
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  const staffed = upcoming.filter((job) => !unstaffed.includes(job));

  return (
    <Screen>
      <PageHeader title="Dashboard" subtitle={formatLongDate(hub.today)} />
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
              <p className="text-base text-ink/70">Nothing in the next 7 days needs attention.</p>
            </Card>
          ) : (
            needsAttention.map((job) => <JobStaffingCard key={job.jobId} jobId={job.jobId} />)
          )}
        </section>

        {staffed.length > 0 ? (
          <section className="space-y-3">
            <h2 className={heading}>Fully staffed</h2>
            {staffed.map((job) => (
              <JobStaffingCard key={job.jobId} jobId={job.jobId} />
            ))}
          </section>
        ) : null}
      </div>
    </Screen>
  );
}

function JobStaffingCard({ jobId }: { jobId: string }) {
  const hub = useHub();
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
  return (
    <Link href={`/admin/jobs/${job.jobId}`} className="block">
      <Card className={full ? "ring-2 ring-mint" : ""}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{job.snapshot.customerDisplayName}</p>
            <p className="text-sm text-ink/70">
              {serviceLabel(job.serviceType)} · {relativeDay(job.date, hub.today)}
            </p>
          </div>
          {full ? (
            <span className="rounded-full bg-mint px-3 py-1 text-sm font-semibold">Fully Staffed</span>
          ) : null}
        </div>
        <p className="mt-3 text-base font-medium">
          {draft ? "Draft" : `Headcount: ${confirmed} / ${job.headcountNeeded} confirmed`}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-ink/80">
          {assignments.length === 0 && pendingCleaners.length === 0 ? <li>No cleaners assigned yet</li> : null}
          {pendingCleaners.map((cleaner) => (
            <li key={cleaner.cleanerId}>{cleaner.firstName}</li>
          ))}
          {assignments.map((assignment) => {
            const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
            if (!cleaner) return null;
            const mark =
              assignment.status === "CONFIRMED" ? "✓" : assignment.status === "DECLINED" ? "✕" : "⏳";
            return (
              <li key={assignment.assignmentId}>
                {mark} {crewLine(cleaner, assignment)}
              </li>
            );
          })}
        </ul>
      </Card>
    </Link>
  );
}
