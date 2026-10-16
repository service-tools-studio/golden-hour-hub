"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendCleanerText } from "@/app/actions/notifications";
import { CleaningForm, type CleaningValues } from "@/components/admin/cleaning-form";
import { useHub } from "@/components/hub-provider";
import { type CleaningOrigin, withOrigin } from "@/components/jobs/origin";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Field, Notice, PageHeader, PrimaryButton, Screen, SecondaryButton, fieldClass } from "@/components/ui";
import { personName, typicalCrewSize } from "@/lib/domain/cleaners";
import type { CleanerProfile, Job, PayType } from "@/lib/domain/types";
import { mondayOf } from "@/lib/domain/time";
import {
  assignmentFormStatus,
  dateReinviteNeeded,
  directAssignmentSms,
  formatLongDate,
  formatTimeLabel,
  hourWindowLabel,
  hourWindows,
  inviteAssignmentSms,
  inviteFollowUpSms,
  noticeFlagText,
  noticeGap,
  reinviteFlagText,
} from "@/lib/format";

const DEFAULT_PAY_TYPE: PayType = "HOURLY";
const DEFAULT_PAY = "30";

function cleaningHref(jobId: string, from: CleaningOrigin | undefined) {
  return withOrigin(`/admin/jobs/${jobId}`, from);
}

function textDirectAssignment(
  cleaner: CleanerProfile,
  job: Job,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  flash: (message: string) => void,
) {
  const body = directAssignmentSms({
    cleanerFirstName: cleaner.firstName,
    customerName: job.snapshot.customerDisplayName,
    streetAddress: job.snapshot.streetAddress,
    date: job.date,
    arrivalWindowStart,
    arrivalWindowEnd,
  });
  void sendCleanerText(cleaner.mobilePhone, body).then((result) =>
    flash(result.ok ? `Assigned. Text sent to ${cleaner.firstName}.` : result.message),
  );
}

function textInviteAssignment(
  cleaner: CleanerProfile,
  job: Job,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  flash: (message: string) => void,
) {
  const body = inviteAssignmentSms({
    cleanerFirstName: cleaner.firstName,
    customerName: job.snapshot.customerDisplayName,
    date: job.date,
    arrivalWindowStart,
    arrivalWindowEnd,
  });
  void sendCleanerText(cleaner.mobilePhone, body).then((result) =>
    flash(result.ok ? `Invite sent. Text sent to ${cleaner.firstName}.` : result.message),
  );
}

function textInviteFollowUp(cleaner: CleanerProfile, job: Job, flash: (message: string) => void) {
  const body = inviteFollowUpSms({
    cleanerFirstName: cleaner.firstName,
    customerName: job.snapshot.customerDisplayName,
    date: job.date,
  });
  void sendCleanerText(cleaner.mobilePhone, body).then((result) =>
    flash(result.ok ? `Follow-up sent to ${cleaner.firstName}.` : result.message),
  );
}

