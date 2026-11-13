import { addDays, todayInBusinessZone } from "../../lib/domain/time.ts";

/** Matches scripts/seed-e2e.ts job + availability dates. */
export const e2eJobDate = addDays(todayInBusinessZone(), 1);

/** Future date for flow tests (create customer → book → schedule). */
export const e2eFutureJobDate = addDays(todayInBusinessZone(), 7);

/** Spread staffing specs so Ada is not double-booked at the same clock time. Keep in sync with `scripts/seed-e2e.ts` availability. */
export const e2eStaffingDayOffsets = {
  Invite: 7,
  Decline: 8,
  Accept: 9,
  Direct: 10,
} as const;

export type E2eStaffingPrefix = keyof typeof e2eStaffingDayOffsets;

export function e2eStaffingCleaningDate(prefix: E2eStaffingPrefix | string): string {
  const offset = e2eStaffingDayOffsets[prefix as E2eStaffingPrefix];
  if (offset === undefined) return e2eFutureJobDate;
  return addDays(todayInBusinessZone(), offset);
}

/** Staggered arrival starts (24h) on the staffing edit form — avoids overlap if dates ever align. */
export const e2eStaffingArrivalStart: Record<E2eStaffingPrefix, string> = {
  Invite: "09:00",
  Decline: "10:00",
  Accept: "11:00",
  Direct: "12:00",
};
