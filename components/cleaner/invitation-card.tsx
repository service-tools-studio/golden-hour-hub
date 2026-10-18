"use client";

import { useState } from "react";
import { AddressLink, fullAddress } from "@/components/address-link";
import { useHub } from "@/components/hub-provider";
import { Card, Notice, PrimaryButton, SecondaryButton } from "@/components/ui";
import { helpersApproved, maxCrewSize } from "@/lib/domain/cleaners";
import { confirmedCompensationCents, formatMoney } from "@/lib/domain/compensation";
import { calculateRemainingHeadcount } from "@/lib/domain/scheduling";
import { mondayOf } from "@/lib/domain/time";
import {
  cleanerServiceLabel,
  customerFirstNameForCleaner,
  formatArrival,
  formatDuration,
  formatLongDate,
} from "@/lib/format";
import type { CleanerProfile, Job, JobAssignment } from "@/lib/domain/types";

function InvitationActionSpinner() {
  return (
    <span
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
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
  const hub = useHub();
  const remaining = calculateRemainingHeadcount(
    job.headcountNeeded,
    hub.assignments.filter((item) => item.jobId === job.jobId),
  );
  const bringsHelpers = helpersApproved(cleaner.maxHelperCount);
  const weekSubmitted = hub.submissions.some(
    (submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === mondayOf(job.date),
  );
  const maxAttendance = Math.min(
    assignment.proposedCrewSize,
    maxCrewSize(cleaner.maxHelperCount),
    Math.max(remaining, 1),
  );
  const initialCrew = bringsHelpers ? Math.min(assignment.proposedCrewSize, maxAttendance) : 1;
  const [crew, setCrew] = useState(initialCrew);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const attending = bringsHelpers ? crew : 1;
  const pay = confirmedCompensationCents({
    payType: assignment.payType,
    payPerPersonCents: assignment.payPerPersonCents,
    confirmedCrewSize: attending,
  });
  const hourlySuffix = assignment.payType === "HOURLY" ? "/hour" : "";

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

  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">New job available</p>
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
          <dt className="text-ink/60">Arrival window</dt>
          <dd>{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink/60">Estimated cleaning time</dt>
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
              className="min-h-12 min-w-12 rounded-xl bg-white text-2xl disabled:opacity-50"
              onClick={() => setCrew((value) => Math.max(1, value - 1))}
              aria-label="Fewer people"
              disabled={pending !== null}
            >
              −
            </button>
            <p className="text-2xl font-semibold">{crew}</p>
            <button
              type="button"
              className="min-h-12 min-w-12 rounded-xl bg-white text-2xl disabled:opacity-50"
              onClick={() => setCrew((value) => Math.min(maxAttendance, value + 1))}
              aria-label="More people"
              disabled={pending !== null || maxAttendance < 1}
            >
              +
            </button>
          </div>
          <p className="mt-2 text-sm text-ink/60">
            This number includes you. The most for this invite is {maxAttendance} {maxAttendance === 1 ? "person" : "people"}.
          </p>
          <p className="mt-3 text-base">
            {assignment.payType === "FLAT" ? "Flat rate" : "Rate"}: {formatMoney(pay)}
            {assignment.payType === "HOURLY" ? hourlySuffix : ""} total
            <br />
            {crew} {crew === 1 ? "person" : "people"} → {formatMoney(assignment.payPerPersonCents)} per person
            {assignment.payType === "HOURLY" ? hourlySuffix : ""}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-base font-medium">
            {assignment.payType === "FLAT" ? "Flat rate" : "Your pay"}: {formatMoney(pay)}
            {assignment.payType === "HOURLY" ? "/hour" : ""}
          </p>
        </div>
      )}
      {message ? (
        <div className="mt-3">
          <Notice>{message}</Notice>
        </div>
      ) : null}
      <div className="mt-4 space-y-2" aria-busy={pending !== null}>
        <PrimaryButton onClick={accept} disabled={pending !== null}>
          {pending === "accept" ? (
            <span className="inline-flex items-center gap-2">
              <InvitationActionSpinner />
              Accepting…
            </span>
          ) : weekSubmitted ? (
            bringsHelpers ? "Confirm & Accept Job" : "Accept Job"
          ) : (
            "I'll take this cleaning"
          )}
        </PrimaryButton>
        <SecondaryButton onClick={decline} disabled={pending !== null}>
          {pending === "decline" ? (
            <span className="inline-flex items-center gap-2">
              <InvitationActionSpinner />
              Declining…
            </span>
          ) : (
            "Decline"
          )}
        </SecondaryButton>
      </div>
    </Card>
  );
}
