"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useHub } from "@/components/hub-provider";
import { ExpiredInvitationCard, InvitationCard } from "@/components/cleaner/invitation-card";
import { Card, PageHeader, Screen } from "@/components/ui";
import { useNow } from "@/components/use-now";
import { hasKnownDurationMinutes } from "@/lib/domain/duration";
import {
  cleanerNeedsAttentionMessage,
  isAssignmentAvailabilityOutsideReason,
  isAssignmentScheduleConflictReason,
} from "@/lib/domain/invitations";
import {
  assignmentCountsAsUpcoming,
  calculateBlockedRange,
  calculateRemainingHeadcount,
  cleanerInvitationIsExpired,
  assignmentBelongsInCleanerJobHistory,
  assignmentIsCleanerHomeCommitted,
  invitedAssignmentIsActionable,
  isWithinRange,
} from "@/lib/domain/scheduling";
import { editableAvailabilityWeeks, formatWeekRange, mondayOf } from "@/lib/domain/time";
import { isUnsetArrival } from "@/lib/domain/arrival";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { SmsOptInActionBanner } from "@/components/cleaner/sms-opt-in-action-banner";
import {
  dismissExpiredInvitation,
  readDismissedExpiredInvitationIds,
} from "@/lib/cleaner/expired-invitation-dismissals";
import {
  questionnaireEffectiveReviewStatus,
  questionnaireReviewStatusClassName,
  questionnaireReviewStatusLabel,
} from "@/lib/domain/contractor-questionnaire";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import { useKelseyPhoneDigits } from "@/components/cleaner/kelsey-phone-context";
import { kelseyContactLinks } from "@/lib/contact";
import {
  cleanerExpiredInvitationReason,
  cleanerServiceLabel,
  customerFirstNameForCleaner,
  formatArrival,
  formatLongDate,
} from "@/lib/format";

function inProgress(assignment: JobAssignment, now: number): boolean {
  if (isUnsetArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)) return false;
  if (!hasKnownDurationMinutes(assignment.expectedDurationMinutes)) return false;
  return isWithinRange(
    calculateBlockedRange({
      date: assignment.serviceDate,
      arrivalWindowStart: assignment.arrivalWindowStart!,
      arrivalWindowEnd: assignment.arrivalWindowEnd!,
      expectedDurationMinutes: assignment.expectedDurationMinutes,
    }),
    now,
  );
}

function JobCard({
  assignment,
  job,
  muted = false,
}: {
  assignment: JobAssignment;
  job: Job;
  muted?: boolean;
}) {
  return (
    <Link href={`/cleaner/jobs/${job.jobId}`} className="block">
      <Card className={muted ? "text-ink/75" : undefined}>
        <p className={`text-lg font-semibold ${muted ? "text-ink/80" : ""}`}>
          {customerFirstNameForCleaner(job.snapshot)}
        </p>
        <p className="text-sm text-ink/70">
          {cleanerServiceLabel(job.serviceType)} · {formatLongDate(assignment.serviceDate)} ·{" "}
          {formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}
        </p>
      </Card>
    </Link>
  );
}

