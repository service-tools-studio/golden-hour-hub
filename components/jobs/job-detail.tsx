"use client";

import Link from "next/link";
import { NavigatingLink } from "@/components/navigating-link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHub } from "@/components/hub-provider";
import { deliverSchedulingCleanerSms } from "@/lib/cleaner/deliver-scheduling-sms";
import { AddToCalendarButton } from "@/components/add-to-calendar";
import { AddressLink, fullAddress } from "@/components/address-link";
import {
  type CleaningOrigin,
  customerCleaningsOnDate,
  groupedCustomerDayView,
  withOrigin,
} from "@/components/jobs/origin";
import { AlertIcon, Card, PageHeader, Screen } from "@/components/ui";
import { snapshotVisit } from "@/lib/domain/customers";
import { helpersApproved } from "@/lib/domain/cleaners";
import { formatMoney } from "@/lib/domain/compensation";
import { useKelseyPhoneDigits } from "@/components/cleaner/kelsey-phone-context";
import { kelseyContactLinks } from "@/lib/contact";
import type { Job, JobAssignment } from "@/lib/domain/types";
import { liveAvailabilityAttentionMessage } from "@/lib/domain/invitations";
import {
  CLEANING_DELETE_BLOCKED_MESSAGE,
  calculateConfirmedHeadcount,
  isConfirmedScheduleConflictReason,
  jobHasCleanerBlockingDeletion,
  windowsForCleaner,
} from "@/lib/domain/scheduling";
import { seriesSummary } from "@/lib/mock/seed";
import {
  arrivalChangeSms,
  arrivalMismatchText,
  dateReinviteNeeded,
  earliestCleanerArrival,
  formatArrival,
  formatTimeLabel,
  formatDuration,
  ESTIMATED_ON_SITE_FIELD_LABEL,
  formatEstimatedOnSiteEnd,
  formatLongDate,
  formatScheduleFacts,
  assignmentNotifiesOnRemoval,
  assignmentTracksCleanerNotification,
  noticeFlagText,
  noticeGap,
  assignmentPayPerPersonDetail,
  payLine,
  propertySizeLabel,
  reinviteFlagText,
  serviceEmoji,
  cleanerAssignmentChangeSms,
  cleanerCleaningSmsDetails,
  cleanerRemovedFromJobSms,
  customerFirstNameForCleaner,
  manualCleanerSmsBody,
  cleanerServiceLabel,
  cleanerTextKelseyAboutJobBody,
  serviceLabel,
  smsHref,
} from "@/lib/format";

export function AdminJobDetail({ jobId, from }: { jobId: string; from?: CleaningOrigin }) {
  const fromSchedule = from === "schedule";
  const hub = useHub();
  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return <Missing label="That cleaning could not be found." href="/admin" />;
  const customer = hub.customers.find((item) => item.customerId === job.customerId);
  const property = hub.properties.find((item) => item.propertyId === job.propertyId && item.customerId === job.customerId);
  const visit = customer && property ? snapshotVisit(customer, property) : job.snapshot;
  const jobsOnDay = groupedCustomerDayView(from)
    ? customerCleaningsOnDate(hub.jobs, job.customerId, job.date)
    : [job];
  return (
    <Screen>
      <PageHeader
        title={formatLongDate(job.date)}
        titleHref={fromSchedule ? `/admin/schedule?date=${job.date}&view=day` : undefined}
        current={fromSchedule || from === "dashboard" ? visit.customerDisplayName : undefined}
        crumbs={
          fromSchedule
            ? [{ href: `/admin/schedule?date=${job.date}&view=day`, label: "Schedule" }]
            : from === "dashboard"
              ? [{ href: "/admin", label: "Dashboard" }]
              : [
                { href: "/admin/customers", label: "Customers" },
                { href: `/admin/customers/${job.customerId}`, label: visit.customerDisplayName },
              ]
        }
      />
      <div className="space-y-8 px-5 pt-4">
        {jobsOnDay.map((item) => (
          <JobCleaningPanel key={item.jobId} job={item} from={from} />
        ))}
      </div>
    </Screen>
  );
}

