import { confirmedCompensationCents } from "./compensation.ts";
import {
  availabilityCoversBlockedRange,
  calculateBlockedRange,
  detectConfirmedAssignmentConflict,
  type ScheduleWindow,
} from "./scheduling.ts";
import type {
  DayOfWeek,
  EditScope,
  JobAssignment,
  RecurrenceRule,
  Result,
  StaffingTemplateEntry,
  StaffingTemplateMode,
  WeekOrdinal,
} from "./types.ts";
import {
  addDays,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatYmd,
  mondayOf,
  parseYmd,
} from "./time.ts";

const DAY_LABEL: Record<DayOfWeek, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export function recurrenceSummary(rule: RecurrenceRule): string {
  if (rule.frequency === "WEEK") {
    const days = (rule.daysOfWeek ?? []).map((day) => DAY_LABEL[day]);
    const dayText = joinList(days);
    if (rule.interval === 1) return `Every ${dayText}`;
    return `Every ${rule.interval} weeks on ${dayText}`;
  }
  if (rule.dayOfMonth) {
    return `Every month on the ${ordinalNumber(rule.dayOfMonth)}`;
  }
  const ordinals = (rule.weekOrdinals ?? []).map(ordinalLabel);
  const days = (rule.daysOfWeek ?? []).map((day) => DAY_LABEL[day]);
  return `Every ${joinList(ordinals)} ${joinList(days)} of the month`;
}

export function validateRecurrenceRule(
  rule: RecurrenceRule,
  anchorDate?: string,
): Result<{ summary: string }> {
  if (rule.frequency === "WEEK") {
    if (![1, 2, 4].includes(rule.interval)) {
      return { ok: false, message: "Choose every week, every 2 weeks, or every 4 weeks." };
    }
    if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
      return { ok: false, message: "Choose at least one day of the week." };
    }
    if (rule.dayOfMonth || (rule.weekOrdinals && rule.weekOrdinals.length > 0)) {
      return { ok: false, message: "Weekly cleaning does not use a calendar date or week number." };
    }
  } else if (rule.frequency === "MONTH") {
    if (rule.interval !== 1) {
      return { ok: false, message: "Monthly cleaning repeats every month." };
    }
    const hasDay = rule.dayOfMonth !== undefined;
    const hasOrdinal = (rule.weekOrdinals?.length ?? 0) > 0;
    if (hasDay === hasOrdinal) {
      return { ok: false, message: "Choose either a calendar date or which weeks of the month." };
    }
    if (hasDay && (rule.dayOfMonth! < 1 || rule.dayOfMonth! > 31)) {
      return { ok: false, message: "Choose a day of the month from 1 to 31." };
    }
    if (hasOrdinal && (!rule.daysOfWeek || rule.daysOfWeek.length === 0)) {
      return { ok: false, message: "Choose the weekday for this monthly cleaning." };
    }
  } else {
    return { ok: false, message: "Choose how often this cleaning repeats." };
  }

  const summary = recurrenceSummary(rule);
  if (anchorDate && !dateMatchesRule(rule, anchorDate, anchorDate)) {
    return {
      ok: false,
      message: "The start date doesn't fall on that repeat pattern. Choose a matching date.",
    };
  }
  return { ok: true, summary };
}

export function dateMatchesRule(rule: RecurrenceRule, date: string, anchorDate: string): boolean {
  if (date < anchorDate) return false;
  if (rule.frequency === "WEEK") {
    if (!rule.daysOfWeek?.includes(dayOfWeek(date))) return false;
    const weeks = daysBetween(mondayOf(anchorDate), mondayOf(date)) / 7;
    return weeks >= 0 && weeks % rule.interval === 0;
  }
  const anchor = parseYmd(anchorDate);
  const current = parseYmd(date);
  const monthDelta = (current.year - anchor.year) * 12 + (current.month - anchor.month);
  if (monthDelta < 0 || monthDelta % rule.interval !== 0) return false;
  if (rule.dayOfMonth) return current.day === rule.dayOfMonth && current.day <= daysInMonth(current.year, current.month);
  return monthlyWeekdayMatches(rule, date);
}

