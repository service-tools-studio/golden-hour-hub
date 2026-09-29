"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Card, PageHeader, Screen } from "@/components/ui";
import { helpersApproved } from "@/lib/domain/cleaners";
import { formatMoney } from "@/lib/domain/compensation";
import type { JobAssignment } from "@/lib/domain/types";
import { calculateConfirmedHeadcount, calculateInvitedHeadcount } from "@/lib/domain/scheduling";
import { seriesSummary } from "@/lib/mock/seed";
import {
  arrivalMismatchText,
  dateReinviteNeeded,
  earliestCleanerArrival,
  formatArrival,
  formatDuration,
  formatLongDate,
  formatScheduleFacts,
  hourWindowLabel,
  noticeFlagText,
  noticeGap,
  payLine,
  reinviteFlagText,
  serviceEmoji,
  serviceLabel,
} from "@/lib/format";

export function AdminJobDetail({ jobId }: { jobId: string }) {
  const hub = useHub();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return <Missing label="That cleaning could not be found." href="/admin" />;
  const series = job.seriesId ? hub.series.find((item) => item.seriesId === job.seriesId) : undefined;
  const assignments = hub.assignments.filter(
    (item) => item.jobId === job.jobId && item.status !== "CANCELED" && item.status !== "EXPIRED_JOB_FILLED",
  );
  const assignedIds = new Set(assignments.map((item) => item.cleanerId));
  const pendingCleanerIds = (job.draftCleanerIds ?? []).filter((id) => !assignedIds.has(id));
  const invited = calculateInvitedHeadcount(assignments);
  const confirmed = calculateConfirmedHeadcount(assignments);
  const needed = job.headcountNeeded > 0 ? String(job.headcountNeeded) : "not set";
  const draft = job.status === "DRAFT";
  const full = !draft && job.headcountNeeded > 0 && confirmed >= job.headcountNeeded;
  const earliest = earliestCleanerArrival(cleanerArrivals(job, hub.assignments, hub.cleaners));
  const arrivalFlag =
    earliest &&
    job.arrivalWindowStart &&
    job.arrivalWindowEnd &&
    (job.arrivalWindowStart !== earliest.start || job.arrivalWindowEnd !== earliest.end)
      ? arrivalMismatchText(earliest.firstName, hourWindowLabel(earliest.start, earliest.end))
      : null;
  const reinviteFlag = reinviteFlagText(
    assignments
      .filter((assignment) => dateReinviteNeeded(assignment, job.date))
      .map((assignment) => hub.cleaners.find((cleaner) => cleaner.cleanerId === assignment.cleanerId)?.firstName)
      .filter((name): name is string => Boolean(name)),
  );
  return (
    <Screen>
      <PageHeader
        title={formatLongDate(job.date)}
        crumbs={[
          { href: "/admin/customers", label: "Customers" },
          { href: `/admin/customers/${job.customerId}`, label: job.snapshot.customerDisplayName },
        ]}
      />
      <div className="space-y-3 px-5 pt-4">
        <Card>
          <Link href={`/admin/jobs/${job.jobId}/edit`} className="block">
            <ServiceLine serviceType={job.serviceType} prominent />
            <div className="mt-3">
              {job.snapshot.propertyLabel ? <p className="font-semibold">{job.snapshot.propertyLabel}</p> : null}
              <p className={job.snapshot.propertyLabel ? "text-sm" : "font-semibold"}>{job.snapshot.streetAddress}</p>
              <p className="text-sm text-ink/70">
                {job.snapshot.city}, {job.snapshot.state} {job.snapshot.zip}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {job.snapshot.bedrooms} bed · {job.snapshot.bathrooms} bath · {job.snapshot.squareFeet.toLocaleString()} sq ft
              </p>
            </div>
            {job.snapshot.preferences ? <p className="mt-3 text-sm">Preferences: {job.snapshot.preferences}</p> : null}
            {job.specialInstructions ? <p className="mt-2 text-sm">Instructions: {job.specialInstructions}</p> : null}
            {job.arrivalWindowStart && job.arrivalWindowEnd ? (
              <p className="mt-3 text-sm">Earliest arrival {formatArrival(job.arrivalWindowStart, job.arrivalWindowEnd)}</p>
            ) : null}
            {arrivalFlag ? <p className="mt-2 text-sm font-semibold text-red-700">{arrivalFlag}</p> : null}
            {reinviteFlag ? <p className="mt-2 text-sm font-semibold text-red-700">{reinviteFlag}</p> : null}
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">
                <p>Invited headcount: {invited} / {needed}</p>
                <p>Confirmed headcount: {confirmed} / {needed}</p>
              </div>
              {full ? <span className="rounded-full bg-mint px-3 py-1 text-sm font-semibold">Fully Staffed</span> : null}
            </div>
          </Link>
          <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Cleaners</p>
            {pendingCleanerIds.length === 0 && assignments.length === 0 ? (
              <p className="text-sm text-ink/70">No cleaners assigned yet.</p>
            ) : null}
            {pendingCleanerIds.map((cleanerId) => {
              const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
              if (!cleaner) return null;
              const detail = job.draftCleanerDetails?.find((item) => item.cleanerId === cleanerId);
              const gap = detail ? noticeGap(true, detail) : null;
              return (
                <div key={cleanerId} className="flex items-start justify-between gap-3">
                  <Link href={`/admin/jobs/${job.jobId}/edit?cleaner=${cleanerId}`} className="block min-w-0 flex-1">
                    {detail ? (
                      <>
                        <p className="text-base font-semibold">
                          {cleaner.firstName} {cleaner.lastName}
                        </p>
                        <p className="mt-0.5 text-sm text-ink/55">
                          Draft assignment{detail.proposedCrewSize > 1 ? ` · crew of ${detail.proposedCrewSize}` : ""}
                        </p>
                        {gap ? <p className="mt-1 text-sm font-semibold text-red-700">{noticeFlagText(cleaner.firstName, gap)}</p> : null}
                        <ScheduleFacts
                          date={job.date}
                          arrivalWindowStart={detail.arrivalWindowStart}
                          arrivalWindowEnd={detail.arrivalWindowEnd}
                          expectedDurationMinutes={detail.expectedDurationMinutes}
                        />
                      </>
                    ) : (
                      <>
                        <p className="text-base font-semibold">
                          {cleaner.firstName} {cleaner.lastName}
                        </p>
                        <p className="text-sm text-ink/55">Details not set</p>
                      </>
                    )}
                  </Link>
                  <RemoveCleaner jobId={job.jobId} cleanerId={cleanerId} />
                </div>
              );
            })}
            {assignments.map((assignment) => {
              const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
              if (!cleaner) return null;
              const declined = assignment.status === "DECLINED";
              const gap = noticeGap(false, assignment, assignment.lastNotified);
              return (
                <div key={assignment.assignmentId} className={`flex items-start justify-between gap-3 ${declined ? "text-ink/45" : ""}`}>
                  <Link href={`/admin/jobs/${job.jobId}/edit?assignment=${assignment.assignmentId}`} className="block min-w-0 flex-1">
                    <p className="text-base font-semibold">
                      {cleaner.firstName} {cleaner.lastName}
                    </p>
                    <p className={`mt-0.5 text-sm ${declined ? "" : "text-ink/55"}`}>{assignmentSubtitle(assignment)}</p>
                    {gap ? <p className="mt-1 text-sm font-semibold text-red-700">{noticeFlagText(cleaner.firstName, gap)}</p> : null}
                    {dateReinviteNeeded(assignment, job.date) ? (
                      <p className="mt-1 text-sm font-semibold text-red-700">{reinviteFlagText([cleaner.firstName])}</p>
                    ) : null}
                    {assignment.attentionReason ? <p className="mt-1 text-sm">{assignment.attentionReason}</p> : null}
                    <ScheduleFacts
                      muted={declined}
                      date={assignment.serviceDate}
                      arrivalWindowStart={assignment.arrivalWindowStart}
                      arrivalWindowEnd={assignment.arrivalWindowEnd}
                      expectedDurationMinutes={assignment.expectedDurationMinutes}
                    />
                  </Link>
                  <RemoveCleaner jobId={job.jobId} cleanerId={cleaner.cleanerId} />
                </div>
              );
            })}
            <Link
              href={`/admin/jobs/${job.jobId}/cleaners`}
              className="flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
            >
              Add cleaner
            </Link>
          </div>
        </Card>
        {series ? (
          <RecurringCard
            jobId={job.jobId}
            customerId={job.customerId}
            dateLabel={formatLongDate(job.date)}
            seriesId={series.seriesId}
            summary={seriesSummary(series)}
            place={seriesPlace(hub.properties, series.propertyId, job.snapshot.streetAddress)}
            detail={`${series.status === "ACTIVE" ? "Active" : "Paused"} · Headcount ${series.defaultHeadcountNeeded}`}
            confirmDelete={confirmDelete}
            onAskDelete={() => setConfirmDelete(true)}
            onCloseDelete={() => setConfirmDelete(false)}
            onDeleteCleaning={() => {
              const result = hub.deleteJob(job.jobId);
              if (result.message) hub.flash(result.message);
              if (result.ok) router.push(`/admin/customers/${job.customerId}`);
            }}
            onDeleteSchedule={() => {
              const result = hub.deleteSeries(series.seriesId);
              if (result.message) hub.flash(result.message);
              if (result.ok) router.push(`/admin/customers/${job.customerId}`);
            }}
          />
        ) : null}
      </div>
    </Screen>
  );
}

