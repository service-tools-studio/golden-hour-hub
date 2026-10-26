"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { subtractConfirmedBookingsFromAvailability, toAssignmentSchedule } from "@/lib/domain/scheduling";
import { eachDate, editableAvailabilityHorizonEnd, formatTimeLabel } from "@/lib/domain/time";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { cleanerServiceLabel, customerFirstNameForCleaner, formatArrival, formatLongDate } from "@/lib/format";

function cleanerCommitted(assignment: JobAssignment): boolean {
  return assignment.status === "CONFIRMED" || assignment.status === "PENDING_AVAILABILITY";
}

function ScheduleDayCard({
  date,
  open,
  assignments,
  jobsById,
}: {
  date: string;
  open: { date: string; start: string; end: string }[];
  assignments: JobAssignment[];
  jobsById: Map<string, Job>;
}) {
  if (assignments.length === 0 && open.length === 0) return null;
  return (
    <Card>
      <p className="text-base font-semibold">{formatLongDate(date)}</p>
      <div className="mt-3 space-y-2">
        {open.map((window) => (
          <p key={`${window.start}-${window.end}`} className="rounded-2xl bg-mint/70 px-3 py-3 text-sm">
            Open {formatTimeLabel(window.start)} – {formatTimeLabel(window.end)}
          </p>
        ))}
        {assignments.map((assignment) => {
          const job = jobsById.get(assignment.jobId);
          if (!job) return null;
          return (
            <Link
              key={assignment.assignmentId}
              href={`/cleaner/jobs/${job.jobId}`}
              className="block rounded-2xl bg-ink px-3 py-3 text-cream"
            >
              <p className="font-semibold">{customerFirstNameForCleaner(job.snapshot)}</p>
              <p className="text-sm text-cream/80">{cleanerServiceLabel(job.serviceType)}</p>
              <p className="text-sm text-cream/80">
                Start time:{" "}
                <span className="whitespace-nowrap">
                  {formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}
                </span>
              </p>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

export function CleanerSchedule() {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  if (!cleaner) return null;

  const committed = hub.assignments.filter(
    (assignment) => assignment.cleanerId === cleaner.cleanerId && cleanerCommitted(assignment),
  );
  const jobsById = new Map(hub.jobs.map((job) => [job.jobId, job]));
  const windows = hub.availability
    .filter((window) => window.cleanerId === cleaner.cleanerId)
    .map((window) => ({ date: window.date, start: window.start, end: window.end }));
  const confirmedForOpenTime = committed.filter((assignment) => assignment.status === "CONFIRMED");
  const effective = subtractConfirmedBookingsFromAvailability(
    windows,
    confirmedForOpenTime.map(toAssignmentSchedule),
  );

  const horizonEnd = editableAvailabilityHorizonEnd(hub.today);
  const horizonDays = eachDate(hub.today, horizonEnd);
  const beyondHorizonDates = [
    ...new Set(committed.filter((assignment) => assignment.serviceDate > horizonEnd).map((item) => item.serviceDate)),
  ].sort();

  return (
    <Screen>
      <PageHeader title="My Schedule" subtitle="Confirmed jobs and open time" />
      <div className="space-y-3 px-5 pt-4">
        {horizonDays.map((date) => (
          <ScheduleDayCard
            key={date}
            date={date}
            open={effective.filter((window) => window.date === date)}
            assignments={committed.filter((assignment) => assignment.serviceDate === date)}
            jobsById={jobsById}
          />
        ))}
        {beyondHorizonDates.length > 0 ? (
          <>
            <p className="py-1 text-center text-2xl leading-none text-ink/35" aria-hidden="true">…</p>
            {beyondHorizonDates.map((date) => (
              <ScheduleDayCard
                key={date}
                date={date}
                open={[]}
                assignments={committed.filter((assignment) => assignment.serviceDate === date)}
                jobsById={jobsById}
              />
            ))}
          </>
        ) : null}
      </div>
    </Screen>
  );
}