export function CleanerHome() {
  const hub = useHub();
  const kelseyContact = kelseyContactLinks(useKelseyPhoneDigits());
  const now = useNow();
  const [dismissedExpiredIds, setDismissedExpiredIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!hub.cleanerId) return;
    setDismissedExpiredIds(readDismissedExpiredInvitationIds(hub.cleanerId));
  }, [hub.cleanerId]);

  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  if (!cleaner) return null;
  const cleanerId = cleaner.cleanerId;
  const businessReviewStatus = questionnaireEffectiveReviewStatus(cleaner.businessQuestionnaire);

  function dismissExpiredInvite(assignmentId: string) {
    dismissExpiredInvitation(cleanerId, assignmentId);
    setDismissedExpiredIds((current) => new Set([...current, assignmentId]));
  }
  const availabilityWeeks = editableAvailabilityWeeks(hub.today);
  const invitationRows = hub.assignments
    .filter(
      (assignment) =>
        assignment.cleanerId === cleaner.cleanerId &&
        (assignment.status === "INVITED" || assignment.status === "EXPIRED_JOB_FILLED"),
    )
    .flatMap((assignment) => {
      const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
      if (!job) return [];
      const others = hub.assignments.filter(
        (item) => item.jobId === job.jobId && item.assignmentId !== assignment.assignmentId,
      );
      const remainingHeadcount = calculateRemainingHeadcount(job.headcountNeeded, others);
      return [{ assignment, job, remainingHeadcount }];
    });
  const invitations = invitationRows.filter(({ assignment, job, remainingHeadcount }) =>
    invitedAssignmentIsActionable(assignment, job, hub.today, now, remainingHeadcount),
  );
  const expiredInvitations = invitationRows
    .filter(({ assignment, job, remainingHeadcount }) =>
      cleanerInvitationIsExpired(assignment, job, hub.today, now, remainingHeadcount),
    )
    .sort(
      (a, b) =>
        b.assignment.serviceDate.localeCompare(a.assignment.serviceDate) ||
        (b.assignment.arrivalWindowStart ?? "").localeCompare(a.assignment.arrivalWindowStart ?? ""),
    );
  const visibleExpiredInvitations = expiredInvitations.filter(
    ({ assignment }) => !dismissedExpiredIds.has(assignment.assignmentId),
  );
  const flagged = hub.assignments.filter(
    (assignment) =>
      assignment.cleanerId === cleaner.cleanerId &&
      assignment.status === "NEEDS_ATTENTION" &&
      !isAssignmentScheduleConflictReason(assignment.attentionReason),
  );
  const committed = hub.assignments
    .filter(
      (assignment) =>
        assignment.cleanerId === cleaner.cleanerId && assignmentIsCleanerHomeCommitted(assignment.status),
    )
    .flatMap((assignment) => {
      const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
      return job ? [{ assignment, job }] : [];
    })
    .sort(
      (a, b) =>
        a.assignment.serviceDate.localeCompare(b.assignment.serviceDate) ||
        (a.assignment.arrivalWindowStart ?? "").localeCompare(b.assignment.arrivalWindowStart ?? ""),
    );
  const active = committed.filter((item) => item.job.status === "SCHEDULED");
  const happening = active.filter((item) => inProgress(item.assignment, now));
  const upcoming = active.filter(
    (item) =>
      !happening.includes(item) &&
      assignmentCountsAsUpcoming(item.assignment, item.job, hub.today, now),
  );
  const history = committed
    .filter((item) => assignmentBelongsInCleanerJobHistory(item.assignment, item.job, hub.today, now))
    .sort(
      (a, b) =>
        b.assignment.serviceDate.localeCompare(a.assignment.serviceDate) ||
        (b.assignment.arrivalWindowStart ?? "").localeCompare(a.assignment.arrivalWindowStart ?? ""),
    );
  const showSmsOptInBanner = !cleanerAllowsSchedulingSms(cleaner);

  return (
    <Screen>
      <PageHeader title={`What up, ${cleaner.firstName}!`} subtitle="Your jobs and availability" />
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
            {invitations.map(({ assignment, job }) => (
              <InvitationCard key={assignment.assignmentId} assignment={assignment} job={job} cleaner={cleaner} />
            ))}
          </section>
        ) : null}

        {flagged.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Needs attention</h2>
            {flagged.map((assignment) => {
              const job = hub.jobs.find((item) => item.jobId === assignment.jobId);
              if (!job) return null;
              const availabilityMismatch = isAssignmentAvailabilityOutsideReason(assignment);
              return (
                <Card key={assignment.assignmentId}>
                  <p className="text-lg font-semibold">{customerFirstNameForCleaner(job.snapshot)}</p>
                  <p className="text-sm text-ink/70">
                    {formatLongDate(job.date)} · {formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}
                  </p>
                  <p className="mt-2 text-sm leading-5">{cleanerNeedsAttentionMessage(assignment)}</p>
                  {availabilityMismatch ? (
                    <div className="mt-4 space-y-2">
                      <Link
                        href={`/cleaner/availability?week=${assignment.availabilityConflictWeekStart ?? mondayOf(assignment.serviceDate)}`}
                        className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
                      >
                        Edit availability
                      </Link>
                      {kelseyContact ? (
                        <div className="flex gap-2">
                          <a
                            href={kelseyContact.telHref}
                            className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
                          >
                            Call Kelsey
                          </a>
                          <a
                            href={kelseyContact.smsHref}
                            className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-ink/20 bg-white text-base font-semibold text-ink"
                          >
                            Text Kelsey
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </section>
        ) : null}

        {showSmsOptInBanner ? <SmsOptInActionBanner /> : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Business information</h2>
          <Card>
            <p className="text-base text-ink/75">
              Share how your cleaning business is set up and who may work on Golden Hour jobs.
            </p>
            <p className="mt-2 text-sm text-ink/60">
              Status:{" "}
              <span className={questionnaireReviewStatusClassName(businessReviewStatus)}>
                {questionnaireReviewStatusLabel(businessReviewStatus)}
              </span>
            </p>
            <Link
              href="/cleaner/business"
              className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
            >
              {cleaner.businessQuestionnaire?.submittedAt ? "Update business information" : "Complete business information"}
            </Link>
          </Card>
        </section>

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
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Availability</h2>
          {availabilityWeeks.map((week, index) => {
            const submitted = hub.submissions.some(
              (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === week.weekStart,
            );
            return (
              <Card key={week.weekStart}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
                  {index === 0 ? "Current week" : "Next week"}
                </p>
                <p className="mt-1 text-xl font-semibold">{formatWeekRange(week.weekStart, week.weekEnd)}</p>
                <p className="mt-2 text-base">{submitted ? "✓ Submitted" : "⚠ Not submitted yet"}</p>
                <Link
                  href={`/cleaner/availability?week=${week.weekStart}`}
                  className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
                >
                  {submitted ? "Edit availability" : "Submit availability"}
                </Link>
              </Card>
            );
          })}
        </section>

        {visibleExpiredInvitations.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Expired invitations</h2>
            {visibleExpiredInvitations.map(({ assignment, job, remainingHeadcount }) => (
              <ExpiredInvitationCard
                key={assignment.assignmentId}
                assignment={assignment}
                job={job}
                cleaner={cleaner}
                reason={cleanerExpiredInvitationReason(assignment, job, remainingHeadcount)}
                onDismiss={() => dismissExpiredInvite(assignment.assignmentId)}
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Job history</h2>
          {history.length === 0 ? (
            <Card>
              <p className="text-base text-ink/70">No past jobs yet.</p>
            </Card>
          ) : (
            history.map(({ assignment, job }) => (
              <JobCard key={assignment.assignmentId} assignment={assignment} job={job} muted />
            ))
          )}
        </section>
      </div>
    </Screen>
  );
}
