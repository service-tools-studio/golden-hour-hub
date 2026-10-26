"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrivalWindowPicker } from "@/components/admin/arrival-window-picker";
import { EstimatedDurationPicker } from "@/components/admin/estimated-duration-picker";
import { CleanerAvailabilityPreview } from "@/components/admin/cleaner-availability-preview";
import {
  deliverSchedulingCleanerSms,
  deliverSchedulingFollowUpSms,
} from "@/lib/cleaner/deliver-scheduling-sms";
import { CleaningForm, type CleaningValues } from "@/components/admin/cleaning-form";
import { useHub } from "@/components/hub-provider";
import { useHubSyncBlocker } from "@/components/hub-sync";
import { normalizeArrivalWindow } from "@/lib/domain/arrival";
import { type CleaningOrigin, withOrigin } from "@/components/jobs/origin";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import {
  ButtonLoadingLabel,
  Field,
  Notice,
  PageHeader,
  PrimaryButton,
  Screen,
  SecondaryButton,
  fieldClass,
} from "@/components/ui";
import { calculateFlatPayPerPerson } from "@/lib/domain/compensation";
import { helpersApproved, personName, typicalCrewSize } from "@/lib/domain/cleaners";
import { liveAvailabilityAttentionMessage } from "@/lib/domain/invitations";
import { isConfirmedScheduleConflictReason } from "@/lib/domain/scheduling";
import type { CleanerProfile, Job, PayType } from "@/lib/domain/types";
import { mondayOf } from "@/lib/domain/time";
import { CLEANING_DELETE_BLOCKED_MESSAGE, jobHasCleanerBlockingDeletion, windowsForCleaner } from "@/lib/domain/scheduling";
import {
  assignmentFormStatus,
  assignmentPayFieldAriaLabel,
  assignmentPayFieldHints,
  assignmentPayFieldLabel,
  assignmentTracksCleanerNotification,
  dateReinviteNeeded,
  ESTIMATED_ON_SITE_FIELD_HINT,
  ESTIMATED_ON_SITE_FIELD_LABEL,
  customerFirstNameForCleaner,
  cleanerCleaningSmsDetailsFromJob,
  directAssignmentSms,
  formatLongDate,
  formatTimeLabel,
  hourWindows,
  inviteAssignmentSms,
  inviteFollowUpSms,
  noticeFlagText,
  noticeGap,
  reinviteFlagText,
} from "@/lib/format";

const DEFAULT_PAY_TYPE: PayType = "HOURLY";
const FALLBACK_HOURLY_RATE_CENTS = 3000;

function cleaningHref(jobId: string, from: CleaningOrigin | undefined) {
  return withOrigin(`/admin/jobs/${jobId}`, from);
}

async function notifyDirectAssignment(
  cleaner: CleanerProfile,
  job: Job,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  assignmentMessage: string | undefined,
) {
  const body = directAssignmentSms({
    cleanerFirstName: cleaner.firstName,
    details: cleanerCleaningSmsDetailsFromJob(job, arrivalWindowStart),
  });
  return deliverSchedulingCleanerSms({
    cleaner,
    body,
    assignmentMessage,
    manualDetail: "assignment notice",
  });
}

async function notifyInviteAssignment(
  cleaner: CleanerProfile,
  job: Job,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  assignmentMessage: string | undefined,
) {
  const body = inviteAssignmentSms({
    cleanerFirstName: cleaner.firstName,
    details: cleanerCleaningSmsDetailsFromJob(job, arrivalWindowStart),
  });
  return deliverSchedulingCleanerSms({
    cleaner,
    body,
    assignmentMessage,
    manualDetail: "invitation",
  });
}

async function notifyInviteFollowUp(cleaner: CleanerProfile, job: Job) {
  const body = inviteFollowUpSms({
    cleanerFirstName: cleaner.firstName,
    customerFirstName: customerFirstNameForCleaner(job.snapshot),
    date: job.date,
  });
  return deliverSchedulingFollowUpSms({ cleaner, body, manualDetail: "reminder" });
}

function cleaningSubtitle(job: Job, start: string | undefined): string {
  const when = start ? `${formatLongDate(job.date)} at ${formatTimeLabel(start)}` : formatLongDate(job.date);
  return `${job.snapshot.customerDisplayName} · ${when}`;
}

function jobCleaningWindow(job: Job | undefined): { start: string; end: string } | null {
  if (!job?.arrivalWindowStart || !job?.arrivalWindowEnd) return null;
  return { start: job.arrivalWindowStart, end: job.arrivalWindowEnd };
}

function cleaningArrivalForForm(
  job: Job | undefined,
  windows: { start: string; end: string }[],
  jobStart: string | undefined,
): { start: string; end: string } | null {
  const fromJob = jobCleaningWindow(job);
  if (fromJob) return fromJob;
  return defaultArrival(windows, jobStart) ?? null;
}

