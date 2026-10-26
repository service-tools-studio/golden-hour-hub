"use client";

import { useState } from "react";
import { AddressLink, fullAddress } from "@/components/address-link";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import { helpersApproved } from "@/lib/domain/cleaners";
import { confirmedCompensationCents } from "@/lib/domain/compensation";
import { invitationAttendanceBounds } from "@/lib/domain/scheduling";
import {
  cleanerInvitationPayLines,
  cleanerServiceLabel,
  customerFirstNameForCleaner,
  formatArrival,
  formatDuration,
  formatEstimatedOnSiteEnd,
  formatLongDate,
} from "@/lib/format";
import type { CleanerProfile, Job, JobAssignment } from "@/lib/domain/types";

export function ExpiredInvitationCard({
  assignment,
  job,
  cleaner,
  reason,
  onDismiss,
}: {
  assignment: JobAssignment;
  job: Job;
  cleaner: CleanerProfile;
  reason: string;
  onDismiss?: () => void;
}) {
  return (
    <InvitationCardContent
      assignment={assignment}
      job={job}
      cleaner={cleaner}
      expiredReason={reason}
      onDismissExpired={onDismiss}
    />
  );
}

export function InvitationCard({
  assignment,
  job,
  cleaner,
}: {
  assignment: JobAssignment;
  job: Job;
  cleaner: CleanerProfile;
}) {
  return <InvitationCardContent assignment={assignment} job={job} cleaner={cleaner} />;
}

function InvitationCardContent({
  assignment,
  job,
  cleaner,
  expiredReason,
  onDismissExpired,
}: {
  assignment: JobAssignment;
  job: Job;
  cleaner: CleanerProfile;
  expiredReason?: string;
  onDismissExpired?: () => void;
}) {
  const hub = useHub();
  const bringsHelpers = helpersApproved(cleaner.maxHelperCount);
  const attendance = invitationAttendanceBounds(assignment.proposedCrewSize, cleaner.maxHelperCount);
  const [crew, setCrew] = useState(attendance.default);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const attending = bringsHelpers ? crew : 1;
  const pay = confirmedCompensationCents({
    payType: assignment.payType,
    payPerPersonCents: assignment.payPerPersonCents,
    confirmedCrewSize: attending,
  });
  const estimatedEnd = formatEstimatedOnSiteEnd(
    assignment.arrivalWindowStart,
    assignment.arrivalWindowEnd,
    assignment.expectedDurationMinutes,
  );
  const invitePayLines = cleanerInvitationPayLines({
    bringsHelpers,
    payType: assignment.payType,
    crewTotalCents: pay,
    perPersonCents: assignment.payPerPersonCents,
    crewSize: bringsHelpers ? assignment.proposedCrewSize : 1,
  });

  async function accept() {
    if (pending) return;
    setPending("accept");
    setMessage(null);
    try {
      const result = await hub.acceptInvitation(assignment.assignmentId, attending);
      setMessage(result.ok ? result.message ?? null : result.message);
    } finally {
      setPending(null);
    }
  }

  async function decline() {
    if (pending) return;
    setPending("decline");
    setMessage(null);
    try {
      const result = await hub.declineInvitation(assignment.assignmentId);
      if (!result.ok) setMessage(result.message);
    } finally {
      setPending(null);
    }
  }

  const expired = Boolean(expiredReason);

  return (
    <Card className={expired ? "text-ink/75" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">
          {expired ? "Expired invitation" : "New job available"}
        </p>
        {expired && onDismissExpired ? (
          <button
            type="button"
            onClick={onDismissExpired}
            className="shrink-0 text-xs font-semibold text-ink/50 underline decoration-ink/25 underline-offset-2"
          >
            Dismiss
          </button>
        ) : null}
      </div>
      <h3 className="mt-1 text-xl font-semibold">
        {customerFirstNameForCleaner(job.snapshot)} - {cleanerServiceLabel(job.serviceType)}
      </h3>
      <p className="mt-1 text-base text-ink/70">{formatLongDate(job.date)}</p>
      <div className="mt-3 flex items-start gap-2 text-base">
        <span aria-hidden="true">📍</span>
        <AddressLink address={fullAddress(job.snapshot)}>
          {job.snapshot.streetAddress}
          <br />
          {job.snapshot.city}, {job.snapshot.state} {job.snapshot.zip}
        </AddressLink>
      </div>
      {job.seriesId ? (
        <p className="mt-2 text-sm text-ink/60">Recurring customer. You are accepting this cleaning only.</p>
      ) : null}
      <dl className="mt-4 space-y-2 text-base">
        <div className="flex justify-between gap-3">
          <dt className="text-ink/60">Start time</dt>
          <dd>{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink/60">Estimated cleaning time</dt>
          <dd className="text-right">
            {formatDuration(assignment.expectedDurationMinutes)}
            {estimatedEnd ? (
              <>
                <br />
                <span className="text-sm text-ink/70">Estimated end {estimatedEnd}</span>
              </>
            ) : null}
          </dd>
        </div>
      </dl>
      {bringsHelpers && !expired ? (
        <div className="mt-4">
          <p className="text-sm text-ink/70">Number from your crew expected: {assignment.proposedCrewSize} people</p>
          <p className="mt-3 text-base font-medium">How many people from your crew can attend?</p>
          <div className="mt-2 flex items-center justify-between rounded-2xl bg-cream px-3 py-2">
            <button
              type="button"
              className="min-h-12 min-w-12 rounded-xl bg-white text-2xl disabled:opacity-50"
              onClick={() => setCrew((value) => Math.max(attendance.min, value - 1))}
              aria-label="Fewer people"
              disabled={pending !== null || crew <= attendance.min}
            >
              −
            </button>
            <p className="text-2xl font-semibold">{crew}</p>
            <button
              type="button"
              className="min-h-12 min-w-12 rounded-xl bg-white text-2xl disabled:opacity-50"
              onClick={() => setCrew((value) => Math.min(attendance.max, value + 1))}
              aria-label="More people"
              disabled={pending !== null || crew >= attendance.max}
            >
              +
            </button>
          </div>
          <p className="mt-2 text-sm text-ink/60">
            This number includes you. The most for this invite is {attendance.max} {attendance.max === 1 ? "person" : "people"}.
          </p>
          <div className="mt-3 space-y-1 text-base">
            {invitePayLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-1">
          {invitePayLines.map((line) => (
            <p key={line} className="text-base font-medium">
              {line}
            </p>
          ))}
        </div>
      )}
      {message ? (
        <div className="mt-3">
          <Notice>{message}</Notice>
        </div>
      ) : null}
      {expiredReason ? (
        <p className="mt-4 text-sm leading-5 text-ink/70">{expiredReason}</p>
      ) : (
        <div className="mt-4 space-y-2" aria-busy={pending !== null}>
          <PrimaryButton
            onClick={accept}
            disabled={pending !== null}
            loading={pending === "accept"}
            loadingLabel="Accepting…"
          >
            {bringsHelpers ? "Confirm & Accept Job" : "Accept Job"}
          </PrimaryButton>
          <SecondaryButton
            onClick={decline}
            disabled={pending !== null}
            loading={pending === "decline"}
            loadingLabel="Declining…"
          >
            Decline
          </SecondaryButton>
        </div>
      )}
    </Card>
  );
}
