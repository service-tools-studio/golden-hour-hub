"use client";

import { useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import { helpersApproved, maxCrewSize } from "@/lib/domain/cleaners";
import { confirmedCompensationCents, formatMoney } from "@/lib/domain/compensation";
import { calculateRemainingHeadcount } from "@/lib/domain/scheduling";
import { mondayOf } from "@/lib/domain/time";
import { formatArrival, formatDuration, formatLongDate, serviceLabel } from "@/lib/format";
import type { CleanerProfile, Job, JobAssignment } from "@/lib/domain/types";

export function InvitationCard({
  assignment,
  job,
  cleaner,
}: {
  assignment: JobAssignment;
  job: Job;
  cleaner: CleanerProfile;
}) {
  const hub = useHub();
  const remaining = calculateRemainingHeadcount(
    job.headcountNeeded,
    hub.assignments.filter((item) => item.jobId === job.jobId),
  );
  const bringsHelpers = helpersApproved(cleaner.maxHelperCount);
  const weekSubmitted = hub.submissions.some(
    (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === mondayOf(job.date),
  );
  const ceiling = Math.min(maxCrewSize(cleaner.maxHelperCount), Math.max(remaining, 0));
  const initialCrew = bringsHelpers ? Math.min(assignment.proposedCrewSize, Math.max(ceiling, 1)) : 1;
  const [crew, setCrew] = useState(initialCrew);
  const [message, setMessage] = useState<string | null>(null);
  const attending = bringsHelpers ? crew : 1;
  const pay = confirmedCompensationCents({
    payType: assignment.payType,
    payPerPersonCents: assignment.payPerPersonCents,
    confirmedCrewSize: attending,
  });

  function accept() {
    const result = hub.acceptInvitation(assignment.assignmentId, attending);
    setMessage(result.ok ? result.message ?? null : result.message);
  }

  function decline() {
    const result = hub.declineInvitation(assignment.assignmentId);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">New job available</p>
      <h3 className="mt-1 text-xl font-semibold">
        {job.snapshot.customerDisplayName} {serviceLabel(job.serviceType)}
      </h3>
      <p className="mt-1 text-base text-ink/70">{formatLongDate(job.date)}</p>
      {job.seriesId ? (
        <p className="mt-2 text-sm text-ink/60">Recurring customer. You are accepting this cleaning only.</p>
      ) : null}
      <dl className="mt-4 space-y-2 text-base">
        <div className="flex justify-between gap-3">
          <dt className="text-ink/60">Arrival</dt>
          <dd>{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink/60">Expected duration</dt>
          <dd>{formatDuration(assignment.expectedDurationMinutes)}</dd>
        </div>
      </dl>
      {bringsHelpers ? (
        <div className="mt-4">
          <p className="text-sm text-ink/70">Number from your crew expected: {assignment.proposedCrewSize} people</p>
          <p className="mt-3 text-base font-medium">How many people from your crew can attend?</p>
          <div className="mt-2 flex items-center justify-between rounded-2xl bg-cream px-3 py-2">
            <button
              type="button"
              className="min-h-12 min-w-12 rounded-xl bg-white text-2xl"
              onClick={() => setCrew((value) => Math.max(1, value - 1))}
              aria-label="Fewer people"
            >
              −
            </button>
            <p className="text-2xl font-semibold">{crew}</p>
            <button
              type="button"
              className="min-h-12 min-w-12 rounded-xl bg-white text-2xl"
              onClick={() => setCrew((value) => Math.min(Math.max(ceiling, 1), value + 1))}
              aria-label="More people"
              disabled={ceiling < 1}
            >
              +
            </button>
          </div>
          <p className="mt-2 text-sm text-ink/60">This number includes you. The most you can bring is {maxCrewSize(cleaner.maxHelperCount)}.</p>
          <p className="mt-3 text-base">
            Rate: {formatMoney(assignment.payPerPersonCents)} per person
            <br />
            {crew} {crew === 1 ? "person" : "people"} → {formatMoney(pay)}
            {assignment.payType === "HOURLY" ? "/hour" : " total"}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-base">You will be attending this job.</p>
          <p className="text-base font-medium">Your pay: {formatMoney(pay)}{assignment.payType === "HOURLY" ? "/hour" : ""}</p>
        </div>
      )}
      {!weekSubmitted ? (
        <p className="mt-3 text-sm text-ink/70">
          Availability for this week is not in yet. Accepting saves your intent. The cleaning is confirmed once that week fits this schedule.
        </p>
      ) : null}
      {message ? (
        <div className="mt-3">
          <Notice>{message}</Notice>
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        <PrimaryButton onClick={accept}>
          {weekSubmitted ? (bringsHelpers ? "Confirm & Accept Job" : "Accept Job") : "I'll take this cleaning"}
        </PrimaryButton>
        <SecondaryButton onClick={decline}>Decline</SecondaryButton>
      </div>
    </Card>
  );
}