function cleaningStart(
  job: Job | undefined,
  hub: Pick<ReturnType<typeof useHub>, "series" | "assignments" | "cleaners">,
  cleanerId: string,
): string | undefined {
  if (!job) return undefined;
  if (job.arrivalWindowStart) return job.arrivalWindowStart;
  const series = job.seriesId ? hub.series.find((item) => item.seriesId === job.seriesId) : undefined;
  if (series?.defaultArrivalWindowStart) return series.defaultArrivalWindowStart;
  const others = cleanerArrivals(job, hub.assignments, hub.cleaners)
    .filter((arrival) => arrival.cleanerId !== cleanerId && arrival.start)
    .map((arrival) => arrival.start)
    .sort();
  return others[0];
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return Number.isInteger(cents) ? cents : null;
}

function centsToInput(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function defaultPerPersonCentsForCleaner(cleaner: CleanerProfile | undefined): number {
  if (cleaner && Number.isInteger(cleaner.typicalHourlyRateCents) && cleaner.typicalHourlyRateCents >= 0) {
    return cleaner.typicalHourlyRateCents;
  }
  return FALLBACK_HOURLY_RATE_CENTS;
}

function crewPayInputFromPerPersonCents(perPersonCents: number, crewSize: number): string {
  return centsToInput(perPersonCents * crewSize);
}

function perPersonCentsFromCrewPayInput(pay: string, crewSize: number): number | null {
  const crewTotalCents = dollarsToCents(pay);
  if (crewTotalCents === null || crewSize < 1) return null;
  try {
    return calculateFlatPayPerPerson(crewTotalCents, crewSize);
  } catch {
    return null;
  }
}

function preservePerPersonCrewPay(pay: string, fromCrew: number, toCrew: number): string | null {
  const perPerson = perPersonCentsFromCrewPayInput(pay, fromCrew);
  if (perPerson === null) return null;
  return crewPayInputFromPerPersonCents(perPerson, toCrew);
}

function arrivalChoicesFor(
  availability: { cleanerId: string; date: string; start: string; end: string }[],
  cleanerId: string,
  date: string,
  current?: { start: string; end: string },
): { start: string; end: string }[] {
  const fromAvailability = availability
    .filter((window) => window.cleanerId === cleanerId && window.date === date)
    .flatMap((window) => hourWindows(window.start, window.end));
  const choices = fromAvailability.length > 0 ? fromAvailability : hourWindows("08:00", "18:00");
  if (current && !choices.some((window) => window.start === current.start)) return [current, ...choices];
  return choices;
}

function defaultArrival(
  windows: { start: string; end: string }[],
  jobStart: string | undefined,
): { start: string; end: string } | undefined {
  if (!jobStart) return windows[0];
  return windows.find((window) => window.start >= jobStart) ?? windows[0];
}

function cleanerArrivals(
  job: { jobId: string; draftCleanerDetails?: { cleanerId: string; arrivalWindowStart: string; arrivalWindowEnd: string }[] },
  assignments: { jobId: string; cleanerId: string; status: string; arrivalWindowStart: string; arrivalWindowEnd: string }[],
  cleaners: { cleanerId: string; firstName: string }[],
): { cleanerId: string; firstName: string; start: string; end: string }[] {
  const windows: { cleanerId: string; firstName: string; start: string; end: string }[] = [];
  const covered = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.jobId !== job.jobId) continue;
    if (assignment.status === "CANCELED" || assignment.status === "EXPIRED_JOB_FILLED" || assignment.status === "DECLINED") continue;
    covered.add(assignment.cleanerId);
    const cleaner = cleaners.find((item) => item.cleanerId === assignment.cleanerId);
    if (!cleaner) continue;
    windows.push({
      cleanerId: cleaner.cleanerId,
      firstName: cleaner.firstName,
      start: assignment.arrivalWindowStart,
      end: assignment.arrivalWindowEnd,
    });
  }
  for (const detail of job.draftCleanerDetails ?? []) {
    if (covered.has(detail.cleanerId)) continue;
    const cleaner = cleaners.find((item) => item.cleanerId === detail.cleanerId);
    if (!cleaner) continue;
    windows.push({
      cleanerId: cleaner.cleanerId,
      firstName: cleaner.firstName,
      start: detail.arrivalWindowStart,
      end: detail.arrivalWindowEnd,
    });
  }
  return windows;
}


