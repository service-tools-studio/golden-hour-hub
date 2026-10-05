"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { subtractConfirmedBookingsFromAvailability, toAssignmentSchedule } from "@/lib/domain/scheduling";
import { addDays, formatTimeLabel } from "@/lib/domain/time";
import { formatArrival, formatLongDate, serviceLabel } from "@/lib/format";

export function CleanerSchedule() {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  if (!cleaner) return null;
  const confirmed = hub.assignments.filter(
    (assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "CONFIRMED",
  );
  const windows = hub.availability
    .filter((window) => window.cleanerId === cleaner.cleanerId)
    .map((window) => ({ date: window.date, start: window.start, end: window.end }));
  const effective = subtractConfirmedBookingsFromAvailability(windows, confirmed.map(toAssignmentSchedule));
  const days = Array.from({ length: 10 }, (_, index) => addDays(hub.today, index));

  return (
    <Screen>
      <PageHeader title="My Schedule" subtitle="Confirmed jobs and open time" />
      <div className="space-y-3 px-5 pt-4">
        {days.map((date) => {
          const jobs = confirmed.filter((assignment) => assignment.serviceDate === date);
          const open = effective.filter((window) => window.date === date);
          if (jobs.length === 0 && open.length === 0) return null;
          return (
            <Card key={date}>
              <p className="text-base font-semibold">{formatLongDate(date)}</p>
              <div className="mt-3 space-y-2">
                {open.map((window) => (
                  <p key={`${window.start}-${window.end}`} className="rounded-2xl bg-mint/70 px-3 py-3 text-sm">
                    Open {formatTimeLabel(window.start)} – {formatTimeLabel(window.end)}
                  </p>
                ))}
                {jobs.map((assignment) => {
                  const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
                  if (!job) return null;
                  return (
                    <Link key={assignment.assignmentId} href={`/cleaner/jobs/${job.jobId}`} className="block rounded-2xl bg-ink px-3 py-3 text-cream">
                      <p className="font-semibold">{job.snapshot.customerDisplayName}</p>
                      <p className="text-sm text-cream/80">{serviceLabel(job.serviceType)}</p>
                      <p className="text-sm text-cream/80">
                        Arrival window:{" "}
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
        })}
      </div>
    </Screen>
  );
}
