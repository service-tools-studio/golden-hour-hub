import { helpersApproved, maxCrewSize, typicalCrewSize } from "./domain/cleaners";
import type { AssignmentNotice, AssignmentStatus, CleanerProfile, JobAssignment, ServiceType } from "./domain/types";
import { calculateBlockedRange, cleaningCoverage, type AssignmentSchedule } from "./domain/scheduling";
import { addDays, formatHm, formatLongDate, formatShortDate, formatTimeLabel, minutesFromTime, timeFromMinutes, zonedParts } from "./domain/time";
import { formatMoney } from "./domain/compensation";
import { formatPhone, formatPhoneInput } from "./domain/customers";

export { formatLongDate, formatMoney, formatPhone, formatPhoneInput, formatShortDate, formatTimeLabel };

export function hourWindows(start: string, end: string): { start: string; end: string }[] {
  const first = Math.ceil(minutesFromTime(start) / 60) * 60;
  const last = minutesFromTime(end);
  const windows: { start: string; end: string }[] = [];
  for (let minute = first; minute + 60 <= last && minute + 60 <= 24 * 60; minute += 60) {
    windows.push({ start: timeFromMinutes(minute), end: timeFromMinutes(minute + 60) });
  }
  return windows;
}

export function hourWindowLabel(start: string, end: string): string {
  const [startClock, startSuffix] = formatTimeLabel(start).replace(":00", "").split(" ");
  const [endClock, endSuffix] = formatTimeLabel(end).replace(":00", "").split(" ");
  if (startSuffix === endSuffix) return `${startClock}–${endClock} ${endSuffix}`;
  return `${startClock} ${startSuffix}–${endClock} ${endSuffix}`;
}

export function serviceLabel(serviceType: ServiceType): string {
  switch (serviceType) {
    case "RECURRING":
      return "Recurring clean";
    case "DEEP_CLEAN":
      return "Deep clean";
    case "MOVE_OUT":
      return "Move-out";
    case "POST_CONSTRUCTION":
      return "Post-construction";
    case "OTHER":
      return "Other";
  }
}

export function serviceEmoji(serviceType: ServiceType): string | null {
  switch (serviceType) {
    case "DEEP_CLEAN":
      return "🧼";
    case "MOVE_OUT":
      return "📦";
    case "RECURRING":
      return "🗓️";
    default:
      return null;
  }
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  if (hours === 0) return `${remainder} min`;
  return `${hours} hr ${remainder} min`;
}

export function formatArrival(start: string, end: string): string {
  return `${formatTimeLabel(start)} – ${formatTimeLabel(end)}`;
}

export function formatCleaningSpan(
  assignments: Array<
    Pick<
      AssignmentSchedule,
      "status" | "serviceDate" | "arrivalWindowStart" | "arrivalWindowEnd" | "expectedDurationMinutes"
    >
  >,
): string | null {
  const coverage = cleaningCoverage(assignments);
  if (!coverage) return null;
  const end = zonedParts(coverage.endUtc);
  const start = zonedParts(coverage.startUtc);
  return formatArrival(formatHm(start.hour, start.minute), formatHm(end.hour, end.minute));
}

export function formatJobSpan(input: {
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
}): string {
  const end = zonedParts(calculateBlockedRange(input).endUtc);
  return formatArrival(input.arrivalWindowStart, formatHm(end.hour, end.minute));
}

function compactClock(time: string): { clock: string; suffix: string } {
  const [clock, suffix] = formatTimeLabel(time).split(" ");
  return { clock, suffix };
}

function compactWindow(start: string, end: string): string {
  const from = compactClock(start);
  const to = compactClock(end);
  if (from.suffix === to.suffix) return `${from.clock}–${to.clock}`;
  return `${from.clock} ${from.suffix}–${to.clock} ${to.suffix}`;
}

function compactDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
  if (hours === 0) return `${remainder} min`;
  return `${hours} hr ${remainder}`;
}

export function formatScheduleFacts(input: {
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
}): { arrive: string; length: string; ends: string } {
  const blocked = calculateBlockedRange({
    date: input.date,
    arrivalWindowStart: input.arrivalWindowStart,
    arrivalWindowEnd: input.arrivalWindowEnd,
    expectedDurationMinutes: input.expectedDurationMinutes,
  });
  const end = zonedParts(blocked.endUtc);
  return {
    arrive: compactWindow(input.arrivalWindowStart, input.arrivalWindowEnd),
    length: compactDuration(input.expectedDurationMinutes),
    ends: formatTimeLabel(formatHm(end.hour, end.minute)),
  };
}

export function relativeDay(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatShortDate(date);
}

