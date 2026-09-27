import type {
  AssignmentStatus,
  AvailabilityWindow,
  JobAssignment,
  Result,
} from "./types.ts";
import {
  addDays,
  isValidLocalTime,
  minutesFromTime,
  splitUtcRange,
  timeFromMinutes,
  zonedToUtc,
  type MinuteSpan,
} from "./time.ts";

export type ScheduleWindow = {
  date: string;
  start: string;
  end: string;
};

export type AssignmentSchedule = {
  assignmentId: string;
  cleanerId: string;
  jobId: string;
  status: AssignmentStatus;
  serviceDate: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
};

export type BlockedRange = {
  startUtc: Date;
  endUtc: Date;
  spans: MinuteSpan[];
};

export function calculateBlockedRange(input: {
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
}): BlockedRange {
  const startUtc = zonedToUtc(input.date, input.arrivalWindowStart);
  let endDate = input.date;
  if (minutesFromTime(input.arrivalWindowEnd) <= minutesFromTime(input.arrivalWindowStart)) {
    endDate = addDays(input.date, 1);
  }
  const windowEnd = zonedToUtc(endDate, input.arrivalWindowEnd);
  const endUtc = new Date(windowEnd.getTime() + input.expectedDurationMinutes * 60_000);
  return {
    startUtc,
    endUtc,
    spans: splitUtcRange(startUtc, endUtc),
  };
}

export function calculateConfirmedHeadcount(
  assignments: Array<Pick<JobAssignment, "status" | "confirmedCrewSize">>,
): number {
  return assignments.reduce((sum, assignment) => {
    if (assignment.status !== "CONFIRMED") return sum;
    return sum + (assignment.confirmedCrewSize ?? 0);
  }, 0);
}

export function calculateRemainingHeadcount(
  headcountNeeded: number,
  assignments: Array<Pick<JobAssignment, "status" | "confirmedCrewSize">>,
): number {
  return headcountNeeded - calculateConfirmedHeadcount(assignments);
}

export function isCleanerAllowedCrewSize(helpersApproved: boolean, crewSize: number): boolean {
  if (!Number.isInteger(crewSize) || crewSize < 1) return false;
  if (!helpersApproved) return crewSize === 1;
  return true;
}

export function validateRequestedCrewSize(input: {
  helpersApproved: boolean;
  requestedCrewSize: number;
  remainingHeadcount: number;
}): Result<{ ok: true }> {
  if (!Number.isInteger(input.requestedCrewSize) || input.requestedCrewSize < 1) {
    return { ok: false, message: "Choose how many people from your crew can attend." };
  }
  if (!input.helpersApproved && input.requestedCrewSize !== 1) {
    return { ok: false, message: "You can only attend on your own for this job." };
  }
  if (input.remainingHeadcount <= 0 || input.requestedCrewSize > input.remainingHeadcount) {
    if (input.remainingHeadcount <= 0) {
      return { ok: false, message: "This job was just filled." };
    }
    const spots = input.remainingHeadcount === 1 ? "1 spot is" : `${input.remainingHeadcount} spots are`;
    return { ok: false, message: `Only ${spots} still open.` };
  }
  return { ok: true };
}

/**
 * Predicate used by the DynamoDB condition on the job item.
 * Two callers that both read the same current headcount must not both succeed.
 * The database applies this check and the increment in one write.
 */
export function claimHeadcount(
  currentConfirmed: number,
  requested: number,
  needed: number,
): Result<{ next: number }> {
  if (!Number.isInteger(requested) || requested < 1) {
    return { ok: false, message: "Choose how many people from your crew can attend." };
  }
  if (currentConfirmed + requested > needed) {
    return { ok: false, message: "This job was just filled." };
  }
  return { ok: true, next: currentConfirmed + requested };
}

export function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
}

