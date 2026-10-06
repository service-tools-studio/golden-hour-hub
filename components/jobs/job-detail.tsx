"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHub } from "@/components/hub-provider";
import { AlertIcon, Card, PageHeader, Screen } from "@/components/ui";
import { snapshotVisit } from "@/lib/domain/customers";
import { helpersApproved } from "@/lib/domain/cleaners";
import { formatMoney } from "@/lib/domain/compensation";
import type { JobAssignment } from "@/lib/domain/types";
import { calculateConfirmedHeadcount } from "@/lib/domain/scheduling";
import { seriesSummary } from "@/lib/mock/seed";
import {
  arrivalChangeSms,
  arrivalMismatchText,
  dateReinviteNeeded,
  earliestCleanerArrival,
  formatArrival,
  formatTimeLabel,
  formatDuration,
  formatLongDate,
  formatScheduleFacts,
  noticeFlagText,
  noticeGap,
  payLine,
  reinviteFlagText,
  serviceEmoji,
  cleanerArrivalChangeSms,
  serviceLabel,
  smsHref,
} from "@/lib/format";

export function AdminJobDetail({ jobId, fromSchedule = false }: { jobId: string; fromSchedule?: boolean }) {
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
  const confirmed = calculateConfirmedHeadcount(assignments);
  const needed = job.headcountNeeded > 0 ? String(job.headcountNeeded) : "not set";
  const draft = job.status === "DRAFT";
  const full = !draft && job.headcountNeeded > 0 && confirmed >= job.headcountNeeded;
  const earliest = earliestCleanerArrival(cleanerArrivals(job, hub.assignments, hub.cleaners));
  const customer = hub.customers.find((item) => item.customerId === job.customerId);
  const arrivalFlag =
    earliest &&
    job.arrivalWindowStart &&
    job.arrivalWindowEnd &&
    (job.arrivalWindowStart !== earliest.start || job.arrivalWindowEnd !== earliest.end)
      ? {
          text: arrivalMismatchText(
            formatTimeLabel(job.arrivalWindowStart),
            earliest.firstName,
            formatTimeLabel(earliest.start),
          ),
          callHref: customer?.phone ? `tel:+1${customer.phone}` : null,
          textHref: customer?.phone
            ? smsHref(
                customer.phone,
                arrivalChangeSms({
                  customerFirstName: customer.firstName,
                  date: job.date,
                  scheduledTime: formatTimeLabel(job.arrivalWindowStart),
                  arrivalTime: formatTimeLabel(earliest.start),
                }),
              )
            : null,
        }
      : null;
  const property = hub.properties.find((item) => item.propertyId === job.propertyId && item.customerId === job.customerId);
  const visit = customer && property ? snapshotVisit(customer, property) : job.snapshot;
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
        titleHref={fromSchedule ? `/admin/schedule?date=${job.date}&view=day` : undefined}
        current={fromSchedule ? visit.customerDisplayName : undefined}
        crumbs={
          fromSchedule
            ? [{ href: `/admin/schedule?date=${job.date}`, label: "Schedule" }]
            : [
                { href: "/admin/customers", label: "Customers" },
                { href: `/admin/customers/${job.customerId}`, label: visit.customerDisplayName },
              ]
        }
      />
      <div className="space-y-3 px-5 pt-4">
        <Card>
          <Link href={editPath(job.jobId, fromSchedule)} className="block">
            <ServiceLine serviceType={job.serviceType} prominent />
            <div className="mt-3">
              <p className="font-semibold">{visit.customerDisplayName}</p>
              {visit.propertyLabel ? <p className="font-semibold">{visit.propertyLabel}</p> : null}
              <div className="flex items-start gap-2">
                <span aria-hidden="true">📍</span>
                <div>
                  <p className={visit.propertyLabel ? "text-sm" : "font-semibold"}>{visit.streetAddress}</p>
                  <p className="text-sm text-ink/70">
                    {visit.city}, {visit.state} {visit.zip}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-sm text-ink/60">
                {visit.bedrooms} bed · {visit.bathrooms} bath · {visit.squareFeet.toLocaleString()} sq ft
              </p>
            </div>
            {visit.preferences ? <p className="mt-3 text-sm">Preferences: {visit.preferences}</p> : null}
            {job.specialInstructions ? <p className="mt-2 text-sm">Instructions: {job.specialInstructions}</p> : null}
            {job.arrivalWindowStart ? (
              <p className="mt-3 text-sm">Scheduled for {formatTimeLabel(job.arrivalWindowStart)}</p>
            ) : null}
          </Link>
          {arrivalFlag ? (
            <div className="mt-3 rounded-2xl bg-red-50 p-3">
              <p className="flex items-start gap-2 text-sm font-semibold text-red-700">
                <AlertIcon className="mt-0.5 size-4" />
                <span>{arrivalFlag.text}</span>
              </p>
              {arrivalFlag.textHref && arrivalFlag.callHref ? (
                <div className="mt-3 flex gap-2">
                  <a
                    href={arrivalFlag.textHref}
                    className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white"
                  >
                    Text client
                  </a>
                  <a
                    href={arrivalFlag.callHref}
                    className="inline-flex min-h-10 items-center rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold"
                  >
                    Call client
                  </a>
                </div>
              ) : (
                <Link
                  href={`/admin/customers/${job.customerId}`}
                  className="mt-3 inline-flex min-h-10 items-center rounded-full border border-ink/20 px-4 text-sm font-semibold"
                >
                  Add client phone to notify
                </Link>
              )}
            </div>
          ) : null}
          <Link href={editPath(job.jobId, fromSchedule)} className="block">
            {reinviteFlag ? <p className="mt-2 text-sm font-semibold text-red-700">{reinviteFlag}</p> : null}
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">
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
                  <Link href={editPath(job.jobId, fromSchedule, { cleaner: cleanerId })} className="block min-w-0 flex-1">
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
                        <p className="flex items-center gap-1.5 text-sm text-ink/55">
                          <WarningIcon />
                          Details not set
                        </p>
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
                  <div className="min-w-0 flex-1">
                    <Link href={editPath(job.jobId, fromSchedule, { assignment: assignment.assignmentId })} className="block">
                      <p className="text-base font-semibold">
                        {cleaner.firstName} {cleaner.lastName}
                      </p>
                      <p className={`mt-0.5 text-sm ${declined ? "" : "text-ink/55"}`}>{assignmentSubtitle(assignment)}</p>
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
                    {gap ? (
                      <NotifyCleanerNotice
                        firstName={cleaner.firstName}
                        gap={gap}
                        phone={cleaner.mobilePhone}
                        textHref={
                          cleaner.mobilePhone
                            ? smsHref(
                                cleaner.mobilePhone,
                                cleanerArrivalChangeSms({
                                  cleanerFirstName: cleaner.firstName,
                                  customerName: visit.customerDisplayName,
                                  date: assignment.serviceDate,
                                  arrivalWindowStart: assignment.arrivalWindowStart,
                                  arrivalWindowEnd: assignment.arrivalWindowEnd,
                                }),
                              )
                            : null
                        }
                        onContacted={() => hub.markAssignmentNotified(assignment.assignmentId)}
                      />
                    ) : null}
                  </div>
                  <RemoveCleaner jobId={job.jobId} cleanerId={cleaner.cleanerId} />
                </div>
              );
            })}
          </div>
        </Card>
        {series ? (
          <RecurringCard
            jobId={job.jobId}
            fromSchedule={fromSchedule}
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
        <Link
          href={fromSchedule ? `/admin/jobs/${job.jobId}/cleaners?from=schedule` : `/admin/jobs/${job.jobId}/cleaners`}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
        >
          Add cleaner
        </Link>
      </div>
    </Screen>
  );
}