function cleanerArrivals(
  job: { jobId: string; draftCleanerDetails?: { cleanerId: string; arrivalWindowStart: string; arrivalWindowEnd: string }[] },
  assignments: { jobId: string; cleanerId: string; status: string; arrivalWindowStart: string; arrivalWindowEnd: string }[],
  cleaners: { cleanerId: string; firstName: string }[],
): { firstName: string; start: string; end: string }[] {
  const windows: { firstName: string; start: string; end: string }[] = [];
  const covered = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.jobId !== job.jobId) continue;
    if (assignment.status === "CANCELED" || assignment.status === "EXPIRED_JOB_FILLED" || assignment.status === "DECLINED") continue;
    covered.add(assignment.cleanerId);
    const cleaner = cleaners.find((item) => item.cleanerId === assignment.cleanerId);
    if (!cleaner) continue;
    windows.push({ firstName: cleaner.firstName, start: assignment.arrivalWindowStart, end: assignment.arrivalWindowEnd });
  }
  for (const detail of job.draftCleanerDetails ?? []) {
    if (covered.has(detail.cleanerId)) continue;
    const cleaner = cleaners.find((item) => item.cleanerId === detail.cleanerId);
    if (!cleaner) continue;
    windows.push({ firstName: cleaner.firstName, start: detail.arrivalWindowStart, end: detail.arrivalWindowEnd });
  }
  return windows;
}