function cleaningSubtitle(job: Job, start: string | undefined): string {
  const when = start ? `${formatLongDate(job.date)} at ${formatTimeLabel(start)}` : formatLongDate(job.date);
  return `${job.snapshot.customerDisplayName} · ${when}`;
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
  const initialArrival = defaultArrival(arrivalWindows, jobStart);
  const [arrivalStart, setArrivalStart] = useState(assignment?.arrivalWindowStart ?? initialArrival?.start ?? "");
  const [arrivalEnd, setArrivalEnd] = useState(assignment?.arrivalWindowEnd ?? initialArrival?.end ?? "");
  const [crew, setCrew] = useState(assignment?.confirmedCrewSize ?? assignment?.pendingCrewSize ?? assignment?.proposedCrewSize ?? 1);
  const [payType, setPayType] = useState<PayType>(assignment?.payType ?? DEFAULT_PAY_TYPE);
  const [pay, setPay] = useState(assignment ? centsToInput(assignment.payPerPersonCents) : DEFAULT_PAY);
  const [message, setMessage] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const assignmentSnapshot = JSON.stringify({ arrivalStart, arrivalEnd, crew, payType, pay });
  const assignmentBaseline = useRef<string | null>(null);
  if (assignment && assignmentBaseline.current === null) assignmentBaseline.current = assignmentSnapshot;
  const assignmentDirty = assignmentBaseline.current !== null && assignmentBaseline.current !== assignmentSnapshot;
  useUnsavedNavigation(Boolean(job && assignment && cleaner && assignmentId), () => assignmentDirty, setLeaveHref);
  const maxCrew = cleaner ? 1 + cleaner.maxHelperCount : 1;

  const statusLabel = assignmentFormStatus(assignment?.status ?? "DRAFT");
  const gap = assignment
    ? noticeGap(false, assignmentNoticeFrom(assignment), assignment.lastNotified)
    : null;
  const flag = cleaner && gap ? noticeFlagText(cleaner.firstName, gap) : null;
  const weekSubmitted = Boolean(
    cleaner &&
      job &&
      hub.submissions.some((submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === mondayOf(job.date)),
  );
  const payPerPersonCentsPreview = dollarsToCents(pay);
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
          expectedDurationMinutes: job?.expectedDurationMinutes ?? assignment.expectedDurationMinutes,
          proposedCrewSize: crew,
          payType,
          payPerPersonCents: payPerPersonCentsPreview,
        }),
        assignment.lastNotified,
      ) === null,
  );

  function submit(mode: "DRAFT" | "INVITE" | "DIRECT", nextHref?: string) {
    if (!job || !cleaner) return false;
    const payPerPersonCents = dollarsToCents(pay);
    if (payPerPersonCents === null) {
      setMessage("Enter the pay per person, like 50 or 50.00.");
      return false;
    }
    const result = hub.completeAssignment({
      jobId,
      assignmentId,
      cleanerId: cleaner.cleanerId,
      propertyId: job.propertyId,
      arrivalWindowStart: arrivalStart,
      arrivalWindowEnd: arrivalEnd,
      expectedDurationMinutes: job.expectedDurationMinutes ?? assignment?.expectedDurationMinutes ?? 240,
      proposedCrewSize: crew,
      payType,
      payPerPersonCents,
      specialInstructions: job.specialInstructions,
      mode,
    });
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    if (result.message) hub.flash(result.message);
    if (mode === "DIRECT") textDirectAssignment(cleaner, job, arrivalStart, arrivalEnd, hub.flash);
    if (mode === "INVITE") textInviteAssignment(cleaner, job, arrivalStart, arrivalEnd, hub.flash);
    router.push(nextHref ?? cleaningHref(jobId, from));
    return true;
  }

  function sendInviteFollowUp() {
    if (!job || !cleaner || !followUpReady) return;
    textInviteFollowUp(cleaner, job, hub.flash);
  }

  function saveAndLeave() {
    if (!submit("DRAFT", leaveHref ?? undefined)) setLeaveHref(null);
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
        subtitle={cleaningSubtitle(job, jobStart)}
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
        <AssignmentStatus label={statusLabel} flag={flag} />
        <Field label="Arrival window">
          <select
            className={fieldClass}
            value={arrivalStart}
            onChange={(event) => {
              const window = arrivalWindows.find((item) => item.start === event.target.value);
              if (!window) return;
              setArrivalStart(window.start);
              setArrivalEnd(window.end);
              setMessage(null);
            }}
          >
            {arrivalWindows.map((window) => (
              <option key={window.start} value={window.start}>
                {hourWindowLabel(window.start, window.end)}
              </option>
            ))}
          </select>
        </Field>
        {maxCrew > 1 ? (
          <CountField
            label="Crew"
            value={crew}
            min={1}
            max={job.headcountNeeded > 0 ? Math.min(maxCrew, job.headcountNeeded) : maxCrew}
            onChange={(next) => {
              setCrew(next);
              setMessage(null);
            }}
          />
        ) : null}
        <Group label={payType === "HOURLY" ? "Pay per person per hour" : "Pay per person"}>
          <div className="flex gap-2">
            <div className="flex rounded-full bg-white p-1">
              {(["FLAT", "HOURLY"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={payType === item}
                  onClick={() => setPayType(item)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold ${payType === item ? "bg-ink text-cream" : "text-ink/70"}`}
                >
                  {item === "FLAT" ? "Flat" : "Hourly"}
                </button>
              ))}
            </div>
            <input
              inputMode="decimal"
              className={fieldClass}
              aria-label="Pay amount"
              value={pay}
              onChange={(event) => {
                setPay(event.target.value);
                setMessage(null);
              }}
            />
          </div>
        </Group>
        <AssignmentSaveChoices
          directAssignNote={
            weekSubmitted
              ? null
              : `${cleaner.firstName} has not submitted this week yet. Assigning directly confirms ${cleaner.firstName} on this cleaning now; if their availability does not fit when they submit it, the assignment will show as needs attention.`
          }
          inviteLabel={followUpReady ? "Send follow up" : "Save and send invite"}
          onInvite={() => (followUpReady ? sendInviteFollowUp() : submit("INVITE"))}
          onSave={submit}
        />
      </form>
      <UnsavedChangesDialog
        open={leaveHref !== null}
        onSave={saveAndLeave}
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

function VisitEditForm({ jobId, customerId = "", from }: { jobId: string; customerId?: string; from?: CleaningOrigin }) {
  const hub = useHub();
  const router = useRouter();
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
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
    });
    if (!result.ok) return { ok: false, message: result.message };
    if (result.message) hub.flash(result.message);
    router.push(nextHref ?? cleaningHref(cleaning.jobId, from));
    return { ok: true };
  }

  function remove() {
    const result = hub.deleteJob(cleaning.jobId);
    if (!result.ok) return;
    if (result.message) hub.flash(result.message);
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
          arrivalWindowStart: savedArrival?.start ?? "08:00",
          arrivalWindowEnd: savedArrival?.end ?? "09:00",
          expectedDurationMinutes: job.expectedDurationMinutes ?? 240,
          headcountNeeded: job.headcountNeeded,
          specialInstructions: job.specialInstructions,
          cleanerIds,
          cleanerArrivals: cleanerArrivals(job, hub.assignments, hub.cleaners).map((arrival) => ({
            cleanerId: arrival.cleanerId,
            firstName: arrival.firstName,
            arrivalWindowStart: arrival.start,
            arrivalWindowEnd: arrival.end,
          })),
        }}
        leadCleanerId={leadCleanerId}
        canClearCleaners
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
        trailing={
          <button
            type="button"
            onClick={remove}
            className="flex min-h-12 w-full items-center justify-center font-semibold text-red-700 underline decoration-red-700 decoration-2 underline-offset-4"
          >
            Delete cleaning
          </button>
        }
      />
    </Screen>
  );
}

function DraftStaffingForm({ jobId, cleanerId, from }: { jobId: string; cleanerId: string; from?: CleaningOrigin }) {
  const hub = useHub();
  const router = useRouter();
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
  const onRoster = Boolean(job?.draftCleanerIds?.includes(cleanerId));
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
  const initialArrival = defaultArrival(windows, jobStart);
  const [arrivalStart, setArrivalStart] = useState(savedDetail?.arrivalWindowStart ?? initialArrival?.start ?? "");
  const [arrivalEnd, setArrivalEnd] = useState(savedDetail?.arrivalWindowEnd ?? initialArrival?.end ?? "");
  const [crew, setCrew] = useState(savedDetail?.proposedCrewSize ?? usualCrew);
  const [payType, setPayType] = useState<PayType>(savedDetail?.payType ?? DEFAULT_PAY_TYPE);
  const [pay, setPay] = useState(savedDetail ? centsToInput(savedDetail.payPerPersonCents) : DEFAULT_PAY);
  const [message, setMessage] = useState<string | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const draftSnapshot = JSON.stringify({ arrivalStart, arrivalEnd, crew, payType, pay });
  const draftBaseline = useRef<string | null>(null);
  if (job && cleaner && draftBaseline.current === null) draftBaseline.current = draftSnapshot;
  const draftDirty = draftBaseline.current !== null && draftBaseline.current !== draftSnapshot;
  useUnsavedNavigation(Boolean(job && cleaner), () => draftDirty, setLeaveHref);
  const maxCrew = cleaner ? 1 + cleaner.maxHelperCount : 1;

  const gap = savedDetail ? noticeGap(true, savedDetail) : null;
  const flag = cleaner && gap ? noticeFlagText(cleaner.firstName, gap) : null;
  const weekSubmitted = Boolean(
    cleaner &&
      job &&
      hub.submissions.some((submission) => submission.cleanerId === cleaner.cleanerId && submission.weekStart === mondayOf(job.date)),
  );

  function submit(mode: "DRAFT" | "INVITE" | "DIRECT", nextHref?: string) {
    if (!job || !cleaner) return false;
    const payPerPersonCents = dollarsToCents(pay);
    if (payPerPersonCents === null) {
      setMessage("Enter the pay per person, like 50 or 50.00.");
      return false;
    }
    const result = hub.completeAssignment({
      jobId: job.jobId,
      cleanerId: cleaner.cleanerId,
      propertyId: job.propertyId,
      arrivalWindowStart: arrivalStart,
      arrivalWindowEnd: arrivalEnd,
      expectedDurationMinutes: job.expectedDurationMinutes ?? savedDetail?.expectedDurationMinutes ?? 240,
      proposedCrewSize: crew,
      payType,
      payPerPersonCents,
      specialInstructions: job.specialInstructions,
      mode,
    });
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    if (result.message) hub.flash(result.message);
    if (mode === "DIRECT") textDirectAssignment(cleaner, job, arrivalStart, arrivalEnd, hub.flash);
    if (mode === "INVITE") textInviteAssignment(cleaner, job, arrivalStart, arrivalEnd, hub.flash);
    router.push(nextHref ?? cleaningHref(job.jobId, from));
    return true;
  }

  function saveAndLeave() {
    if (!submit("DRAFT", leaveHref ?? undefined)) setLeaveHref(null);
  }

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
        subtitle={cleaningSubtitle(job, jobStart)}
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
        <AssignmentStatus label="Draft assignment" flag={flag} />
        <Field label="Arrival window">
          <select
            className={fieldClass}
            value={arrivalStart}
            onChange={(event) => {
              const window = windows.find((item) => item.start === event.target.value);
              if (!window) return;
              setArrivalStart(window.start);
              setArrivalEnd(window.end);
              setMessage(null);
            }}
          >
            {windows.map((window) => (
              <option key={window.start} value={window.start}>
                {hourWindowLabel(window.start, window.end)}
              </option>
            ))}
          </select>
        </Field>
        {maxCrew > 1 ? (
          <CountField
            label="Crew"
            value={crew}
            min={1}
            max={job.headcountNeeded > 0 ? Math.min(maxCrew, job.headcountNeeded) : maxCrew}
            onChange={(next) => {
              setCrew(next);
              setMessage(null);
            }}
          />
        ) : null}
        <Group label={payType === "HOURLY" ? "Pay per person per hour" : "Pay per person"}>
          <div className="flex gap-2">
            <div className="flex rounded-full bg-white p-1">
              {(["FLAT", "HOURLY"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={payType === item}
                  onClick={() => setPayType(item)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold ${payType === item ? "bg-ink text-cream" : "text-ink/70"}`}
                >
                  {item === "FLAT" ? "Flat" : "Hourly"}
                </button>
              ))}
            </div>
            <input
              inputMode="decimal"
              className={fieldClass}
              aria-label="Pay amount"
              value={pay}
              onChange={(event) => {
                setPay(event.target.value);
                setMessage(null);
              }}
            />
          </div>
        </Group>
        <AssignmentSaveChoices
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
        onSave={saveAndLeave}
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

function AssignmentStatus({ label, flag }: { label: string; flag: string | null }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/50">Status</p>
      <p className="mt-1 text-lg font-semibold">{label}</p>
      {flag ? <div className="mt-3"><Notice>{flag}</Notice></div> : null}
    </div>
  );
}

function AssignmentSaveChoices({
  directAssignNote,
  inviteLabel = "Save and send invite",
  onInvite,
  onSave,
}: {
  directAssignNote: string | null;
  inviteLabel?: string;
  onInvite: () => void;
  onSave: (mode: "DRAFT" | "INVITE" | "DIRECT") => void;
}) {
  return (
    <div className="space-y-2">
      <SecondaryButton type="submit">Save draft</SecondaryButton>
      <PrimaryButton type="button" onClick={onInvite}>
        {inviteLabel}
      </PrimaryButton>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onSave("DIRECT")}
          className="flex min-h-12 w-full items-center justify-center font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4"
        >
          Assign directly and notify
        </button>
        {directAssignNote ? <p className="text-sm text-ink/70">{directAssignNote}</p> : null}
      </div>
    </div>
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