function assignmentNoticeDismissKey(assignment: JobAssignment): string {
  return `${assignment.assignmentId}:${assignment.updatedAt}`;
}

function JobCleaningPanel({ job, from }: { job: Job; from?: CleaningOrigin }) {
  const hub = useHub();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [navigatingAway, setNavigatingAway] = useState(false);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(() => new Set());
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
  const deleteCleaningBlocked = jobHasCleanerBlockingDeletion(hub.assignments, job.jobId);
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
  const sizeLine = propertySizeLabel(visit.bedrooms, visit.bathrooms, visit.squareFeet);
  if (navigatingAway) return null;

  return (
    <div className="space-y-3">
        <Card>
          <NavigatingLink href={editPath(job.jobId, from)} className="block">
            <ServiceLine serviceType={job.serviceType} prominent />
            <div className="mt-3">
              <p className="font-semibold">{visit.customerDisplayName}</p>
              {visit.propertyLabel ? <p className="font-semibold">{visit.propertyLabel}</p> : null}
              <div className="flex items-start gap-2">
                <span aria-hidden="true">📍</span>
                <span className="inline-block">
                  <span className={`block ${visit.propertyLabel ? "text-sm" : "font-semibold"}`}>
                    {visit.unit ? `${visit.streetAddress}, ${visit.unit}` : visit.streetAddress}
                  </span>
                  <span className="block text-sm text-ink/70">
                    {visit.city}, {visit.state} {visit.zip}
                  </span>
                </span>
              </div>
              {sizeLine ? <p className="mt-1 text-sm text-ink/60">{sizeLine}</p> : null}
            </div>
            {visit.preferences ? <JobNoteBlock label="Preferences" text={visit.preferences} /> : null}
            {job.specialInstructions ? (
              <JobNoteBlock label="Instructions" text={job.specialInstructions} className="mt-2" />
            ) : null}
            {job.arrivalWindowStart ? (
              <p className="mt-3 text-sm">Scheduled for {formatTimeLabel(job.arrivalWindowStart)}</p>
            ) : null}
            {job.pricePerVisitCents !== undefined ? (
              <p className="mt-2 text-sm text-ink/70">Price per visit: {formatMoney(job.pricePerVisitCents)}</p>
            ) : null}
          </NavigatingLink>
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
          <NavigatingLink href={editPath(job.jobId, from)} className="block">
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">
                <p>Confirmed headcount: {confirmed} / {needed}</p>
              </div>
              {full ? <span className="rounded-full bg-mint px-3 py-1 text-sm font-semibold">Fully Staffed</span> : null}
            </div>
          </NavigatingLink>
          <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Cleaners</p>
            {pendingCleanerIds.length === 0 && assignments.length === 0 ? (
              <p className="text-sm text-ink/70">No cleaners assigned yet.</p>
            ) : null}
            {pendingCleanerIds.map((cleanerId) => {
              const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
              if (!cleaner) return null;
              const detail = job.draftCleanerDetails?.find((item) => item.cleanerId === cleanerId);
              return (
                <div key={cleanerId} className="flex items-start justify-between gap-3">
                  <NavigatingLink href={editPath(job.jobId, from, { cleaner: cleanerId })} className="block min-w-0 flex-1">
                    {detail ? (
                      <>
                        <p className="text-base font-semibold">
                          {cleaner.firstName} {cleaner.lastName}
                        </p>
                        <p className="mt-0.5 text-sm text-ink/55">
                          Draft assignment{detail.proposedCrewSize > 1 ? ` · crew of ${detail.proposedCrewSize}` : ""}
                        </p>
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
                  </NavigatingLink>
                  <RemoveCleaner jobId={job.jobId} cleanerId={cleanerId} />
                </div>
              );
            })}
            {assignments.map((assignment) => {
              const cleaner = hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId);
              if (!cleaner) return null;
              const declined = assignment.status === "DECLINED";
              const gap = assignmentTracksCleanerNotification(assignment.status)
                ? noticeGap(false, assignment, assignment.lastNotified)
                : null;
              const noticeKey = assignmentNoticeDismissKey(assignment);
              const showNotice = Boolean(gap) && !dismissedNotices.has(noticeKey);
              const attentionMessage =
                liveAvailabilityAttentionMessage({
                  assignment,
                  cleaner,
                  serviceDate: assignment.serviceDate,
                  windows: windowsForCleaner(hub.availability, cleaner.cleanerId),
                  confirmedAssignments: hub.assignments,
                  arrivalWindowStart: assignment.arrivalWindowStart,
                  arrivalWindowEnd: assignment.arrivalWindowEnd,
                  expectedDurationMinutes: assignment.expectedDurationMinutes,
                }) ??
                (isConfirmedScheduleConflictReason(assignment.attentionReason) ? null : assignment.attentionReason);
              return (
                <div key={assignment.assignmentId} className={`flex items-start justify-between gap-3 ${declined ? "text-ink/45" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <NavigatingLink href={editPath(job.jobId, from, { assignment: assignment.assignmentId })} className="block">
                      <p className="text-base font-semibold">
                        {cleaner.firstName} {cleaner.lastName}
                      </p>
                      <p className={`mt-0.5 text-sm ${declined ? "" : "text-ink/55"}`}>{assignmentSubtitle(assignment)}</p>
                      {showNotice ? (
                        <p className="mt-1 text-sm font-semibold text-red-700">{noticeFlagText(cleaner.firstName, gap!)}</p>
                      ) : null}
                      {dateReinviteNeeded(assignment, job.date) ? (
                        <p className="mt-1 text-sm font-semibold text-red-700">{reinviteFlagText([cleaner.firstName])}</p>
                      ) : null}
                      {attentionMessage ? (
                        <p className="mt-1 text-sm font-semibold text-red-700">{attentionMessage}</p>
                      ) : null}
                      <ScheduleFacts
                        muted={declined}
                        date={assignment.serviceDate}
                        arrivalWindowStart={assignment.arrivalWindowStart}
                        arrivalWindowEnd={assignment.arrivalWindowEnd}
                        expectedDurationMinutes={assignment.expectedDurationMinutes}
                      />
                    </NavigatingLink>
                    {showNotice ? (
                      <NotifyCleanerNotice
                        firstName={cleaner.firstName}
                        phone={cleaner.mobilePhone}
                        textHref={
                          cleaner.mobilePhone
                            ? smsHref(
                              cleaner.mobilePhone,
                              manualCleanerSmsBody(
                                cleanerAssignmentChangeSms({
                                  cleanerFirstName: cleaner.firstName,
                                  expectedDurationMinutes: assignment.expectedDurationMinutes,
                                  details: cleanerCleaningSmsDetails({
                                    date: assignment.serviceDate,
                                    arrivalWindowStart: assignment.arrivalWindowStart,
                                    serviceType: job.serviceType,
                                    snapshot: visit,
                                    specialInstructions: job.specialInstructions,
                                  }),
                                }),
                              ),
                            )
                            : null
                        }
                        onContacted={() => hub.markAssignmentNotified(assignment.assignmentId)}
                        onDismiss={() =>
                          setDismissedNotices((current) => {
                            const next = new Set(current);
                            next.add(noticeKey);
                            return next;
                          })
                        }
                      />
                    ) : null}
                  </div>
                  <RemoveCleaner jobId={job.jobId} cleanerId={cleaner.cleanerId} />
                </div>
              );
            })}
          </div>
        </Card>
        <Link
          href={withOrigin(`/admin/jobs/${job.jobId}/cleaners`, from)}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-cream"
        >
          Add cleaner
        </Link>
        {series ? (
          <RecurringCard
            jobId={job.jobId}
            from={from}
            customerId={job.customerId}
            dateLabel={formatLongDate(job.date)}
            seriesId={series.seriesId}
            summary={seriesSummary(series)}
            place={seriesPlace(hub.properties, series.propertyId, job.snapshot.streetAddress)}
            placeAddress={fullAddress(hub.properties.find((property) => property.propertyId === series.propertyId) ?? job.snapshot)}
            detail={[
              series.status === "ACTIVE" ? "Active" : "Paused",
              `Headcount ${series.defaultHeadcountNeeded}`,
              series.defaultPricePerVisitCents !== undefined
                ? `${formatMoney(series.defaultPricePerVisitCents)} per visit`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            confirmDelete={confirmDelete}
            onAskDelete={() => setConfirmDelete(true)}
            onCloseDelete={() => setConfirmDelete(false)}
            deleteCleaningBlocked={deleteCleaningBlocked}
            onDeleteCleaning={() => {
              const result = hub.deleteJob(job.jobId);
              if (result.message) hub.flash(result.message);
              if (!result.ok) return;
              setNavigatingAway(true);
              if (groupedCustomerDayView(from)) {
                const remaining = customerCleaningsOnDate(hub.jobs, job.customerId, job.date).filter(
                  (item) => item.jobId !== job.jobId,
                );
                router.push(
                  remaining[0]
                    ? withOrigin(`/admin/jobs/${remaining[0].jobId}`, from)
                    : from === "schedule"
                      ? `/admin/schedule?date=${job.date}&view=day`
                      : "/admin",
                );
                return;
              }
              router.push(`/admin/customers/${job.customerId}`);
            }}
            onDeleteSchedule={() => {
              const result = hub.deleteSeries(series.seriesId);
              if (result.message) hub.flash(result.message);
              if (result.ok) router.push(`/admin/customers/${job.customerId}`);
            }}
          />
        ) : null}
    </div>
  );
}

function NotifyCleanerNotice({
  firstName,
  phone,
  textHref,
  onContacted,
  onDismiss,
}: {
  firstName: string;
  phone: string;
  textHref: string | null;
  onContacted: () => void;
  onDismiss: () => void;
}) {
  const pillClass =
    "flex min-h-10 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full px-1 text-sm font-semibold";
  return (
    <div className="mt-2 flex flex-nowrap items-center gap-2">
      {phone && textHref ? (
        <>
          <a
            href={textHref}
            onClick={onContacted}
            aria-label={`Text ${firstName}`}
            className={`${pillClass} bg-ink text-white`}
          >
            Text
          </a>
          <a
            href={`tel:+1${phone}`}
            onClick={onContacted}
            aria-label={`Call ${firstName}`}
            className={`${pillClass} border border-ink/20 bg-white text-ink`}
          >
            Call
          </a>
        </>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 px-1 text-sm font-semibold text-ink/70 underline decoration-ink/40 decoration-2 underline-offset-4"
      >
        Dismiss
      </button>
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

function JobNoteBlock({ label, text, className = "mt-3" }: { label: string; text: string; className?: string }) {
  return (
    <div className={`${className} text-sm`}>
      <p className="font-semibold text-ink/70">{label}</p>
      <p className="mt-1 whitespace-pre-line pl-4">{text}</p>
    </div>
  );
}

function editPath(jobId: string, from: CleaningOrigin | undefined, params: Record<string, string> = {}) {
  return withOrigin(`/admin/jobs/${jobId}/edit`, from, params);
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
  from,
  dateLabel,
  seriesId,
  summary,
  place,
  placeAddress,
  detail,
  confirmDelete,
  onAskDelete,
  onCloseDelete,
  deleteCleaningBlocked,
  onDeleteCleaning,
  onDeleteSchedule,
}: {
  jobId: string;
  customerId: string;
  from?: CleaningOrigin;
  dateLabel: string;
  seriesId: string;
  summary: string;
  place: string;
  placeAddress: string;
  detail: string;
  confirmDelete: boolean;
  deleteCleaningBlocked: boolean;
  onAskDelete: () => void;
  onCloseDelete: () => void;
  onDeleteCleaning: () => void;
  onDeleteSchedule: () => void;
}) {
  const back = withOrigin(`/admin/jobs/${jobId}`, from);
  const editHref = `/admin/customers/${customerId}?series=${encodeURIComponent(seriesId)}&returnTo=${encodeURIComponent(back)}`;
  return (
    <>
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Recurring schedule</p>
        <p className="mt-1 text-lg font-semibold">{summary}</p>
        <p className="mt-1 text-sm text-ink/70">
          {place}
        </p>
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
          Delete schedule
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
            {deleteCleaningBlocked ? (
              <p className="mt-3 text-sm text-ink/70">{CLEANING_DELETE_BLOCKED_MESSAGE}</p>
            ) : null}
            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={deleteCleaningBlocked}
                onClick={onDeleteCleaning}
                className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink disabled:opacity-50"
              >
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

  function remove() {
    const job = hub.jobs.find((item) => item.jobId === jobId);
    const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
    const assignment = hub.assignments.find(
      (item) =>
        item.jobId === jobId &&
        item.cleanerId === cleanerId &&
        item.status !== "CANCELED" &&
        item.status !== "EXPIRED_JOB_FILLED",
    );
    const notify = assignmentNotifiesOnRemoval(assignment?.status);
    const result = hub.removeJobCleaner(jobId, cleanerId);
    if (!result.ok) {
      if (result.message) hub.flash(result.message);
      return;
    }
    if (!notify || !job || !cleaner) {
      if (result.message) hub.flash(result.message);
      return;
    }
    const body = cleanerRemovedFromJobSms({
      cleanerFirstName: cleaner.firstName,
      customerFirstName: customerFirstNameForCleaner(job.snapshot),
      date: job.date,
    });
    hub.queueSchedulingSms(
      deliverSchedulingCleanerSms({
        cleaner,
        body,
        assignmentMessage: result.message,
        manualDetail: "removal notice",
      }),
      result.message,
    );
  }

  return (
    <button
      type="button"
      className="shrink-0 text-sm font-semibold underline disabled:text-ink/40"
      onClick={() => remove()}
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
    case "PENDING_AVAILABILITY":
      return `Confirmed${crewText}`;
    case "INVITED":
      return `Awaiting response to invite${crewText}`;
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
  const kelseyPhoneDigits = useKelseyPhoneDigits();
  const cleaner = hub.cleaners.find((item) => item.cleanerId === hub.cleanerId);
  const job = hub.jobs.find((item) => item.jobId === jobId);
  const assignment = hub.assignments.find(
    (item) =>
      item.jobId === jobId &&
      item.cleanerId === hub.cleanerId &&
      (item.status === "CONFIRMED" || item.status === "PENDING_AVAILABILITY"),
  );
  if (!cleaner || !job || !assignment) {
    return <Missing label="That cleaning could not be found." href="/cleaner" />;
  }
  const crewSize = assignment.confirmedCrewSize ?? assignment.pendingCrewSize ?? assignment.proposedCrewSize;
  const snapshotSizeLine = propertySizeLabel(
    job.snapshot.bedrooms,
    job.snapshot.bathrooms,
    job.snapshot.squareFeet,
  );
  const estimatedEnd = formatEstimatedOnSiteEnd(
    assignment.arrivalWindowStart,
    assignment.arrivalWindowEnd,
    assignment.expectedDurationMinutes,
  );
  const kelseyContact = kelseyContactLinks(
    kelseyPhoneDigits,
    cleanerTextKelseyAboutJobBody({
      cleanerFirstName: cleaner.firstName,
      customerFirstName: customerFirstNameForCleaner(job.snapshot),
      date: job.date,
      serviceLabel: cleanerServiceLabel(job.serviceType),
      arrivalWindowStart: assignment.arrivalWindowStart,
      arrivalWindowEnd: assignment.arrivalWindowEnd,
      expectedDurationMinutes: assignment.expectedDurationMinutes,
      addressLine: fullAddress(job.snapshot),
      payLine: payLine(assignment, true, cleaner),
    }),
  );
  return (
    <Screen>
      <PageHeader
        eyebrow="Confirmed job"
        title={customerFirstNameForCleaner(job.snapshot)}
        subtitle={formatLongDate(job.date)}
      />
      <div className="space-y-3 px-5 pt-4">
        <Card>
          <ServiceLine serviceType={job.serviceType} forCleaner />
          <p className="mt-3 text-sm text-ink/60">Start time</p>
          <p className="text-lg font-semibold">{formatArrival(assignment.arrivalWindowStart, assignment.arrivalWindowEnd)}</p>
          <p className="mt-1 text-sm text-ink/60">{ESTIMATED_ON_SITE_FIELD_LABEL}</p>
          <p className="text-sm text-ink/70">{formatDuration(assignment.expectedDurationMinutes)}</p>
          {estimatedEnd ? <p className="mt-1.5 text-sm text-ink/70">Estimated end {estimatedEnd}</p> : null}
          <div className="mt-4 flex items-start gap-2 text-base">
            <span aria-hidden="true">📍</span>
            <AddressLink address={fullAddress(job.snapshot)}>
              {job.snapshot.streetAddress}
              <br />
              {job.snapshot.city}, {job.snapshot.state} {job.snapshot.zip}
            </AddressLink>
          </div>
          {snapshotSizeLine ? <p className="mt-3 text-sm">{snapshotSizeLine}</p> : null}
          {job.snapshot.preferences ? <JobNoteBlock label="Preferences" text={job.snapshot.preferences} /> : null}
          {job.specialInstructions ? (
            <JobNoteBlock label="Instructions" text={job.specialInstructions} className="mt-2" />
          ) : null}
          <div className="mt-4">
            <AddToCalendarButton job={job} assignment={assignment} />
          </div>
        </Card>
        <Card>
          {helpersApproved(cleaner.maxHelperCount) ? (
            <>
              <p className="text-base">Confirmed crew size: {crewSize}</p>
              <p className="mt-1 text-sm text-ink/70">{assignmentPayPerPersonDetail(assignment, crewSize)}</p>
            </>
          ) : null}
          <p className="mt-2 text-xl font-semibold">{payLine(assignment, true, cleaner)}</p>
          <p className="mt-4 text-sm leading-5 text-ink/70">
            {helpersApproved(cleaner.maxHelperCount)
              ? "Need to change your schedule or crew? Confirmed bookings cannot be changed or canceled through the app. Please call Kelsey."
              : "Need to change your schedule? Confirmed bookings cannot be changed or canceled through the app. Please call Kelsey."}
          </p>
          {kelseyContact ? (
            <div className="mt-4 flex gap-2">
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
        </Card>
      </div>
    </Screen>
  );
}

function ServiceLine({
  serviceType,
  prominent = false,
  forCleaner = false,
}: {
  serviceType: Parameters<typeof serviceLabel>[0];
  prominent?: boolean;
  forCleaner?: boolean;
}) {
  const emoji = serviceEmoji(serviceType);
  return (
    <p className={`flex items-start gap-2 ${prominent ? "text-lg font-semibold" : "text-base"}`}>
      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
      <span>{forCleaner ? cleanerServiceLabel(serviceType) : serviceLabel(serviceType)}</span>
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
    ["Start", facts.arrive],
    ["Est. on site", facts.length],
    ["Est. end", facts.ends],
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
