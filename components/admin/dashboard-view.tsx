"use client";

import Link from "next/link";
import { useState } from "react";
import { sendAvailabilityReminders } from "@/app/actions/reminders";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PageHeader, Screen } from "@/components/ui";
import { listSubmissionStatus } from "@/lib/domain/availability";
import { calculateConfirmedHeadcount } from "@/lib/domain/scheduling";
import { formatWeekRange, nextAvailabilityWeek } from "@/lib/domain/time";
import { crewLine, formatLongDate, relativeDay, serviceLabel } from "@/lib/format";

export function DashboardView() {
  const hub = useHub();
  const week = nextAvailabilityWeek(hub.today);
  const submissions = listSubmissionStatus(hub.cleaners, hub.submissions, week.weekStart);
  const submittedCount = submissions.filter((item) => item.submitted).length;
  const missing = submissions.filter((item) => !item.submitted);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const upcoming = hub.jobs
    .filter((job) => (job.status === "SCHEDULED" || job.status === "DRAFT") && job.date >= hub.today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const needsAttention = upcoming.filter((job) => {
    if (job.status === "DRAFT" || job.headcountNeeded < 1) return true;
    const people = calculateConfirmedHeadcount(hub.assignments.filter((item) => item.jobId === job.jobId));
    return people < job.headcountNeeded;
  });
  const staffed = upcoming.filter((job) => !needsAttention.includes(job));

  async function remind(ids: string[]) {
    setSending(true);
    const result = await sendAvailabilityReminders(ids);
    setNotice(result.message);
    setSending(false);
  }

  return (
    <Screen>
      <PageHeader title="Dashboard" subtitle={formatLongDate(hub.today)} />
      <div className="space-y-4 px-5 pt-5">
        {notice ? <Notice tone="ok">{notice}</Notice> : null}
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Next week</p>
          <h2 className="mt-1 text-2xl font-semibold">{formatWeekRange(week.weekStart, week.weekEnd)}</h2>
          <ul className="mt-4 space-y-3">
            {submissions.map((item) => (
              <li key={item.cleanerId} className="flex items-center justify-between gap-3">
                <p className="text-base">
                  <span className={item.submitted ? "text-ink" : "text-ink"}>{item.submitted ? "✓" : "⚠"}</span>{" "}
                  {item.firstName}
                  <span className="text-ink/60"> — {item.submitted ? "Submitted" : "Missing"}</span>
                </p>
                {item.submitted ? null : (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => remind([item.cleanerId])}
                    className="min-h-10 shrink-0 rounded-full bg-mint px-3 text-sm font-semibold text-ink"
                  >
                    Send Reminder
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink/70">
            {submittedCount} of {submissions.length} cleaners submitted
          </p>
          {missing.length > 0 ? (
            <button
              type="button"
              disabled={sending}
              onClick={() => remind(missing.map((item) => item.cleanerId))}
              className="mt-3 min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream"
            >
              Send All Reminders
            </button>
          ) : null}
        </Card>

        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">Jobs needing attention</h2>
          <Link href="/admin/schedule" className="text-sm font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4">
            Open Schedule
          </Link>
        </div>
        {needsAttention.length === 0 ? (
          <Card>
            <p className="text-base text-ink/70">Every upcoming cleaning is fully staffed.</p>
          </Card>
        ) : (
          needsAttention.map((job) => <JobStaffingCard key={job.jobId} jobId={job.jobId} />)
        )}

        {staffed.length > 0 ? (
          <>
            <h2 className="text-lg font-semibold">Fully staffed</h2>
            {staffed.map((job) => (
              <JobStaffingCard key={job.jobId} jobId={job.jobId} />
            ))}
          </>
        ) : null}
        <p className="text-sm text-ink/50">{serviceLabel("RECURRING")} jobs use the same headcount rules as one-time cleanings.</p>
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
