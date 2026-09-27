"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { InvitationCard } from "@/components/cleaner/invitation-card";
import { Card, PageHeader, Screen } from "@/components/ui";
import { formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { formatArrival, formatLongDate, serviceLabel } from "@/lib/format";

export function CleanerHome() {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  if (!cleaner) return null;
  const week = nextAvailabilityWeek(hub.today);
  const submitted = hub.submissions.some(
    (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === week.weekStart,
  );
  const invitations = hub.assignments.filter(
    (assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "INVITED",
  );
  const upcoming = hub.assignments
    .filter((assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "CONFIRMED")
    .map((assignment) => ({ assignment, job: hub.jobs.find((job) => job.jobId === assignment.jobId) }))
    .filter((item) => item.job && item.job.status === "SCHEDULED" && item.job.date >= hub.today)
    .sort((a, b) => a.assignment.serviceDate.localeCompare(b.assignment.serviceDate));

  return (
    <Screen>
      <PageHeader title={`Hi ${cleaner.firstName}`} subtitle="Your jobs and availability" />
      <div className="space-y-4 px-5 pt-5">
        {invitations.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Action required</h2>
            <p className="text-2xl font-semibold">
              {invitations.length} job {invitations.length === 1 ? "invitation" : "invitations"}
            </p>
            {invitations.map((assignment) => {
              const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
              if (!job) return null;
              return <InvitationCard key={assignment.assignmentId} assignment={assignment} job={job} cleaner={cleaner} />;
            })}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Upcoming jobs</h2>
          {upcoming.length === 0 ? (
            <Card>
              <p className="text-base text-ink/70">No confirmed cleanings yet.</p>
            </Card>
          ) : (
            upcoming.map(({ assignment, job }) =>
              job ? (
                <Link key={assignment.assignmentId} href={`/cleaner/jobs/${job.jobId}`} className="block">
                  <Card>
                    <p className="text-lg font-semibold">{job.snapshot.customerDisplayName}</p>
                    <p className="text-sm text-ink/70">
                      {serviceLabel(job.serviceType)} · {formatLongDate(job.date)}
                    </p>
                    <p className="mt-2 text-base">{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</p>
                  </Card>
                </Link>
              ) : null,
            )
          )}
        </section>

        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Next week</p>
          <p className="mt-1 text-xl font-semibold">{formatWeekRange(week.weekStart, week.weekEnd)}</p>
          <p className="mt-2 text-base">{submitted ? "✓ Submitted" : "⚠ Not submitted yet"}</p>
          <Link
            href="/cleaner/availability"
            className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
          >
            {submitted ? "Edit availability" : "Submit availability"}
          </Link>
        </Card>
      </div>
    </Screen>
  );
}