export function EditJobView({
  jobId,
  assignmentId,
  cleanerId = "",
  customerId = "",
  from,
}: {
  jobId: string;
  assignmentId: string;
  cleanerId?: string;
  customerId?: string;
  from?: CleaningOrigin;
}) {
  const hub = useHub();
  const router = useRouter();
  const job = hub.jobs.find((item) => item.jobId === jobId);
  const assignment = hub.assignments.find((item) => item.assignmentId === assignmentId && item.jobId === jobId);
  const cleaner = assignment ? hub.cleaners.find((item) => item.cleanerId === assignment.cleanerId) : undefined;
  const arrivalWindows = arrivalChoicesFor(
    hub.availability,
    assignment?.cleanerId ?? "",
    job?.date ?? "",
    assignment ? { start: assignment.arrivalWindowStart, end: assignment.arrivalWindowEnd } : undefined,
  );
  const jobStart = cleaningStart(job, hub, assignment?.cleanerId ?? "");
  const cleaningArrival = cleaningArrivalForForm(job, arrivalWindows, jobStart);
  const initialArrival = defaultArrival(arrivalWindows, jobStart);
  const [arrivalStart, setArrivalStart] = useState(
    cleaningArrival?.start ?? assignment?.arrivalWindowStart ?? initialArrival?.start ?? "",
  );
  const [arrivalEnd, setArrivalEnd] = useState(
    cleaningArrival?.end ?? assignment?.arrivalWindowEnd ?? initialArrival?.end ?? "",
  );
  const [duration, setDuration] = useState(
    assignment?.expectedDurationMinutes ?? job?.expectedDurationMinutes ?? 240,
  );
  const initialCrew = assignment?.confirmedCrewSize ?? assignment?.pendingCrewSize ?? assignment?.proposedCrewSize ?? 1;
  const [crew, setCrew] = useState(initialCrew);
  const [payType, setPayType] = useState<PayType>(assignment?.payType ?? DEFAULT_PAY_TYPE);
  const [pay, setPay] = useState(
    assignment
      ? crewPayInputFromPerPersonCents(assignment.payPerPersonCents, initialCrew)
      : crewPayInputFromPerPersonCents(defaultPerPersonCentsForCleaner(cleaner), initialCrew),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<AssigningMode | null>(null);
  const assignmentSnapshot = JSON.stringify({ arrivalStart, arrivalEnd, duration, crew, payType, pay });
  const assignmentBaseline = useRef<string | null>(null);
  if (assignment && assignmentBaseline.current === null) assignmentBaseline.current = assignmentSnapshot;
  const assignmentDirty = assignmentBaseline.current !== null && assignmentBaseline.current !== assignmentSnapshot;
  const assignmentSettled = Boolean(
    assignment &&
      (assignment.status === "INVITED" ||
        assignment.status === "DECLINED" ||
        assignment.status === "CONFIRMED" ||
        assignment.status === "PENDING_AVAILABILITY"),
  );
  const showAssignmentActions = assignment ? assignmentDirty || !assignmentSettled : false;
  const showDirectAssignForInvite =
    Boolean(assignment?.status === "INVITED" && assignmentSettled && !assignmentDirty);
  useUnsavedNavigation(Boolean(job && assignment && cleaner && assignmentId), () => assignmentDirty, setLeaveHref);
  useHubSyncBlocker(() => assignmentDirty);
  const maxCrew = cleaner ? 1 + cleaner.maxHelperCount : 1;

  const statusLabel = assignmentFormStatus(assignment?.status ?? "DRAFT");
  const gap =
    assignment && assignmentTracksCleanerNotification(assignment.status)
      ? noticeGap(false, assignmentNoticeFrom(assignment), assignment.lastNotified)
      : null;
  const flag = cleaner && gap ? noticeFlagText(cleaner.firstName, gap) : null;
  const scheduleWarning =
    assignment && cleaner && job
      ? liveAvailabilityAttentionMessage({
          assignment,
          cleaner,
          serviceDate: assignment.serviceDate,
          windows: windowsForCleaner(hub.availability, cleaner.cleanerId),
          confirmedAssignments: hub.assignments,
          arrivalWindowStart: arrivalStart,
          arrivalWindowEnd: arrivalEnd,
          expectedDurationMinutes: duration,
        })
      : null;
  const dateReinviteWarning =
    assignment && cleaner && job && dateReinviteNeeded(assignment, job.date)
      ? reinviteFlagText([cleaner.firstName])
      : null;
  const showSettledScheduleConflictActions = Boolean(
    assignment &&
      cleaner &&
      !assignmentDirty &&
      assignmentSettled &&
      scheduleWarning &&
      isConfirmedScheduleConflictReason(scheduleWarning),
  );
  const showSettledReinviteActions = Boolean(
    assignment && cleaner && !assignmentDirty && assignmentSettled && dateReinviteWarning,
  );
  const showSettledNotificationActions = showSettledScheduleConflictActions || showSettledReinviteActions;
  const weekSubmitted = Boolean(
    cleaner &&
      job &&
      hub.submissions.some((submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === mondayOf(job.date)),
  );
  const payPerPersonCentsPreview = perPersonCentsFromCrewPayInput(pay, crew);
  const followUpReady = Boolean(
    assignment &&
      assignment.status === "INVITED" &&
      assignment.lastNotified &&
      payPerPersonCentsPreview !== null &&
      noticeGap(
        false,
        assignmentNoticeFrom({
          arrivalWindowStart: arrivalStart,
          arrivalWindowEnd: arrivalEnd,
          expectedDurationMinutes: duration,
          proposedCrewSize: crew,
          payType,
          payPerPersonCents: payPerPersonCentsPreview,
        }),
        assignment.lastNotified,
      ) === null,
  );
  const dayAvailability = hub.availability
    .filter((window) => window.cleanerId === cleaner?.cleanerId && window.date === job?.date)
    .map((window) => ({ start: window.start, end: window.end }));

  async function submit(mode: "DRAFT" | "INVITE" | "DIRECT", nextHref?: string) {
    if (!job || !cleaner || assigning) return false;
    const payPerPersonCents = perPersonCentsFromCrewPayInput(pay, crew);
    if (payPerPersonCents === null) {
      setMessage("Enter the crew pay, like 350 or 350.00.");
      return false;
    }
    if (mode === "DIRECT" || mode === "INVITE") setAssigning(mode);
    else if (mode === "DRAFT" && nextHref) setAssigning("DRAFT");

    const result = hub.completeAssignment({
      jobId,
      assignmentId,
      cleanerId: cleaner.cleanerId,
      propertyId: job.propertyId,
      arrivalWindowStart: arrivalStart,
      arrivalWindowEnd: arrivalEnd,
      expectedDurationMinutes: duration,
      proposedCrewSize: crew,
      payType,
      payPerPersonCents,
      specialInstructions: job.specialInstructions,
      mode,
    });
    if (!result.ok) {
      setAssigning(null);
      setMessage(result.message);
      return false;
    }
    if (mode === "DIRECT") {
      hub.queueSchedulingSms(
        notifyDirectAssignment(cleaner, job, arrivalStart, arrivalEnd, result.message),
        result.message,
      );
    } else if (mode === "INVITE") {
      hub.queueSchedulingSms(
        notifyInviteAssignment(cleaner, job, arrivalStart, arrivalEnd, result.message),
        result.message,
      );
    } else if (result.message) {
      hub.flash(result.message);
    }
    setAssigning(null);
    if (mode === "DRAFT" && nextHref) setAssigning(null);
    router.push(nextHref ?? cleaningHref(jobId, from));
    return true;
  }

  function sendInviteFollowUp() {
    if (!job || !cleaner || !followUpReady || assigning) return;
    setAssigning("FOLLOW_UP");
    hub.queueSchedulingSms(notifyInviteFollowUp(cleaner, job));
    setAssigning(null);
  }

  async function saveAndLeave() {
    const saved = await submit("DRAFT", leaveHref ?? undefined);
    if (!saved) setLeaveHref(null);
    return saved;
  }

  if (cleanerId && !assignment) {
    return <DraftStaffingForm jobId={jobId} cleanerId={cleanerId} from={from} />;
  }

  if (!assignmentId && !cleanerId) {
    return <VisitEditForm jobId={jobId} customerId={customerId} from={from} />;
  }

  if (!job || !assignment || !cleaner) {
    return (
      <Screen>
        <PageHeader title="Edit cleaning" crumb={{ href: "/admin", label: "Dashboard" }} />
        <div className="px-5 pt-4">
          <Notice>That cleaning could not be edited.</Notice>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        title={personName(cleaner.firstName, cleaner.lastName)}
        subtitle={cleaningSubtitle(job, job.arrivalWindowStart ?? jobStart)}
        crumb={{ href: cleaningHref(job.jobId, from), label: "Cleaning" }}
      />
      <form
        className="space-y-4 px-5 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit("DRAFT");
        }}
      >
        {message ? <Notice>{message}</Notice> : null}
        <AssignmentStatus
          label={statusLabel}
          flag={flag}
          scheduleWarning={scheduleWarning}
          reinviteWarning={dateReinviteWarning}
        />
        <Field label="Start time">
          <ArrivalWindowPicker
            start={arrivalStart}
            end={arrivalEnd}
            onChange={(nextStart, nextEnd) => {
              setArrivalStart(nextStart);
              setArrivalEnd(nextEnd);
              setMessage(null);
            }}
          />
        </Field>
        <AssignmentDurationField duration={duration} onChange={setDuration} onDirty={() => setMessage(null)} />
        {cleaner && job ? (
          <CleanerAvailabilityPreview
            cleanerId={cleaner.cleanerId}
            cleanerName={cleaner.firstName}
            date={job.date}
            availabilityWindows={dayAvailability}
            assignments={hub.assignments}
            ignoreAssignmentId={assignment.status === "CONFIRMED" ? assignment.assignmentId : undefined}
            arrivalStart={arrivalStart}
            arrivalEnd={arrivalEnd}
            durationMinutes={duration}
          />
        ) : null}
        {maxCrew > 1 ? (
          <CountField
            label="Crew size (including you)"
            value={crew}
            min={1}
            max={maxCrew}
            onChange={(next) => {
              const nextPay = preservePerPersonCrewPay(pay, crew, next);
              setCrew(next);
              if (nextPay !== null) setPay(nextPay);
              setMessage(null);
            }}
          />
        ) : null}
        <AssignmentPayPerCrewGroup
          bringsHelpers={cleaner ? helpersApproved(cleaner.maxHelperCount) : false}
          payType={payType}
          pay={pay}
          crew={crew}
          onPayTypeChange={setPayType}
          onPayChange={(value) => {
            setPay(value);
            setMessage(null);
          }}
        />
        {showAssignmentActions || showDirectAssignForInvite || showSettledNotificationActions ? (
          <AssignmentSaveChoices
            assigning={assigning}
            showDraftAndInvite={showAssignmentActions || showSettledNotificationActions}
            directAssignNote={
              weekSubmitted
                ? null
                : `${cleaner.firstName} has not submitted this week yet. Assigning directly confirms ${cleaner.firstName} on this cleaning now; if their availability does not fit when they submit it, the assignment will show as needs attention.`
            }
            inviteLabel={
              showSettledNotificationActions
                ? "Resend invite"
                : followUpReady
                  ? "Send follow up"
                  : "Save and send invite"
            }
            onInvite={() =>
              followUpReady && !showSettledNotificationActions ? sendInviteFollowUp() : submit("INVITE")
            }
            onSave={submit}
          />
        ) : null}
      </form>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        pendingHref={leaveHref}
        onSave={saveAndLeave}
        onNavigationComplete={() => setLeaveHref(null)}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onDismiss={() => setLeaveHref(null)}
      />
    </Screen>
  );
}

function DeleteCleaningButton({
  deleteBlocked,
  onDelete,
}: {
  deleteBlocked: boolean;
  onDelete: () => void;
}) {
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    if (!hintOpen) return;
    const timer = window.setTimeout(() => setHintOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [hintOpen]);

  useEffect(() => {
    if (!deleteBlocked) setHintOpen(false);
  }, [deleteBlocked]);

  return (
    <div className="relative">
      {hintOpen && deleteBlocked ? (
        <p
          role="tooltip"
          className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-2xl bg-ink px-4 py-3 text-center text-sm leading-5 text-cream shadow-[0_8px_30px_rgba(51,51,51,0.2)]"
        >
          {CLEANING_DELETE_BLOCKED_MESSAGE}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (deleteBlocked) {
            setHintOpen(true);
            return;
          }
          onDelete();
        }}
        aria-disabled={deleteBlocked}
        className={`flex min-h-12 w-full items-center justify-center font-semibold text-red-700 underline decoration-red-700 decoration-2 underline-offset-4 ${
          deleteBlocked ? "cursor-not-allowed opacity-50 no-underline" : ""
        }`}
      >
        Delete cleaning
      </button>
    </div>
  );
}

function VisitEditForm({ jobId, customerId = "", from }: { jobId: string; customerId?: string; from?: CleaningOrigin }) {
  const hub = useHub();
  const router = useRouter();
  const [navigatingAway, setNavigatingAway] = useState(false);
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  if (navigatingAway) return null;
  if (!job) {
    return (
      <Screen>
        <PageHeader title="Edit cleaning" crumb={{ href: "/admin", label: "Dashboard" }} />
        <div className="px-5 pt-4">
          <Notice>That cleaning could not be edited.</Notice>
        </div>
      </Screen>
    );
  }
  const cleaning = job;
  const knownCustomer = hub.customers.some((item) => item.customerId === customerId);
  const startingCustomerId = knownCustomer ? customerId : cleaning.customerId;
  const startingHomes = hub.properties.filter((item) => item.customerId === startingCustomerId && item.status === "ACTIVE");
  const startingPropertyId =
    startingCustomerId === job.customerId
      ? job.propertyId
      : (startingHomes[0]?.propertyId ?? "");
  const savedArrival =
    job.arrivalWindowStart && job.arrivalWindowEnd ? { start: job.arrivalWindowStart, end: job.arrivalWindowEnd } : undefined;
  const onCleaning = [
    ...(job.draftCleanerIds ?? []),
    ...hub.assignments
      .filter(
        (assignment) =>
          assignment.jobId === job.jobId &&
          assignment.status !== "CANCELED" &&
          assignment.status !== "EXPIRED_JOB_FILLED",
      )
      .map((assignment) => assignment.cleanerId),
  ];
  const cleanerIds = [...new Set(onCleaning)];
  const leadCleanerId = cleanerIds[0] ?? "";

  function submit(values: CleaningValues, nextHref?: string) {
    const result = hub.updateVisit({
      jobId: cleaning.jobId,
      date: values.date,
      customerId: values.customerId,
      propertyId: values.propertyId,
      serviceType: values.serviceType,
      arrivalWindowStart: values.arrivalWindowStart,
      arrivalWindowEnd: values.arrivalWindowEnd,
      expectedDurationMinutes: values.expectedDurationMinutes,
      headcountNeeded: values.headcountNeeded,
      specialInstructions: values.specialInstructions,
      cleanerIds: values.cleanerIds,
      cleanerArrivals: values.cleanerArrivals,
      pricePerVisitCents: values.pricePerVisitCents,
      recurringSchedule: values.recurringSchedule,
    });
    if (!result.ok) return { ok: false, message: result.message };
    if (result.message) hub.flash(result.message);
    router.push(nextHref ?? cleaningHref(cleaning.jobId, from));
    return { ok: true };
  }

  const deleteBlocked = jobHasCleanerBlockingDeletion(hub.assignments, cleaning.jobId);

  function remove() {
    const result = hub.deleteJob(cleaning.jobId);
    if (!result.ok) {
      if (result.message) hub.flash(result.message);
      return;
    }
    if (result.message) hub.flash(result.message);
    setNavigatingAway(true);
    router.push(`/admin/customers/${cleaning.customerId}`);
  }

  return (
    <Screen>
      <PageHeader
        title={job.snapshot.customerDisplayName}
        subtitle={formatLongDate(pickedDate ?? job.date)}
        crumb={{ href: cleaningHref(job.jobId, from), label: "Cleaning" }}
      />
      <CleaningForm
        initial={{
          date: job.date,
          customerId: startingCustomerId,
          propertyId: startingPropertyId,
          serviceType: job.serviceType,
          arrivalWindowStart: savedArrival?.start,
          arrivalWindowEnd: savedArrival?.end,
          expectedDurationMinutes: job.expectedDurationMinutes ?? 0,
          headcountNeeded: job.headcountNeeded,
          specialInstructions: job.specialInstructions,
          pricePerVisitCents: job.pricePerVisitCents,
          cleanerIds,
          cleanerArrivals: cleanerArrivals(job, hub.assignments, hub.cleaners).map((arrival) => {
            const times = normalizeArrivalWindow(arrival.start);
            return {
              cleanerId: arrival.cleanerId,
              firstName: arrival.firstName,
              arrivalWindowStart: times.arrivalWindowStart,
              arrivalWindowEnd: times.arrivalWindowEnd,
            };
          }),
        }}
        leadCleanerId={leadCleanerId}
        canClearCleaners
        allowRecurringSchedule={!job.seriesId}
        onDateChange={setPickedDate}
        newCustomerHref={`/admin/customers/new?returnTo=${encodeURIComponent(withOrigin(`/admin/jobs/${job.jobId}/edit`, from))}`}
        customerEditReturnTo={withOrigin(`/admin/jobs/${job.jobId}/edit`, from)}
        onSubmit={submit}
        afterDate={(date) => {
          const flag = reinviteFlagText(
            hub.assignments
              .filter((assignment) => assignment.jobId === job.jobId && dateReinviteNeeded(assignment, date))
              .map((assignment) => hub.cleaners.find((cleaner) => cleaner.cleanerId === assignment.cleanerId)?.firstName)
              .filter((name): name is string => Boolean(name)),
          );
          return flag ? <Notice>{flag}</Notice> : null;
        }}
        trailing={<DeleteCleaningButton deleteBlocked={deleteBlocked} onDelete={remove} />}
      />
    </Screen>
  );
}

function DraftStaffingForm({ jobId, cleanerId, from }: { jobId: string; cleanerId: string; from?: CleaningOrigin }) {
  const hub = useHub();
  const router = useRouter();
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
  const staffedOnJob = hub.assignments.some(
    (item) =>
      item.jobId === jobId &&
      item.cleanerId === cleanerId &&
      item.status !== "CANCELED" &&
      item.status !== "EXPIRED_JOB_FILLED" &&
      item.status !== "DECLINED",
  );
  const onRoster = Boolean(job?.draftCleanerIds?.includes(cleanerId)) || staffedOnJob;
  const cleaner = onRoster ? hub.cleaners.find((item) => item.cleanerId === cleanerId && item.status === "ACTIVE") : undefined;
  const savedDetail = job?.draftCleanerDetails?.find((item) => item.cleanerId === cleanerId);
  const usualCrew = cleaner ? typicalCrewSize(cleaner.typicalHelperCount) : 1;
  const windows = arrivalChoicesFor(
    hub.availability,
    cleanerId,
    job?.date ?? "",
    savedDetail ? { start: savedDetail.arrivalWindowStart, end: savedDetail.arrivalWindowEnd } : undefined,
  );
  const jobStart = cleaningStart(job, hub, cleanerId);
  const cleaningArrival = cleaningArrivalForForm(job, windows, jobStart);
  const initialArrival = defaultArrival(windows, jobStart);
  const [arrivalStart, setArrivalStart] = useState(
    cleaningArrival?.start ?? savedDetail?.arrivalWindowStart ?? initialArrival?.start ?? "",
  );
  const [arrivalEnd, setArrivalEnd] = useState(
    cleaningArrival?.end ?? savedDetail?.arrivalWindowEnd ?? initialArrival?.end ?? "",
  );
  const [duration, setDuration] = useState(
    savedDetail?.expectedDurationMinutes ?? job?.expectedDurationMinutes ?? 240,
  );
  const initialDraftCrew = savedDetail?.proposedCrewSize ?? usualCrew;
  const [crew, setCrew] = useState(initialDraftCrew);
  const [payType, setPayType] = useState<PayType>(savedDetail?.payType ?? DEFAULT_PAY_TYPE);
  const [pay, setPay] = useState(
    savedDetail
      ? crewPayInputFromPerPersonCents(savedDetail.payPerPersonCents, initialDraftCrew)
      : crewPayInputFromPerPersonCents(defaultPerPersonCentsForCleaner(cleaner), initialDraftCrew),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [navigatingAway, setNavigatingAway] = useState(false);
  const [assigning, setAssigning] = useState<AssigningMode | null>(null);
  const draftSnapshot = JSON.stringify({ arrivalStart, arrivalEnd, duration, crew, payType, pay });
  const draftBaseline = useRef<string | null>(null);
  if (job && cleaner && draftBaseline.current === null) draftBaseline.current = draftSnapshot;
  const draftDirty = draftBaseline.current !== null && draftBaseline.current !== draftSnapshot;
  useUnsavedNavigation(Boolean(job && cleaner), () => draftDirty, setLeaveHref);
  useHubSyncBlocker(() => draftDirty);
  const maxCrew = cleaner ? 1 + cleaner.maxHelperCount : 1;
  const dayAvailability = hub.availability
    .filter((window) => window.cleanerId === cleanerId && window.date === job?.date)
    .map((window) => ({ start: window.start, end: window.end }));

  const weekSubmitted = Boolean(
    cleaner &&
      job &&
      hub.submissions.some((submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === mondayOf(job.date)),
  );

  async function submit(mode: "DRAFT" | "INVITE" | "DIRECT", nextHref?: string) {
    if (!job || !cleaner || assigning) return false;
    const payPerPersonCents = perPersonCentsFromCrewPayInput(pay, crew);
    if (payPerPersonCents === null) {
      setMessage("Enter the crew pay, like 350 or 350.00.");
      return false;
    }
    if (mode === "DIRECT" || mode === "INVITE") setAssigning(mode);
    else if (mode === "DRAFT" && nextHref) setAssigning("DRAFT");

    const result = hub.completeAssignment({
      jobId: job.jobId,
      cleanerId: cleaner.cleanerId,
      propertyId: job.propertyId,
      arrivalWindowStart: arrivalStart,
      arrivalWindowEnd: arrivalEnd,
      expectedDurationMinutes: duration,
      proposedCrewSize: crew,
      payType,
      payPerPersonCents,
      specialInstructions: job.specialInstructions,
      mode,
    });
    if (!result.ok) {
      setAssigning(null);
      setMessage(result.message);
      return false;
    }
    if (mode === "DRAFT") {
      if (result.message) hub.flash(result.message);
      if (nextHref) {
        setAssigning(null);
        setNavigatingAway(true);
        router.push(nextHref);
      }
      return true;
    }
    if (mode === "DIRECT") {
      hub.queueSchedulingSms(
        notifyDirectAssignment(cleaner, job, arrivalStart, arrivalEnd, result.message),
        result.message,
      );
    } else if (mode === "INVITE") {
      hub.queueSchedulingSms(
        notifyInviteAssignment(cleaner, job, arrivalStart, arrivalEnd, result.message),
        result.message,
      );
    } else if (result.message) {
      hub.flash(result.message);
    }
    setAssigning(null);
    setNavigatingAway(true);
    router.push(nextHref ?? cleaningHref(job.jobId, from));
    return true;
  }

  async function saveAndLeave() {
    const saved = await submit("DRAFT", leaveHref ?? undefined);
    if (!saved) setLeaveHref(null);
    return saved;
  }

  if (navigatingAway) return null;

  if (!job || !cleaner) {
    return (
      <Screen>
        <PageHeader title="Cleaning" crumb={{ href: "/admin", label: "Dashboard" }} />
        <div className="px-5 pt-4">
          <Notice>That cleaner is not on this cleaning.</Notice>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        title={personName(cleaner.firstName, cleaner.lastName)}
        subtitle={cleaningSubtitle(job, job.arrivalWindowStart ?? jobStart)}
        crumb={{ href: cleaningHref(job.jobId, from), label: "Cleaning" }}
      />
      <form
        className="space-y-4 px-5 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit("DRAFT");
        }}
      >
        {message ? <Notice>{message}</Notice> : null}
        <AssignmentStatus label="Draft assignment" flag={null} />
        <Field label="Start time">
          <ArrivalWindowPicker
            start={arrivalStart}
            end={arrivalEnd}
            onChange={(nextStart, nextEnd) => {
              setArrivalStart(nextStart);
              setArrivalEnd(nextEnd);
              setMessage(null);
            }}
          />
        </Field>
        <AssignmentDurationField duration={duration} onChange={setDuration} onDirty={() => setMessage(null)} />
        <CleanerAvailabilityPreview
          cleanerId={cleanerId}
          cleanerName={cleaner.firstName}
          date={job.date}
          availabilityWindows={dayAvailability}
          assignments={hub.assignments}
          arrivalStart={arrivalStart}
          arrivalEnd={arrivalEnd}
          durationMinutes={duration}
        />
        {maxCrew > 1 ? (
          <CountField
            label="Crew size (including you)"
            value={crew}
            min={1}
            max={maxCrew}
            onChange={(next) => {
              const nextPay = preservePerPersonCrewPay(pay, crew, next);
              setCrew(next);
              if (nextPay !== null) setPay(nextPay);
              setMessage(null);
            }}
          />
        ) : null}
        <AssignmentPayPerCrewGroup
          bringsHelpers={cleaner ? helpersApproved(cleaner.maxHelperCount) : false}
          payType={payType}
          pay={pay}
          crew={crew}
          onPayTypeChange={setPayType}
          onPayChange={(value) => {
            setPay(value);
            setMessage(null);
          }}
        />
        <AssignmentSaveChoices
          assigning={assigning}
          directAssignNote={
            weekSubmitted
              ? null
              : `${cleaner.firstName} has not submitted this week yet. Assigning directly confirms ${cleaner.firstName} on this cleaning now; if their availability does not fit when they submit it, the assignment will show as needs attention.`
          }
          onInvite={() => submit("INVITE")}
          onSave={submit}
        />
      </form>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        pendingHref={leaveHref}
        onSave={saveAndLeave}
        onNavigationComplete={() => setLeaveHref(null)}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(null);
          if (href) router.push(href);
        }}
        onDismiss={() => setLeaveHref(null)}
      />
    </Screen>
  );
}