export function detectConfirmedAssignmentConflict(input: {
  cleanerId: string;
  blocked: BlockedRange;
  confirmedAssignments: AssignmentSchedule[];
  ignoreAssignmentId?: string;
}): AssignmentSchedule | null {
  for (const assignment of input.confirmedAssignments) {
    if (assignment.cleanerId !== input.cleanerId) continue;
    if (assignment.status !== "CONFIRMED") continue;
    if (assignment.assignmentId === input.ignoreAssignmentId) continue;
    const other = calculateBlockedRange(assignmentToBlock(assignment));
    if (rangesOverlap(input.blocked.startUtc, input.blocked.endUtc, other.startUtc, other.endUtc)) {
      return assignment;
    }
  }
  return null;
}

function assignmentToBlock(assignment: AssignmentSchedule): {
  date: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
} {
  return {
    date: assignment.serviceDate,
    arrivalWindowStart: assignment.arrivalWindowStart,
    arrivalWindowEnd: assignment.arrivalWindowEnd,
    expectedDurationMinutes: assignment.expectedDurationMinutes,
  };
}

export function validateAvailabilityWindows(
  windows: ScheduleWindow[],
): Result<{ ok: true }> {
  const byDate = new Map<string, MinuteSpan[]>();
  for (const window of windows) {
    if (!isValidLocalTime(window.start) || !isValidLocalTime(window.end)) {
      return { ok: false, message: "Enter a start and end time for each available window." };
    }
    const startMin = minutesFromTime(window.start);
    const endMin = minutesFromTime(window.end);
    if (endMin <= startMin) {
      return { ok: false, message: "The end time needs to be after the start time." };
    }
    const spans = byDate.get(window.date) ?? [];
    spans.push({ date: window.date, startMin, endMin });
    byDate.set(window.date, spans);
  }
  for (const spans of byDate.values()) {
    const ordered = [...spans].sort((a, b) => a.startMin - b.startMin);
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].startMin < ordered[index - 1].endMin) {
        return { ok: false, message: "Those times overlap. Adjust them so each window is separate." };
      }
    }
  }
  return { ok: true };
}

export function availabilityCoversBlockedRange(
  windows: ScheduleWindow[],
  blocked: BlockedRange,
): boolean {
  const available = windows.map(windowToSpan).filter((span) => span.endMin > span.startMin);
  return blocked.spans.every((span) => spanCovered(span, available));
}

function windowToSpan(window: ScheduleWindow): MinuteSpan {
  return {
    date: window.date,
    startMin: minutesFromTime(window.start),
    endMin: minutesFromTime(window.end),
  };
}

function spanCovered(target: MinuteSpan, available: MinuteSpan[]): boolean {
  const sameDay = available
    .filter((span) => span.date === target.date)
    .sort((a, b) => a.startMin - b.startMin);
  let cursor = target.startMin;
  for (const span of sameDay) {
    if (span.endMin <= cursor) continue;
    if (span.startMin > cursor) return false;
    cursor = Math.max(cursor, span.endMin);
    if (cursor >= target.endMin) return true;
  }
  return cursor >= target.endMin;
}

export function validateAvailabilityEdit(input: {
  newWindows: ScheduleWindow[];
  confirmedAssignments: AssignmentSchedule[];
}): Result<{ ok: true }> {
  const windowsValid = validateAvailabilityWindows(input.newWindows);
  if (!windowsValid.ok) return windowsValid;
  for (const assignment of input.confirmedAssignments) {
    if (assignment.status !== "CONFIRMED") continue;
    const blocked = calculateBlockedRange(assignmentToBlock(assignment));
    if (!availabilityCoversBlockedRange(input.newWindows, blocked)) {
      return {
        ok: false,
        message:
          "You already have a cleaning scheduled during this time. Please call Kelsey if you need to change your availability.",
      };
    }
  }
  return { ok: true };
}