function NotifyCleanerNotice({
  firstName,
  gap,
  phone,
  textHref,
  onContacted,
}: {
  firstName: string;
  gap: "assignment" | "changes";
  phone: string;
  textHref: string | null;
  onContacted: () => void;
}) {
  return (
    <div className="mt-2">
      <p className="text-sm font-semibold text-red-700">{noticeFlagText(firstName, gap)}</p>
      {phone && textHref ? (
        <div className="mt-2 flex gap-2">
          <a
            href={textHref}
            onClick={onContacted}
            className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white"
          >
            Text {firstName}
          </a>
          <a
            href={`tel:+1${phone}`}
            onClick={onContacted}
            className="inline-flex min-h-10 items-center rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold"
          >
            Call {firstName}
          </a>
        </div>
      ) : null}
    </div>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" role="img" aria-label="Warning">
      <path d="M10.3 3.6a2 2 0 0 1 3.4 0l8.4 14.6A2 2 0 0 1 20.4 21H3.6a2 2 0 0 1-1.7-2.8z" className="fill-amber-400" />
      <path d="M12 9v5" stroke="#333333" strokeWidth="2.25" strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="1.3" fill="#333333" />
    </svg>
  );
}

function editPath(jobId: string, fromSchedule: boolean, params: Record<string, string> = {}) {
  const search = new URLSearchParams(params);
  if (fromSchedule) search.set("from", "schedule");
  const query = search.toString();
  return `/admin/jobs/${jobId}/edit${query ? `?${query}` : ""}`;
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
  fromSchedule = false,
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
  fromSchedule?: boolean;
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
  const back = fromSchedule ? `/admin/jobs/${jobId}?from=schedule` : `/admin/jobs/${jobId}`;
  const editHref = `/admin/customers/${customerId}?series=${encodeURIComponent(seriesId)}&returnTo=${encodeURIComponent(back)}`;
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
        {KELSEY_PHONE ? (
          <div className="flex gap-2">
            <a
              href={`tel:+1${KELSEY_PHONE}`}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
            >
              Call Kelsey
            </a>
            <a
              href={`sms:+1${KELSEY_PHONE}`}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-ink/20 bg-white text-base font-semibold text-ink"
            >
              Text Kelsey
            </a>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}

const KELSEY_PHONE = (process.env.NEXT_PUBLIC_KELSEY_PHONE ?? "").replace(/\D/g, "");

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
    <div className={`mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl px-3 py-2.5 ${muted ? "bg-white/50" : "bg-cream"}`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-ink/50">{label}</p>
          <p className="mt-0.5 whitespace-nowrap text-sm font-semibold">{value}</p>
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
