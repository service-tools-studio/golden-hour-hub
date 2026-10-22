import { maxCrewSize } from "./cleaners.ts";
import { confirmedCompensationCents } from "./compensation.ts";
import type {
  AssignmentStatus,
  AvailabilityWindow,
  CleanerProfile,
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
  const endUtc = new Date(startUtc.getTime() + input.expectedDurationMinutes * 60_000);
  return {
    startUtc,
    endUtc,
    spans: splitUtcRange(startUtc, endUtc),
  };
}

export function isWithinRange(range: { startUtc: Date; endUtc: Date }, nowMs: number): boolean {
  return range.startUtc.getTime() <= nowMs && nowMs < range.endUtc.getTime();
}

const COUNTS_TOWARD_JOB_TIME = new Set<AssignmentStatus>(["INVITED", "CONFIRMED"]);

/** Earliest arrival-window start through the latest expected end, across cleaners still on the job. */
export function cleaningCoverage(
  assignments: Array<
    Pick<
      AssignmentSchedule,
      "status" | "serviceDate" | "arrivalWindowStart" | "arrivalWindowEnd" | "expectedDurationMinutes"
    >
  >,
): { startUtc: Date; endUtc: Date } | null {
  const active = assignments.filter((assignment) => COUNTS_TOWARD_JOB_TIME.has(assignment.status));
  if (active.length === 0) return null;
  let startUtc: Date | null = null;
  let endUtc: Date | null = null;
  for (const assignment of active) {
    const blocked = calculateBlockedRange({
      date: assignment.serviceDate,
      arrivalWindowStart: assignment.arrivalWindowStart,
      arrivalWindowEnd: assignment.arrivalWindowEnd,
      expectedDurationMinutes: assignment.expectedDurationMinutes,
    });
    if (!startUtc || blocked.startUtc.getTime() < startUtc.getTime()) startUtc = blocked.startUtc;
    if (!endUtc || blocked.endUtc.getTime() > endUtc.getTime()) endUtc = blocked.endUtc;
  }
  return startUtc && endUtc ? { startUtc, endUtc } : null;
}

export function calculateInvitedHeadcount(
  assignments: Array<Pick<JobAssignment, "status"> & { proposedCrewSize?: number }>,
): number {
  return assignments.reduce((sum, assignment) => {
    if (assignment.status !== "INVITED") return sum;
    return sum + (assignment.proposedCrewSize ?? 0);
  }, 0);
}

/** Headcount that counts toward staffing the job (confirmed + direct-assigned awaiting availability). */
export function staffedCrewSize(
  assignment: Pick<JobAssignment, "status" | "confirmedCrewSize" | "pendingCrewSize" | "proposedCrewSize">,
): number {
  if (assignment.status === "CONFIRMED") return assignment.confirmedCrewSize ?? 0;
  if (assignment.status === "PENDING_AVAILABILITY") {
    return assignment.pendingCrewSize ?? assignment.proposedCrewSize ?? 0;
  }
  return 0;
}

export function calculateConfirmedHeadcount(
  assignments: Array<Pick<JobAssignment, "status" | "confirmedCrewSize" | "pendingCrewSize" | "proposedCrewSize">>,
): number {
  return assignments.reduce((sum, assignment) => sum + staffedCrewSize(assignment), 0);
}

export function calculateRemainingHeadcount(
  headcountNeeded: number,
  assignments: Array<Pick<JobAssignment, "status" | "confirmedCrewSize" | "pendingCrewSize" | "proposedCrewSize">>,
): number {
  return headcountNeeded - calculateConfirmedHeadcount(assignments);
}

/** Max crew the admin may propose for one cleaner on a job, given headcount and other staffed assignments. */
export function proposedCrewCeiling(input: {
  headcountNeeded: number;
  maxHelperCount: number;
  assignments: Array<
    Pick<JobAssignment, "assignmentId" | "status" | "confirmedCrewSize" | "pendingCrewSize" | "proposedCrewSize">
  >;
  assignmentId?: string;
}): number {
  const cleanerMax = maxCrewSize(input.maxHelperCount);
  if (input.headcountNeeded <= 0) return cleanerMax;
  const others = input.assignments.filter((item) => item.assignmentId !== input.assignmentId);
  const usedByOthers = calculateConfirmedHeadcount(others);
  const open = input.headcountNeeded - usedByOthers;
  return Math.min(cleanerMax, Math.max(open, 1));
}

/** Keep the stepper able to return to the crew size when the form was opened. */
export function assignmentCrewStepperMax(ceiling: number, openedAtCrew: number): number {
  return Math.max(ceiling, openedAtCrew);
}