function assignmentNoticeFrom(input: {
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  proposedCrewSize: number;
  payType: PayType;
  payPerPersonCents: number;
}) {
  return {
    arrivalWindowStart: input.arrivalWindowStart,
    arrivalWindowEnd: input.arrivalWindowEnd,
    expectedDurationMinutes: input.expectedDurationMinutes,
    proposedCrewSize: input.proposedCrewSize,
    payType: input.payType,
    payPerPersonCents: input.payPerPersonCents,
  };
}

function AssignmentStatus({
  label,
  flag,
  scheduleWarning,
  reinviteWarning,
}: {
  label: string;
  flag: string | null;
  scheduleWarning?: string | null;
  reinviteWarning?: string | null;
}) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Status</p>
      <p className="mt-1 text-lg font-semibold">{label}</p>
      {scheduleWarning ? (
        <div className="mt-3">
          <Notice>{scheduleWarning}</Notice>
        </div>
      ) : null}
      {reinviteWarning ? (
        <div className="mt-3">
          <Notice>{reinviteWarning}</Notice>
        </div>
      ) : null}
      {flag ? <div className="mt-3"><Notice>{flag}</Notice></div> : null}
    </div>
  );
}

function AssignmentDurationField({
  duration,
  onChange,
  onDirty,
}: {
  duration: number;
  onChange: (minutes: number) => void;
  onDirty: () => void;
}) {
  return (
    <Field label={ESTIMATED_ON_SITE_FIELD_LABEL}>
      <EstimatedDurationPicker
        value={duration}
        onChange={(minutes) => {
          onChange(minutes);
          onDirty();
        }}
      />
      <p className="mt-1.5 text-sm text-ink/60">{ESTIMATED_ON_SITE_FIELD_HINT}</p>
    </Field>
  );
}

