import type { AssignmentStatus, CleanerProfile, JobAssignment, ServiceType } from "./domain/types";
import { calculateBlockedRange } from "./domain/scheduling";
import { addDays, formatHm, formatLongDate, formatShortDate, formatTimeLabel, zonedParts } from "./domain/time";
import { formatMoney } from "./domain/compensation";
import { formatPhone } from "./domain/customers";

export { formatLongDate, formatMoney, formatPhone, formatShortDate, formatTimeLabel };

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
    case "CONFIRMED":
      return "Confirmed";
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
  if (assignment.status === "DECLINED") return `${cleaner.firstName} — Declined`;
  if (assignment.status === "EXPIRED_JOB_FILLED") return `${cleaner.firstName} — Job filled`;
  if (assignment.status === "CANCELED") return `${cleaner.firstName} — Canceled`;
  const crew = assignment.confirmedCrewSize ?? 1;
  if (!cleaner.helpersApproved || crew <= 1) {
    return `${cleaner.firstName} — ${crew} ${crew === 1 ? "person" : "people"}`;
  }
  if (crew === 2) return `${cleaner.firstName} + helper — 2 people`;
  return `${cleaner.firstName} + helpers — ${crew} people`;
}

export function payLine(assignment: JobAssignment, confirmed: boolean): string {
  const cents = confirmed
    ? (assignment.confirmedTotalPayCents ?? assignment.proposedTotalPayCents)
    : assignment.proposedTotalPayCents;
  if (assignment.payType === "HOURLY") {
    return `${formatMoney(cents)}/hour`;
  }
  return formatMoney(cents);
}