/** Cleaner invite accept stepper: default to proposed crew, adjustable up to proposed and cleaner max. */
export function invitationAttendanceBounds(proposedCrewSize: number, maxHelperCount: number): {
  min: number;
  max: number;
  default: number;
} {
  const max = Math.min(proposedCrewSize, maxCrewSize(maxHelperCount));
  const safeMax = Math.max(max, 1);
  return { min: 1, max: safeMax, default: safeMax };
}

export function assignmentBlocksCleaningDeletion(status: JobAssignment["status"]): boolean {
  return status === "CONFIRMED" || status === "PENDING_AVAILABILITY" || status === "NEEDS_ATTENTION";
}

export function jobHasCleanerBlockingDeletion(
  assignments: Array<Pick<JobAssignment, "jobId" | "status">>,
  jobId: string,
): boolean {
  return assignments.some((item) => item.jobId === jobId && assignmentBlocksCleaningDeletion(item.status));
}

export const CLEANING_DELETE_BLOCKED_MESSAGE =
  "Remove confirmed cleaners from this cleaning before deleting it.";

export function isCleanerAllowedCrewSize(maxHelperCount: number, crewSize: number): boolean {
  if (!Number.isInteger(crewSize) || crewSize < 1) return false;
  return crewSize <= maxCrewSize(maxHelperCount);
}

