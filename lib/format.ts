import { helpersApproved, maxCrewSize, typicalCrewSize } from "./domain/cleaners";
import type {
  AssignmentNotice,
  AssignmentStatus,
  CleanerProfile,
  JobAssignment,
  JobCustomerSnapshot,
  ServiceType,
} from "./domain/types";
import {
  assignmentPayFieldAriaLabel,
  assignmentPayFieldHints,
  assignmentPayFieldLabel,
  assignmentPayPerPersonDetail,
  assignmentPaySummaryLine,
  cleanerInvitationPayLines,
} from "./domain/pay-copy";
import { cleaningTimeSpan } from "./domain/availability";
import { calculateBlockedRange, cleaningCoverage, type AssignmentSchedule } from "./domain/scheduling";
import {
  addDays,
  availabilityWeekBounds,
  availabilityWeekOpensForEditing,
  formatHm,
  formatLongDate,
  formatShortDate,
  formatTimeLabel,
  formatWeekRange,
  isAvailabilityWeekEditable,
  minutesFromTime,
  mondayOf,
  timeFromMinutes,
  zonedParts,
} from "./domain/time";
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

export function propertySizeLabel(bedrooms: number, bathrooms: number, squareFeet: number): string | null {
  if (bedrooms === 0 && bathrooms === 0 && squareFeet === 0) return null;
  return `${bedrooms} bed · ${bathrooms} bath · ${squareFeet.toLocaleString()} sq ft`;
}

/** Cleaners see recurring visits as a standard clean; recurrence is an admin scheduling detail. */
export function cleanerServiceLabel(serviceType: ServiceType): string {
  return serviceType === "RECURRING" ? "Standard clean" : serviceLabel(serviceType);
}

/** Customer first name for cleaner-facing copy (never last name). */
export function customerFirstNameForCleaner(
  snapshot: Pick<JobCustomerSnapshot, "customerDisplayName" | "customerFirstName">,
): string {
  const stored = snapshot.customerFirstName?.trim();
  if (stored) return stored;
  const first = snapshot.customerDisplayName.trim().split(/\s+/)[0];
  return first || snapshot.customerDisplayName;
}

export function cleanerHubAppUrl(path = "/cleaner"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

/** Admin iMessage prefill — drop automated “Golden Hour Hub here.” opener. */
export function manualCleanerSmsBody(body: string): string {
  return body.replace(/ Golden Hour Hub here\./g, "").replace(/ Golden Hour here\./g, "");
}

export function waitingOnAvailabilityCopy(today: string, serviceDate: string): string {
  const week = availabilityWeekBounds(mondayOf(serviceDate));
  const range = formatWeekRange(week.weekStart, week.weekEnd);
  if (isAvailabilityWeekEditable(today, serviceDate)) {
    return `You committed to this job. You're fully confirmed once your availability hours include this cleaning. Submit the week of ${range} in Availability below.`;
  }
  const opens = availabilityWeekOpensForEditing(serviceDate);
  return `You committed to this job. You're fully confirmed once your availability hours include this cleaning. Submitting availability for the week of ${range} isn't open in the app yet — you can submit it starting ${formatLongDate(opens)}.`;
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

/** Admin duration controls and schedule summaries that derive on-site end times. */
export const ESTIMATED_ON_SITE_FIELD_LABEL = "Estimated cleaning time";
export const ESTIMATED_ON_SITE_FIELD_HINT = "Counted after the arrival window ends.";

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  if (hours === 0) return `${remainder} min`;
  return `${hours} hr ${remainder} min`;
}

/** On-site end time after the arrival window ends (same rule as admin duration hint). */
export function formatEstimatedOnSiteEnd(
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
  expectedDurationMinutes: number,
): string | null {
  const span = cleaningTimeSpan(arrivalWindowStart, arrivalWindowEnd, expectedDurationMinutes);
  if (!span) return null;
  return formatTimeLabel(span.end);
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
  if (from.suffix === to.suffix) return `${from.clock}–${to.clock} ${to.suffix}`;
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
      return "Awaiting response to invite";
    case "PENDING_AVAILABILITY":
      return "Confirmed";
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
  if (assignment.status === "INVITED") return `${cleaner.firstName} — Awaiting response to invite`;
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

export function arrivalMismatchText(scheduledTime: string, firstName: string, arrivalTime: string): string {
  return `This cleaning is scheduled with the client for ${scheduledTime}, but the earliest cleaner ${firstName} arrives at ${arrivalTime}. You may want to update the client on the arrival time.`;
}

/** Prefill for a manual admin `sms:` link only — never sent via Twilio from the server. */
export function arrivalChangeSms(input: { customerFirstName: string; date: string; scheduledTime: string; arrivalTime: string }): string {
  return `Hi ${input.customerFirstName}! This is Golden Hour Cleaning Co. Your cleaning on ${formatLongDate(input.date)} will start around ${input.arrivalTime} instead of ${input.scheduledTime}. Please allow our cleaner(s) a one-hour window of arrival / grace period due to coming from other jobs. Reply to this message if you need a different time.`;
}

export function cleanerArrivalChangeSms(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
}): string {
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub here. Your arrival time for ${input.customerFirstName} on ${formatLongDate(input.date)} is now ${hourWindowLabel(input.arrivalWindowStart, input.arrivalWindowEnd)}.`;
}

export function cleanerAssignmentChangeSms(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
}): string {
  const window = hourWindowLabel(input.arrivalWindowStart, input.arrivalWindowEnd);
  const duration = formatDuration(input.expectedDurationMinutes);
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub here. The arrival window for your cleaning for ${input.customerFirstName} on ${formatLongDate(input.date)} is now ${window} · this is an approximately ${duration} cleaning.`;
}

export function directAssignmentSms(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  streetAddress: string;
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  appUrl?: string;
}): string {
  const link = input.appUrl ?? cleanerHubAppUrl("/cleaner");
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub here. You're assigned to ${input.customerFirstName} at ${input.streetAddress} on ${formatLongDate(input.date)}, arriving ${hourWindowLabel(input.arrivalWindowStart, input.arrivalWindowEnd)}. Details are in the Golden Hour Hub app: ${link}`;
}

