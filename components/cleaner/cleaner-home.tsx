"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { InvitationCard } from "@/components/cleaner/invitation-card";
import { Card, PageHeader, Screen } from "@/components/ui";
import { useNow } from "@/components/use-now";
import { calculateBlockedRange, isWithinRange } from "@/lib/domain/scheduling";
import { formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { formatArrival, formatLongDate, serviceLabel } from "@/lib/format";

function inProgress(assignment: JobAssignment, now: number): boolean {
  return isWithinRange(
    calculateBlockedRange({
      date: assignment.serviceDate,
      arrivalWindowStart: assignment.arrivalWindowStart,
      arrivalWindowEnd: assignment.arrivalWindowEnd,
      expectedDurationMinutes: assignment.expectedDurationMinutes,
    }),
    now,
  );
}

function JobCard({ assignment, job }: { assignment: JobAssignment; job: Job }) {
  return (
    <Link href={`/cleaner/jobs/${job.jobId}`} className="block">
      <Card>
        <p className="text-lg font-semibold">{job.snapshot.customerDisplayName}</p>
        <p className="text-sm text-ink/70">
          {serviceLabel(job.serviceType)} · {formatLongDate(job.date)}
        </p>
        <p className="mt-2 text-base">{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</p>
      </Card>
    </Link>
  );
}

export function CleanerHome() {
  const hub = useHub();
  const now = useNow();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  if (!cleaner) return null;
  const week = nextAvailabilityWeek(hub.today);
  const submitted = hub.submissions.some(
    (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === week.weekStart,
  );
  const invitations = hub.assignments.filter(
    (assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "INVITED",
  );
  const waiting = hub.assignments.filter(
    (assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "PENDING_AVAILABILITY",
  );
  const flagged = hub.assignments.filter(
    (assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "NEEDS_ATTENTION",
  );
  const confirmed = hub.assignments
    .filter((assignment) => assignment.cleanerId === cleaner.cleanerId && assignment.status === "CONFIRMED")
    .flatMap((assignment) => {
      const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
      return job && job.status === "SCHEDULED" ? [{ assignment, job }] : [];
    })
    .sort(
      (a, b) =>
        a.assignment.serviceDate.localeCompare(b.assignment.serviceDate) ||
        a.assignment.arrivalWindowStart.localeCompare(b.assignment.arrivalWindowStart),
    );
  const happening = confirmed.filter((item) => inProgress(item.assignment, now));
  const upcoming = confirmed.filter((item) => item.job.date >= hub.today && !happening.includes(item));

  return (
    <Screen>
      <PageHeader title={`Hi ${cleaner.firstName}`} subtitle="Your jobs and availability" />
      <div className="space-y-4 px-5 pt-5">
        {happening.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Happening Now</h2>
            {happening.map(({ assignment, job }) => (
              <JobCard key={assignment.assignmentId} assignment={assignment} job={job} />
            ))}
          </section>
        ) : null}

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

        {waiting.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Waiting on availability</h2>
            {waiting.map((assignment) => {
              const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
              if (!job) return null;
              return (
                <Card key={assignment.assignmentId}>
                  <p className="text-lg font-semibold">{job.snapshot.customerDisplayName}</p>
                  <p className="text-sm text-ink/70">
                    {formatLongDate(job.date)} · {assignment.pendingCrewSize ?? assignment.proposedCrewSize}{" "}
                    {(assignment.pendingCrewSize ?? assignment.proposedCrewSize) === 1 ? "person" : "people"}
                  </p>
                  <p className="mt-2 text-sm">
                    You said you will take this cleaning. It is confirmed after your availability for that week fits the schedule.
                  </p>
                </Card>
              );
            })}
          </section>
        ) : null}

        {flagged.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Needs attention</h2>
            {flagged.map((assignment) => {
              const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
              if (!job) return null;
              return (
                <Card key={assignment.assignmentId}>
                  <p className="text-lg font-semibold">{job.snapshot.customerDisplayName}</p>
                  <p className="text-sm text-ink/70">{formatLongDate(job.date)}</p>
                  <p className="mt-2 text-sm">{assignment.attentionReason ?? "This cleaning needs a schedule change before it can be confirmed."}</p>
                </Card>
              );
            })}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Upcoming jobs</h2>
          {upcoming.length === 0 ? (
            <Card>
              <p className="text-base text-ink/70">
                {happening.length > 0 ? "No other cleanings coming up." : "No confirmed cleanings yet."}
              </p>
            </Card>
          ) : (
            upcoming.map(({ assignment, job }) => <JobCard key={assignment.assignmentId} assignment={assignment} job={job} />)
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Next Week Availability</h2>
          <Card>
            <p className="text-xl font-semibold">{formatWeekRange(week.weekStart, week.weekEnd)}</p>
            <p className="mt-2 text-base">{submitted ? "✓ Submitted" : "⚠ Not submitted yet"}</p>
            <Link
              href="/cleaner/availability"
              className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
            >
              {submitted ? "Edit availability" : "Submit availability"}
            </Link>
          </Card>
        </section>
      </div>
    </Screen>
  );
}