function seriesPlace(
  properties: { propertyId: string; label?: string; streetAddress: string }[],
  propertyId: string,
  fallback: string,
): string {
  const home = properties.find((property) => property.propertyId === propertyId);
  if (!home) return fallback;
  return home.label ? `${home.label} · ${home.streetAddress}` : home.streetAddress;
}

function RecurringCard({
  jobId,
  customerId,
  dateLabel,
  seriesId,
  summary,
  place,
  detail,
  confirmDelete,
  onAskDelete,
  onCloseDelete,
  onDeleteCleaning,
  onDeleteSchedule,
}: {
  jobId: string;
  customerId: string;
  dateLabel: string;
  seriesId: string;
  summary: string;
  place: string;
  detail: string;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCloseDelete: () => void;
  onDeleteCleaning: () => void;
  onDeleteSchedule: () => void;
}) {
  const editHref = `/admin/customers/${customerId}?series=${encodeURIComponent(seriesId)}&returnTo=${encodeURIComponent(`/admin/jobs/${jobId}`)}`;
  return (
    <>
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Recurring</p>
        <p className="mt-1 text-lg font-semibold">{summary}</p>
        <p className="mt-1 text-sm text-ink/70">{place}</p>
        <p className="text-sm text-ink/70">{detail}</p>
        <Link
          href={editHref}
          className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
        >
          Edit schedule
        </Link>
        <button
          type="button"
          onClick={onAskDelete}
          className="mt-1 flex min-h-12 w-full items-center justify-center font-semibold text-red-700 underline decoration-red-700 decoration-2 underline-offset-4"
        >
          Delete
        </button>
      </Card>
      {confirmDelete ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28" onClick={onCloseDelete}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-recurring-title"
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-recurring-title" className="text-lg font-semibold">
              Delete
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink/70">Remove only this cleaning, or the whole recurring schedule?</p>
            <div className="mt-4 space-y-2">
              <button type="button" onClick={onDeleteCleaning} className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink">
                This cleaning · {dateLabel}
              </button>
              <button type="button" onClick={onDeleteSchedule} className="min-h-12 w-full rounded-2xl bg-red-700 text-base font-semibold text-white">
                Recurring schedule
              </button>
              <button type="button" onClick={onCloseDelete} className="min-h-12 w-full text-base font-semibold text-ink/70">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RemoveCleaner({ jobId, cleanerId }: { jobId: string; cleanerId: string }) {
  const hub = useHub();
  return (
    <button
      type="button"
      className="shrink-0 text-sm font-semibold underline"
      onClick={() => {
        const result = hub.removeJobCleaner(jobId, cleanerId);
        if (result.message) hub.flash(result.message);
      }}
    >
      Remove
    </button>
  );
}

function assignmentSubtitle(assignment: JobAssignment): string {
  const crew = assignment.confirmedCrewSize ?? assignment.pendingCrewSize ?? assignment.proposedCrewSize;
  const crewText = crew > 1 ? ` · crew of ${crew}` : "";
  switch (assignment.status) {
    case "CONFIRMED":
      return `Confirmed${crewText}`;
    case "INVITED":
    case "PENDING_AVAILABILITY":
      return `Awaiting${crewText}`;
    case "NEEDS_ATTENTION":
      return "Needs attention";
    case "DECLINED":
      return "Declined";
    case "CANCELED":
      return "Canceled";
    case "EXPIRED_JOB_FILLED":
      return "Job filled";
  }
}

export function CleanerJobDetail({ jobId }: { jobId: string }) {
  const hub = useHub();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  const job = hub.jobs.find((item) => item.jobId === jobId);
  const assignment = hub.assignments.find(
    (item) => item.jobId === jobId && item.cleanerId === hub.cleanerId && item.status === "CONFIRMED",
  );
  if (!cleaner || !job || !assignment) {
    return <Missing label="That confirmed cleaning could not be found." href="/cleaner" />;
  }
  return (
    <Screen>
      <PageHeader eyebrow="Confirmed job" title={job.snapshot.customerDisplayName} subtitle={formatLongDate(job.date)} />
      <div className="space-y-3 px-5 pt-4">
        <Card>
          <ServiceLine serviceType={job.serviceType} />
          <p className="mt-3 text-sm text-ink/60">Arrival window</p>
          <p className="text-lg font-semibold">{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</p>
          <p className="text-sm text-ink/70">{formatDuration(assignment.expectedDurationMinutes)}</p>
          <p className="mt-4 flex items-start gap-2 text-base">
            <span aria-hidden="true">📍</span>
            <span>
              {job.snapshot.streetAddress}
              <br />
              {job.snapshot.city}, {job.snapshot.state} {job.snapshot.zip}
            </span>
          </p>
          <p className="mt-3 text-sm">
            {job.snapshot.bedrooms} bed · {job.snapshot.bathrooms} bath · {job.snapshot.squareFeet.toLocaleString()} sq ft
          </p>
          {job.snapshot.preferences ? <p className="mt-3 text-sm">Preferences: {job.snapshot.preferences}</p> : null}
          {job.specialInstructions ? <p className="mt-2 text-sm">Instructions: {job.specialInstructions}</p> : null}
        </Card>
        <Card>
          {helpersApproved(cleaner.maxHelperCount) ? (
            <>
              <p className="text-base">Confirmed crew size: {assignment.confirmedCrewSize}</p>
              <p className="mt-1 text-sm text-ink/70">
                {formatMoney(assignment.payPerPersonCents)} per person
              </p>
            </>
          ) : null}
          <p className="mt-2 text-xl font-semibold">{payLine(assignment, true)}</p>
          <p className="mt-4 text-sm leading-5 text-ink/70">
            {helpersApproved(cleaner.maxHelperCount)
              ? "Need to change your schedule or crew? Confirmed bookings cannot be changed or canceled through the app. Please call Kelsey."
              : "Need to change your schedule? Confirmed bookings cannot be changed or canceled through the app. Please call Kelsey."}
          </p>
        </Card>
      </div>
    </Screen>
  );
}

function ServiceLine({ serviceType, prominent = false }: { serviceType: Parameters<typeof serviceLabel>[0]; prominent?: boolean }) {
  const emoji = serviceEmoji(serviceType);
  return (
    <p className={`flex items-start gap-2 ${prominent ? "text-lg font-semibold" : "text-base"}`}>
      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
      <span>{serviceLabel(serviceType)}</span>
    </p>
  );
}

function ScheduleFacts({
  muted = false,
  ...input
}: {
  muted?: boolean;
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
}) {
  const facts = formatScheduleFacts(input);
  const items = [
    ["Arrive", facts.arrive],
    ["Length", facts.length],
    ["Ends", facts.ends],
  ] as const;
  return (
    <div className={`mt-3 grid grid-cols-3 gap-2 rounded-2xl px-3 py-2.5 ${muted ? "bg-white/50" : "bg-cream"}`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-ink/50">{label}</p>
          <p className="mt-0.5 text-sm font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Missing({ label, href }: { label: string; href: string }) {
  return (
    <Screen>
      <div className="px-5 pt-10">
        <p className="text-lg">{label}</p>
        <Link href={href} className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
          Go back
        </Link>
      </div>
    </Screen>
  );
}