export function inviteAssignmentSms(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  appUrl?: string;
}): string {
  const link = input.appUrl ?? cleanerHubAppUrl("/cleaner");
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub here. You have a cleaning invitation for ${input.customerFirstName} on ${formatLongDate(input.date)}, arriving ${hourWindowLabel(input.arrivalWindowStart, input.arrivalWindowEnd)}. Open the Golden Hour Hub app to accept or decline as soon as you can: ${link}`;
}

export function inviteFollowUpSms(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  date: string;
  appUrl?: string;
}): string {
  const link = input.appUrl ?? cleanerHubAppUrl("/cleaner");
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub reminder: please accept or decline your cleaning invitation for ${input.customerFirstName} on ${formatLongDate(input.date)} in the Golden Hour Hub app as soon as possible: ${link}`;
}

export function cleanerRemovedFromJobSms(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  date: string;
}): string {
  return `Hi ${input.cleanerFirstName}! Golden Hour Hub here. You've been removed from the cleaning for ${input.customerFirstName} on ${formatLongDate(input.date)}. Reach out to Kelsey if you have questions.`;
}

/** Prefill when a cleaner texts Kelsey from a job screen (manual `sms:` link only). */
export function cleanerTextKelseyAboutJobBody(input: {
  cleanerFirstName: string;
  customerFirstName: string;
  date: string;
  serviceLabel: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
  addressLine: string;
  payLine: string;
}): string {
  const arrive = formatArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  const duration = formatDuration(input.expectedDurationMinutes);
  return `Hi Kelsey — it's ${input.cleanerFirstName}. I have a question about this cleaning:

${input.customerFirstName}
${formatLongDate(input.date)} · ${input.serviceLabel}
Arrive ${arrive} · ~${duration}
${input.addressLine}
${input.payLine}

`;
}

export function smsHref(phone: string, body: string): string {
  return `sms:+1${phone}?&body=${encodeURIComponent(body)}`;
}

export function cleanerManualTextHref(phone: string, body: string): string | null {
  if (!/^\d{10}$/.test(phone)) return null;
  return smsHref(phone, manualCleanerSmsBody(body));
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
  if (status === "CONFIRMED") return "Assignment confirmed";
  if (status === "PENDING_AVAILABILITY") return "Assignment confirmed";
  return "Draft assignment";
}

/** Only invited or confirmed assignments track what was texted to the cleaner. */
export function assignmentTracksCleanerNotification(status: JobAssignment["status"]): boolean {
  return status === "INVITED" || status === "CONFIRMED" || status === "PENDING_AVAILABILITY";
}

/** Removal SMS only when the cleaner had committed (direct assign or confirmed), not invite-only. */
export function assignmentNotifiesOnRemoval(status: JobAssignment["status"] | undefined): boolean {
  return status === "CONFIRMED" || status === "PENDING_AVAILABILITY" || status === "NEEDS_ATTENTION";
}

export {
  assignmentPayFieldAriaLabel,
  assignmentPayFieldHints,
  assignmentPayFieldLabel,
  assignmentPayPerPersonDetail,
  cleanerInvitationPayLines,
};

export function payLine(
  assignment: JobAssignment,
  confirmed: boolean,
  cleaner?: Pick<CleanerProfile, "maxHelperCount">,
): string {
  const bringsHelpers = cleaner ? helpersApproved(cleaner.maxHelperCount) : false;
  return assignmentPaySummaryLine(assignment, confirmed, bringsHelpers);
}