export function assignmentStatusLabel(status: AssignmentStatus): string {
  switch (status) {
    case "INVITED":
      return "Awaiting";
    case "PENDING_AVAILABILITY":
      return "Waiting on availability";
    case "CONFIRMED":
      return "Confirmed";
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

export function crewLine(cleaner: CleanerProfile, assignment: JobAssignment): string {
  if (assignment.status === "INVITED") return `${cleaner.firstName} — Awaiting`;
  if (assignment.status === "PENDING_AVAILABILITY") return `${cleaner.firstName} — Awaiting`;
  if (assignment.status === "NEEDS_ATTENTION") return `${cleaner.firstName} — Needs attention`;
  if (assignment.status === "DECLINED") return `${cleaner.firstName} — Declined`;
  if (assignment.status === "EXPIRED_JOB_FILLED") return `${cleaner.firstName} — Job filled`;
  if (assignment.status === "CANCELED") return `${cleaner.firstName} — Canceled`;
  const crew = assignment.confirmedCrewSize ?? assignment.pendingCrewSize ?? 1;
  if (!helpersApproved(cleaner.maxHelperCount) || crew <= 1) {
    return `${cleaner.firstName} — ${crew} ${crew === 1 ? "person" : "people"}`;
  }
  if (crew === 2) return `${cleaner.firstName} + helper — 2 people`;
  return `${cleaner.firstName} + helpers — ${crew} people`;
}

export function cleanerCrewSummary(cleaner: CleanerProfile): string {
  if (!helpersApproved(cleaner.maxHelperCount)) return "Works alone · crew of 1";
  return `Helpers approved · usual crew ${typicalCrewSize(cleaner.typicalHelperCount)} · max ${maxCrewSize(cleaner.maxHelperCount)}`;
}

export function noticeGap(draft: boolean, current: AssignmentNotice, lastNotified?: AssignmentNotice): "assignment" | "changes" | null {
  if (draft) return "assignment";
  if (!lastNotified) return null;
  const same =
    lastNotified.arrivalWindowStart === current.arrivalWindowStart &&
    lastNotified.arrivalWindowEnd === current.arrivalWindowEnd &&
    lastNotified.expectedDurationMinutes === current.expectedDurationMinutes &&
    lastNotified.proposedCrewSize === current.proposedCrewSize &&
    lastNotified.payType === current.payType &&
    lastNotified.payPerPersonCents === current.payPerPersonCents;
  return same ? null : "changes";
}

export function dateReinviteNeeded(
  assignment: Pick<JobAssignment, "status" | "serviceDate" | "notifiedServiceDate">,
  date: string,
): boolean {
  if (assignment.status !== "INVITED" && assignment.status !== "CONFIRMED") return false;
  return date !== (assignment.notifiedServiceDate ?? assignment.serviceDate);
}

export function reinviteFlagText(firstNames: string[]): string | null {
  if (firstNames.length === 0) return null;
  const list =
    firstNames.length === 1
      ? firstNames[0]
      : firstNames.length === 2
        ? `${firstNames[0]} and ${firstNames[1]}`
        : `${firstNames.slice(0, -1).join(", ")}, and ${firstNames[firstNames.length - 1]}`;
  return `${list} ${firstNames.length === 1 ? "needs" : "need"} to be reinvited for the new date.`;
}

export function arrivalMismatchText(firstName: string, arrivalLabel: string): string {
  return `This does not match the earliest cleaner. ${firstName} arrives ${arrivalLabel}.`;
}

export function earliestCleanerArrival<T extends { start: string }>(windows: T[]): T | null {
  let earliest: T | null = null;
  for (const window of windows) {
    if (!earliest || minutesFromTime(window.start) < minutesFromTime(earliest.start)) earliest = window;
  }
  return earliest;
}

export function noticeFlagText(firstName: string, gap: "assignment" | "changes"): string {
  return gap === "assignment"
    ? `${firstName} has not been notified of this assignment.`
    : `${firstName} has not been notified of these changes.`;
}

export function assignmentFormStatus(status: JobAssignment["status"] | "DRAFT"): string {
  if (status === "INVITED" || status === "DECLINED") return "Invite sent";
  if (status === "CONFIRMED" || status === "PENDING_AVAILABILITY") return "Assignment confirmed";
  return "Draft assignment";
}

export function payLine(assignment: JobAssignment, confirmed: boolean): string {
  const cents = confirmed
    ? (assignment.confirmedTotalPayCents ?? assignment.proposedTotalPayCents)
    : assignment.proposedTotalPayCents;
  if (assignment.payType === "HOURLY") return `${formatMoney(cents)}/hour`;
  return `${formatMoney(cents)} flat`;
}