export function validateRequestedCrewSize(input: {
  maxHelperCount: number;
  requestedCrewSize: number;
  remainingHeadcount: number;
}): Result<{ ok: true }> {
  if (!Number.isInteger(input.requestedCrewSize) || input.requestedCrewSize < 1) {
    return { ok: false, message: "Choose how many people from your crew can attend." };
  }
  const ceiling = maxCrewSize(input.maxHelperCount);
  if (input.requestedCrewSize > ceiling) {
    return {
      ok: false,
      message: ceiling === 1 ? "You can only attend on your own for this job." : `Your approved crew size is ${ceiling}.`,
    };
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

export type AssignmentTiming = {
  serviceDate: string;
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  expectedDurationMinutes: number;
};

/** Active cleaning time: from arrival window start through expected duration. */
export function calculateLaborRange(input: AssignmentTiming): { startUtc: Date; endUtc: Date } {
  const startUtc = zonedToUtc(input.serviceDate, input.arrivalWindowStart);
  const endUtc = new Date(startUtc.getTime() + input.expectedDurationMinutes * 60_000);
  return { startUtc, endUtc };
}

export function confirmedScheduleConflictReason(firstName: string): string {
  return `This conflicts with another confirmed job for ${firstName}.`;
}

export function isConfirmedScheduleConflictReason(reason?: string): boolean {
  return reason?.includes("conflicts with another confirmed job") ?? false;
}

export function detectConfirmedAssignmentConflict(input: {
  cleanerId: string;
  candidate: AssignmentTiming;
  confirmedAssignments: AssignmentSchedule[];
  ignoreAssignmentId?: string;
}): AssignmentSchedule | null {
  const candidateLabor = calculateLaborRange(input.candidate);
  for (const assignment of input.confirmedAssignments) {
    if (assignment.cleanerId !== input.cleanerId) continue;
    if (assignment.status !== "CONFIRMED") continue;
    if (assignment.assignmentId === input.ignoreAssignmentId) continue;
    const otherLabor = calculateLaborRange(assignmentTiming(assignment));
    if (
      rangesOverlap(
        candidateLabor.startUtc,
        candidateLabor.endUtc,
        otherLabor.startUtc,
        otherLabor.endUtc,
      )
    ) {
      return assignment;
    }
  }
  return null;
}

function assignmentTiming(assignment: AssignmentSchedule): AssignmentTiming {
  return {
    serviceDate: assignment.serviceDate,
    arrivalWindowStart: assignment.arrivalWindowStart,
    arrivalWindowEnd: assignment.arrivalWindowEnd,
    expectedDurationMinutes: assignment.expectedDurationMinutes,
  };
}

function assignmentBlockedInput(assignment: AssignmentSchedule) {
  const timing = assignmentTiming(assignment);
  return { date: timing.serviceDate, ...timing };
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
  confirmedAssignments?: AssignmentSchedule[];
}): Result<{ ok: true }> {
  void input.confirmedAssignments;
  return validateAvailabilityWindows(input.newWindows);
}

export function assignmentUncoveredByAvailability(
  assignment: AssignmentSchedule,
  windows: ScheduleWindow[],
): boolean {
  if (assignment.status !== "CONFIRMED") return false;
  const blocked = calculateBlockedRange(assignmentBlockedInput(assignment));
  return !availabilityCoversBlockedRange(windows, blocked);
}

export function subtractConfirmedBookingsFromAvailability(
  windows: ScheduleWindow[],
  confirmedAssignments: AssignmentSchedule[],
): ScheduleWindow[] {
  const blocks = confirmedAssignments
    .filter((assignment) => assignment.status === "CONFIRMED")
    .flatMap((assignment) => calculateBlockedRange(assignmentBlockedInput(assignment)).spans);
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
  timing: AssignmentTiming;
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
    candidate: input.timing,
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
      candidate: {
        serviceDate: input.required.date,
        arrivalWindowStart: input.required.arrivalWindowStart,
        arrivalWindowEnd: input.required.arrivalWindowEnd,
        expectedDurationMinutes: input.required.expectedDurationMinutes,
      },
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

/** Flags or clears schedule-conflict warnings without blocking admin saves. */
export function applyScheduleConflictWarning(
  assignment: JobAssignment,
  cleaner: Pick<CleanerProfile, "cleanerId" | "firstName">,
  assignments: JobAssignment[],
): JobAssignment {
  const conflict = detectConfirmedAssignmentConflict({
    cleanerId: cleaner.cleanerId,
    candidate: {
      serviceDate: assignment.serviceDate,
      arrivalWindowStart: assignment.arrivalWindowStart,
      arrivalWindowEnd: assignment.arrivalWindowEnd,
      expectedDurationMinutes: assignment.expectedDurationMinutes,
    },
    confirmedAssignments: assignments.filter((item) => item.status === "CONFIRMED").map(toAssignmentSchedule),
    ignoreAssignmentId: assignment.assignmentId,
  });
  if (conflict) {
    return {
      ...assignment,
      status: "NEEDS_ATTENTION",
      attentionReason: confirmedScheduleConflictReason(cleaner.firstName),
      confirmedCrewSize: undefined,
      confirmedTotalPayCents: undefined,
      pendingCrewSize: undefined,
    };
  }
  if (assignment.status === "NEEDS_ATTENTION" && isConfirmedScheduleConflictReason(assignment.attentionReason)) {
    const crewSize = assignment.proposedCrewSize;
    const confirmedTotalPayCents = confirmedCompensationCents({
      payType: assignment.payType,
      payPerPersonCents: assignment.payPerPersonCents,
      confirmedCrewSize: crewSize,
    });
    return {
      ...assignment,
      status: "CONFIRMED",
      attentionReason: undefined,
      availabilityConflictWeekStart: undefined,
      confirmedCrewSize: crewSize,
      confirmedTotalPayCents,
      respondedAt: assignment.respondedAt ?? assignment.updatedAt,
    };
  }
  return assignment;
}

/** Recompute schedule-conflict flags after other assignments change (clears stale NEEDS_ATTENTION). */
export function reconcileScheduleConflictWarnings(
  assignments: JobAssignment[],
  cleaners: Pick<CleanerProfile, "cleanerId" | "firstName">[],
): JobAssignment[] {
  const cleanerById = new Map(cleaners.map((cleaner) => [cleaner.cleanerId, cleaner]));
  let current = assignments;
  const maxPasses = Math.max(1, current.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    const next = current.map((assignment) => assignment);
    for (let index = 0; index < next.length; index += 1) {
      const assignment = next[index];
      const cleaner = cleanerById.get(assignment.cleanerId);
      if (!cleaner) continue;
      const shouldReconcile =
        assignment.status === "CONFIRMED" ||
        (assignment.status === "NEEDS_ATTENTION" && isConfirmedScheduleConflictReason(assignment.attentionReason));
      if (!shouldReconcile) continue;
      const updated = applyScheduleConflictWarning(assignment, cleaner, next);
      if (
        updated.status !== assignment.status ||
        updated.attentionReason !== assignment.attentionReason ||
        updated.confirmedCrewSize !== assignment.confirmedCrewSize ||
        updated.confirmedTotalPayCents !== assignment.confirmedTotalPayCents
      ) {
        next[index] = updated;
        changed = true;
      }
    }
    current = next;
    if (!changed) break;
  }
  return current;
}

export function windowsForCleaner(
  windows: AvailabilityWindow[],
  cleanerId: string,
): ScheduleWindow[] {
  return windows
    .filter((window) => window.cleanerId === cleanerId)
    .map((window) => ({ date: window.date, start: window.start, end: window.end }));
}