export function generateOccurrenceDates(
  rule: RecurrenceRule,
  anchorDate: string,
  throughDate: string,
  endDate?: string,
): string[] {
  const last = endDate && endDate < throughDate ? endDate : throughDate;
  if (last < anchorDate) return [];
  if (rule.frequency === "WEEK") {
    const dates: string[] = [];
    let cursor = anchorDate;
    while (cursor <= last) {
      if (dateMatchesRule(rule, cursor, anchorDate)) dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }
  const dates: string[] = [];
  const anchor = parseYmd(anchorDate);
  const end = parseYmd(last);
  let year = anchor.year;
  let month = anchor.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    const monthDelta = (year - anchor.year) * 12 + (month - anchor.month);
    if (monthDelta % rule.interval === 0) {
      if (rule.dayOfMonth) {
        if (rule.dayOfMonth <= daysInMonth(year, month)) {
          const date = formatYmd(year, month, rule.dayOfMonth);
          if (date >= anchorDate && date <= last) dates.push(date);
        }
      } else {
        for (const day of rule.daysOfWeek ?? []) {
          for (const date of datesForOrdinals(year, month, day, rule.weekOrdinals ?? [])) {
            if (date >= anchorDate && date <= last) dates.push(date);
          }
        }
      }
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return [...new Set(dates)].sort();
}

export function calculateNextOccurrence(
  rule: RecurrenceRule,
  anchorDate: string,
  afterDate: string,
  endDate?: string,
): string | null {
  let cursor = addDays(afterDate, 1);
  for (let step = 0; step < 800; step += 1) {
    if (endDate && cursor > endDate) return null;
    if (dateMatchesRule(rule, cursor, anchorDate)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

export function shouldGenerateOccurrence(existingDates: ReadonlySet<string>, date: string): boolean {
  return !existingDates.has(date);
}

export function determineRecurringEditScope(
  scope: EditScope,
  occurrenceDate: string,
  occurrenceDates: string[],
): { updateSeries: boolean; dates: string[] } {
  if (scope === "THIS_ONLY") {
    return { updateSeries: false, dates: occurrenceDates.filter((date) => date === occurrenceDate) };
  }
  return {
    updateSeries: true,
    dates: occurrenceDates.filter((date) => date >= occurrenceDate),
  };
}

export function copyStaffingTemplateToOccurrence(input: {
  jobId: string;
  serviceDate: string;
  template: StaffingTemplateEntry[];
  mode: Exclude<StaffingTemplateMode, "BLANK">;
  nowIso: string;
  newId: () => string;
}): JobAssignment[] {
  return input.template.map((entry) => buildAssignment(input, entry));
}

export function planOccurrenceStaffing(input: {
  jobId: string;
  serviceDate: string;
  headcountNeeded: number;
  mode: StaffingTemplateMode;
  template: StaffingTemplateEntry[];
  cleaners: Array<{
    cleanerId: string;
    firstName: string;
    status: "ACTIVE" | "INACTIVE";
    helpersApproved: boolean;
  }>;
  availabilityByCleaner: Record<string, { submitted: boolean; windows: ScheduleWindow[] }>;
  confirmedAssignments: JobAssignment[];
  nowIso: string;
  newId: () => string;
}): { assignments: JobAssignment[]; attention: { cleanerId: string; reason: string }[] } {
  if (input.mode === "BLANK") return { assignments: [], attention: [] };

  const assignments: JobAssignment[] = [];
  const attention: { cleanerId: string; reason: string }[] = [];
  let confirmedPeople = 0;

  for (const entry of input.template) {
    const cleaner = input.cleaners.find((candidate) => candidate.cleanerId === entry.cleanerId);
    if (!cleaner || cleaner.status !== "ACTIVE") {
      attention.push({
        cleanerId: entry.cleanerId,
        reason: "This cleaner is not active, so the cleaning was left unassigned.",
      });
      continue;
    }
    if (!cleaner.helpersApproved && entry.proposedCrewSize !== 1) {
      attention.push({
        cleanerId: cleaner.cleanerId,
        reason: `${cleaner.firstName} is not approved to bring helpers, so the crew size must be 1.`,
      });
      continue;
    }
    if (!Number.isInteger(entry.proposedCrewSize) || entry.proposedCrewSize < 1) {
      attention.push({
        cleanerId: cleaner.cleanerId,
        reason: `${cleaner.firstName}'s crew size is not valid.`,
      });
      continue;
    }

    if (input.mode === "INVITE") {
      assignments.push(
        buildAssignment(
          {
            jobId: input.jobId,
            serviceDate: input.serviceDate,
            mode: "INVITE",
            nowIso: input.nowIso,
            newId: input.newId,
          },
          entry,
        ),
      );
      continue;
    }

    if (confirmedPeople + entry.proposedCrewSize > input.headcountNeeded) {
      attention.push({
        cleanerId: cleaner.cleanerId,
        reason: `${cleaner.firstName}'s crew does not fit the remaining headcount.`,
      });
      continue;
    }

    const availability = input.availabilityByCleaner[cleaner.cleanerId];
    if (!availability?.submitted) {
      attention.push({
        cleanerId: cleaner.cleanerId,
        reason: `${cleaner.firstName} has not submitted availability for this week yet.`,
      });
      continue;
    }
    const blocked = calculateBlockedRange({
      date: input.serviceDate,
      arrivalWindowStart: entry.arrivalWindowStart,
      arrivalWindowEnd: entry.arrivalWindowEnd,
      expectedDurationMinutes: entry.expectedDurationMinutes,
    });
    if (!availabilityCoversBlockedRange(availability.windows, blocked)) {
      attention.push({
        cleanerId: cleaner.cleanerId,
        reason: `This schedule is outside ${cleaner.firstName}'s submitted availability.`,
      });
      continue;
    }
    const conflict = detectConfirmedAssignmentConflict({
      cleanerId: cleaner.cleanerId,
      blocked,
      confirmedAssignments: input.confirmedAssignments
        .filter((assignment) => assignment.cleanerId === cleaner.cleanerId)
        .map((assignment) => ({
          assignmentId: assignment.assignmentId,
          cleanerId: assignment.cleanerId,
          jobId: assignment.jobId,
          status: assignment.status,
          serviceDate: assignment.serviceDate,
          arrivalWindowStart: assignment.arrivalWindowStart,
          arrivalWindowEnd: assignment.arrivalWindowEnd,
          expectedDurationMinutes: assignment.expectedDurationMinutes,
        })),
    });
    if (conflict) {
      attention.push({
        cleanerId: cleaner.cleanerId,
        reason: `This recurring cleaning could not be assigned to ${cleaner.firstName} because it conflicts with another confirmed job.`,
      });
      continue;
    }

    assignments.push(
      buildAssignment(
        {
          jobId: input.jobId,
          serviceDate: input.serviceDate,
          mode: "DIRECT",
          nowIso: input.nowIso,
          newId: input.newId,
        },
        entry,
      ),
    );
    confirmedPeople += entry.proposedCrewSize;
  }

  return { assignments, attention };
}

function buildAssignment(
  input: {
    jobId: string;
    serviceDate: string;
    mode: Exclude<StaffingTemplateMode, "BLANK">;
    nowIso: string;
    newId: () => string;
  },
  entry: StaffingTemplateEntry,
): JobAssignment {
  const proposedTotalPayCents = confirmedCompensationCents({
    payType: entry.payType,
    payPerPersonCents: entry.payPerPersonCents,
    confirmedCrewSize: entry.proposedCrewSize,
  });
  const confirmed = input.mode === "DIRECT";
  return {
    assignmentId: input.newId(),
    jobId: input.jobId,
    cleanerId: entry.cleanerId,
    serviceDate: input.serviceDate,
    status: confirmed ? "CONFIRMED" : "INVITED",
    proposedCrewSize: entry.proposedCrewSize,
    confirmedCrewSize: confirmed ? entry.proposedCrewSize : undefined,
    arrivalWindowStart: entry.arrivalWindowStart,
    arrivalWindowEnd: entry.arrivalWindowEnd,
    expectedDurationMinutes: entry.expectedDurationMinutes,
    payType: entry.payType,
    payPerPersonCents: entry.payPerPersonCents,
    proposedTotalPayCents,
    confirmedTotalPayCents: confirmed ? proposedTotalPayCents : undefined,
    invitedAt: input.nowIso,
    respondedAt: confirmed ? input.nowIso : undefined,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}

function monthlyWeekdayMatches(rule: RecurrenceRule, date: string): boolean {
  const { year, month } = parseYmd(date);
  const weekday = dayOfWeek(date);
  if (!rule.daysOfWeek?.includes(weekday)) return false;
  const matches = datesForOrdinals(year, month, weekday, rule.weekOrdinals ?? []);
  return matches.includes(date);
}

function datesForOrdinals(
  year: number,
  month: number,
  weekday: DayOfWeek,
  ordinals: WeekOrdinal[],
): string[] {
  const dates: string[] = [];
  const count = daysInMonth(year, month);
  for (let day = 1; day <= count; day += 1) {
    const date = formatYmd(year, month, day);
    if (dayOfWeek(date) === weekday) dates.push(date);
  }
  const selected = new Set<string>();
  for (const ordinal of ordinals) {
    if (ordinal === "LAST") {
      const last = dates[dates.length - 1];
      if (last) selected.add(last);
    } else if (dates[ordinal - 1]) {
      selected.add(dates[ordinal - 1]);
    }
  }
  return [...selected];
}

function ordinalLabel(ordinal: WeekOrdinal): string {
  if (ordinal === "LAST") return "last";
  return ordinalNumber(ordinal);
}

function ordinalNumber(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