type AssigningMode = "DRAFT" | "INVITE" | "DIRECT" | "FOLLOW_UP";

function AssignmentSaveChoices({
  assigning = null,
  showDraftAndInvite = true,
  directAssignNote,
  inviteLabel = "Save and send invite",
  onInvite,
  onSave,
}: {
  assigning?: AssigningMode | null;
  showDraftAndInvite?: boolean;
  directAssignNote: string | null;
  inviteLabel?: string;
  onInvite: () => void;
  onSave: (mode: "DRAFT" | "INVITE" | "DIRECT") => void;
}) {
  const busy = assigning !== null;
  const inviteBusy = assigning === "INVITE" || assigning === "FOLLOW_UP";
  return (
    <div className="space-y-2" aria-busy={busy}>
      {showDraftAndInvite ? (
        <>
          <SecondaryButton type="submit" disabled={busy} loading={assigning === "DRAFT"} loadingLabel="Saving…">
            Save draft
          </SecondaryButton>
          <PrimaryButton
            type="button"
            onClick={onInvite}
            disabled={busy}
            loading={inviteBusy}
            loadingLabel={assigning === "FOLLOW_UP" ? "Sending…" : "Sending invite…"}
          >
            {inviteLabel}
          </PrimaryButton>
        </>
      ) : null}
      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave("DIRECT")}
          className="flex min-h-12 w-full items-center justify-center gap-2 font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 disabled:opacity-50"
        >
          {assigning === "DIRECT" ? (
            <ButtonLoadingLabel label="Assigning…" tone="onLight" />
          ) : (
            "Assign directly and notify"
          )}
        </button>
        {directAssignNote ? <p className="text-sm text-ink/70">{directAssignNote}</p> : null}
      </div>
    </div>
  );
}

