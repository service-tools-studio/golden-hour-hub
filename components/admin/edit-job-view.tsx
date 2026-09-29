"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CleaningForm, dayArrivalWindows, type CleaningValues } from "@/components/admin/cleaning-form";
import { useHub } from "@/components/hub-provider";
import { UnsavedChangesDialog, useUnsavedNavigation } from "@/components/unsaved-changes";
import { Field, Notice, PageHeader, PrimaryButton, Screen, SecondaryButton, fieldClass } from "@/components/ui";
import { personName, typicalCrewSize } from "@/lib/domain/cleaners";
import type { PayType } from "@/lib/domain/types";
import { mondayOf } from "@/lib/domain/time";
import {
  arrivalMismatchText,
  assignmentFormStatus,
  dateReinviteNeeded,
  earliestCleanerArrival,
  formatLongDate,
  hourWindowLabel,
  hourWindows,
  noticeFlagText,
  noticeGap,
  reinviteFlagText,
} from "@/lib/format";

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


export function EditJobView({
  jobId,
  assignmentId,
  cleanerId = "",
  customerId = "",
}: {
  jobId: string;
  assignmentId: string;
  cleanerId?: string;
  customerId?: string;
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
  const [arrivalStart, setArrivalStart] = useState(assignment?.arrivalWindowStart ?? arrivalWindows[0]?.start ?? "");
  const [arrivalEnd, setArrivalEnd] = useState(assignment?.arrivalWindowEnd ?? arrivalWindows[0]?.end ?? "");
  const [crew, setCrew] = useState(assignment?.confirmedCrewSize ?? assignment?.pendingCrewSize ?? assignment?.proposedCrewSize ?? 1);
  const [payType, setPayType] = useState<PayType>(assignment?.payType ?? "FLAT");
  const [pay, setPay] = useState(assignment ? centsToInput(assignment.payPerPersonCents) : "");
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
    router.push(nextHref ?? `/admin/jobs/${jobId}`);
    return true;
  }

  function saveAndLeave() {
    if (!submit("DRAFT", leaveHref ?? undefined)) setLeaveHref(null);
  }

  if (cleanerId && !assignment) {
    return <DraftStaffingForm jobId={jobId} cleanerId={cleanerId} />;
  }

  if (!assignmentId && !cleanerId) {
    return <VisitEditForm jobId={jobId} customerId={customerId} />;
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
        subtitle={`${job.snapshot.customerDisplayName} · ${formatLongDate(job.date)}`}
        crumb={{ href: `/admin/jobs/${job.jobId}`, label: "Cleaning" }}
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
          weekNote={
            weekSubmitted
              ? null
              : `${cleaner.firstName} has not submitted this week yet. Assigning directly keeps ${cleaner.firstName} on the cleaning and confirms it once availability is in.`
          }
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

function VisitEditForm({ jobId, customerId = "" }: { jobId: string; customerId?: string }) {
  const hub = useHub();
  const router = useRouter();
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
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
  const leadCleanerId = cleanerIds[0] ?? hub.cleaners.find((item) => item.status === "ACTIVE")?.cleanerId ?? "";

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
    });
    if (!result.ok) return { ok: false, message: result.message };
    if (result.message) hub.flash(result.message);
    router.push(nextHref ?? `/admin/jobs/${cleaning.jobId}`);
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
        subtitle={formatLongDate(job.date)}
        crumb={{ href: `/admin/jobs/${job.jobId}`, label: "Cleaning" }}
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
          cleanerIds: cleanerIds.length > 0 ? cleanerIds : leadCleanerId ? [leadCleanerId] : [],
        }}
        arrivalWindows={dayArrivalWindows(savedArrival)}
        leadCleanerId={leadCleanerId}
        showDate
        newCustomerHref={`/admin/customers/new?returnTo=${encodeURIComponent(`/admin/jobs/${job.jobId}/edit`)}`}
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
        afterArrival={(start, end) => {
          const earliest = earliestCleanerArrival(cleanerArrivals(job, hub.assignments, hub.cleaners));
          if (!earliest || (start === earliest.start && end === earliest.end)) return null;
          return <Notice>{arrivalMismatchText(earliest.firstName, hourWindowLabel(earliest.start, earliest.end))}</Notice>;
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

function DraftStaffingForm({ jobId, cleanerId }: { jobId: string; cleanerId: string }) {
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
  const [arrivalStart, setArrivalStart] = useState(savedDetail?.arrivalWindowStart ?? windows[0]?.start ?? "");
  const [arrivalEnd, setArrivalEnd] = useState(savedDetail?.arrivalWindowEnd ?? windows[0]?.end ?? "");
  const [crew, setCrew] = useState(savedDetail?.proposedCrewSize ?? usualCrew);
  const [payType, setPayType] = useState<PayType>(savedDetail?.payType ?? "FLAT");
  const [pay, setPay] = useState(savedDetail ? centsToInput(savedDetail.payPerPersonCents) : "50");
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
    router.push(nextHref ?? `/admin/jobs/${job.jobId}`);
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
        subtitle={`${job.snapshot.customerDisplayName} · ${formatLongDate(job.date)}`}
        crumb={{ href: `/admin/jobs/${job.jobId}`, label: "Cleaning" }}
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
          weekNote={
            weekSubmitted
              ? null
              : `${cleaner.firstName} has not submitted this week yet. Assigning directly keeps ${cleaner.firstName} on the cleaning and confirms it once availability is in.`
          }
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
  weekNote,
  onSave,
}: {
  weekNote: string | null;
  onSave: (mode: "DRAFT" | "INVITE" | "DIRECT") => void;
}) {
  return (
    <div className="space-y-2">
      <SecondaryButton type="submit">Save draft</SecondaryButton>
      <PrimaryButton type="button" onClick={() => onSave("INVITE")}>
        Save and send invite
      </PrimaryButton>
      <button
        type="button"
        onClick={() => onSave("DIRECT")}
        className="flex min-h-12 w-full items-center justify-center font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4"
      >
        Save and assign directly
      </button>
      {weekNote ? <p className="text-sm text-ink/70">{weekNote}</p> : null}
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