export function subtractConfirmedBookingsFromAvailability(
  windows: ScheduleWindow[],
  confirmedAssignments: AssignmentSchedule[],
): ScheduleWindow[] {
  const blocks = confirmedAssignments
    .filter((assignment) => assignment.status === "CONFIRMED")
    .flatMap((assignment) => calculateBlockedRange(assignmentToBlock(assignment)).spans);
  let remaining = windows.map(windowToSpan).filter((span) => span.endMin > span.startMin);
  for (const block of blocks) {
    remaining = remaining.flatMap((span) => subtractSpan(span, block));
  }
  return remaining.map((span) => ({
    date: span.date,
    start: timeFromMinutes(span.startMin),
    end: timeFromMinutes(span.endMin),
  }));
}

function subtractSpan(span: MinuteSpan, block: MinuteSpan): MinuteSpan[] {
  if (span.date !== block.date) return [span];
  if (block.endMin <= span.startMin || block.startMin >= span.endMin) return [span];
  const pieces: MinuteSpan[] = [];
  if (block.startMin > span.startMin) {
    pieces.push({ date: span.date, startMin: span.startMin, endMin: block.startMin });
  }
  if (block.endMin < span.endMin) {
    pieces.push({ date: span.date, startMin: block.endMin, endMin: span.endMin });
  }
  return pieces;
}

export function validateCleanerSchedule(input: {
  cleanerId: string;
  cleanerStatus: "ACTIVE" | "INACTIVE";
  windows: ScheduleWindow[];
  blocked: BlockedRange;
  confirmedAssignments: AssignmentSchedule[];
  ignoreAssignmentId?: string;
}): Result<{ ok: true }> {
  if (input.cleanerStatus !== "ACTIVE") {
    return { ok: false, message: "This cleaner is not active." };
  }
  if (!availabilityCoversBlockedRange(input.windows, input.blocked)) {
    return { ok: false, message: "This schedule is outside your submitted availability." };
  }
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: input.cleanerId,
    blocked: input.blocked,
    confirmedAssignments: input.confirmedAssignments,
    ignoreAssignmentId: input.ignoreAssignmentId,
  });
  if (conflict) {
    return { ok: false, message: "You already have a confirmed cleaning during this time." };
  }
  return { ok: true };
}

export function findCompatibleCleaners<T extends { cleanerId: string; status: "ACTIVE" | "INACTIVE" }>(input: {
  cleaners: T[];
  windowsByCleaner: Record<string, ScheduleWindow[]>;
  confirmedByCleaner: Record<string, AssignmentSchedule[]>;
  required: {
    date: string;
    arrivalWindowStart: string;
    arrivalWindowEnd: string;
    expectedDurationMinutes: number;
  };
}): T[] {
  const blocked = calculateBlockedRange({
    date: input.required.date,
    arrivalWindowStart: input.required.arrivalWindowStart,
    arrivalWindowEnd: input.required.arrivalWindowEnd,
    expectedDurationMinutes: input.required.expectedDurationMinutes,
  });
  return input.cleaners.filter((cleaner) => {
    if (cleaner.status !== "ACTIVE") return false;
    const windows = input.windowsByCleaner[cleaner.cleanerId] ?? [];
    if (!availabilityCoversBlockedRange(windows, blocked)) return false;
    const conflict = detectConfirmedAssignmentConflict({
      cleanerId: cleaner.cleanerId,
      blocked,
      confirmedAssignments: input.confirmedByCleaner[cleaner.cleanerId] ?? [],
    });
    return !conflict;
  });
}

export function toAssignmentSchedule(assignment: JobAssignment): AssignmentSchedule {
  return {
    assignmentId: assignment.assignmentId,
    cleanerId: assignment.cleanerId,
    jobId: assignment.jobId,
    status: assignment.status,
    serviceDate: assignment.serviceDate,
    arrivalWindowStart: assignment.arrivalWindowStart,
    arrivalWindowEnd: assignment.arrivalWindowEnd,
    expectedDurationMinutes: assignment.expectedDurationMinutes,
  };
}

export function windowsForCleaner(
  windows: AvailabilityWindow[],
  cleanerId: string,
): ScheduleWindow[] {
  return windows
    .filter((window) => window.cleanerId === cleanerId)
    .map((window) => ({ date: window.date, start: window.start, end: window.end }));
}