function AssignmentPayPerCrewGroup({
  bringsHelpers,
  payType,
  pay,
  crew,
  onPayTypeChange,
  onPayChange,
}: {
  bringsHelpers: boolean;
  payType: PayType;
  pay: string;
  crew: number;
  onPayTypeChange: (value: PayType) => void;
  onPayChange: (value: string) => void;
}) {
  const crewTotalCents = dollarsToCents(pay);
  const perPersonCents = perPersonCentsFromCrewPayInput(pay, crew);
  const hints =
    crewTotalCents !== null && perPersonCents !== null
      ? assignmentPayFieldHints({
          bringsHelpers,
          payType,
          crewTotalCents,
          perPersonCents,
          crewSize: crew,
        })
      : [];
  return (
    <Group label={assignmentPayFieldLabel(bringsHelpers, payType)}>
      <div className="flex gap-2">
        <div className="flex rounded-full bg-white p-1">
          {(["FLAT", "HOURLY"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={payType === item}
              onClick={() => onPayTypeChange(item)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${payType === item ? "bg-ink text-cream" : "text-ink/70"}`}
            >
              {item === "FLAT" ? "Flat" : "Hourly"}
            </button>
          ))}
        </div>
        <input
          inputMode="decimal"
          className={fieldClass}
          aria-label={assignmentPayFieldAriaLabel(bringsHelpers, payType)}
          value={pay}
          onChange={(event) => onPayChange(event.target.value)}
        />
      </div>
      {hints.map((hint) => (
        <p key={hint} className="mt-1.5 text-sm text-ink/70">
          {hint}
        </p>
      ))}
    </Group>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink/80">{label}</p>
      {children}
    </div>
  );
}

function CountField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Group label={label}>
      <div className="flex min-h-12 items-center justify-between rounded-2xl bg-white px-2 ring-1 ring-ink/15">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25"
        >
          −
        </button>
        <span className="text-base font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex size-10 items-center justify-center rounded-full bg-mint text-lg font-semibold disabled:bg-ink/8 disabled:text-ink/25"
        >
          +
        </button>
      </div>
    </Group>
  );
}
