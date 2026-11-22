import { calendarImportWithdrawnGhostSuperseded } from "../domain/calendar-import.ts";
import type { CalendarImport } from "../domain/types.ts";
import { seenGoogleEventIdsContains } from "./calendar-import-sync-side-effects.ts";
import type { HubData } from "../mock/seed.ts";

export const CALENDAR_IMPORT_SUPERSEDED_REASON = "Superseded by live Gmail link";

const USER_DISMISSED_SYNC_REASON = "Dismissed after sync removal";

/** Admin dismissed but status stayed WITHDRAWN (sync touched the row) — treat as REJECTED. */
export function normalizeDismissedCalendarImportRow(row: CalendarImport, now: string): CalendarImport {
  if (
    (row.status === "WITHDRAWN" || row.status === "CALENDAR_CANCELED") &&
    row.rejectedReason?.trim() === USER_DISMISSED_SYNC_REASON
  ) {
    return {
      ...row,
      status: "REJECTED",
      updatedAt: now,
      lastSyncedAt: now,
    };
  }
  return row;
}

function ghostRowSupersededOnSync(
  hub: HubData,
  row: CalendarImport,
  imports: CalendarImport[],
  seenGoogleEventIds: Set<string>,
): boolean {
  if (!calendarImportWithdrawnGhostSuperseded(hub, row, imports)) return false;
  const live = imports.find(
    (other) =>
      other.status === "APPROVED" &&
      other.serviceDate === row.serviceDate &&
      other.suggestedCustomerId?.trim() === row.suggestedCustomerId?.trim() &&
      seenGoogleEventIdsContains(seenGoogleEventIds, other.googleCalendarEventId),
  );
  return Boolean(live);
}

/**
 * Old event-id staging rows (WITHDRAWN / CALENDAR_CANCELED) after Gmail delete-recreate should not
 * keep reappearing once a live APPROVED import exists for the same customer + service date.
 */
export function retireCalendarImportGhostsForLiveApprovals(
  hub: HubData,
  imports: CalendarImport[],
  seenGoogleEventIds: Set<string>,
  now: string,
): { imports: CalendarImport[]; retired: number } {
  let retired = 0;
  const next = imports.map((row) => {
    let normalized = normalizeDismissedCalendarImportRow(row, now);
    if (normalized.status === "REJECTED" && row.status !== "REJECTED") {
      retired += 1;
      row = normalized;
    }
    if (row.status === "APPROVED") return row;
    if (row.status === "REJECTED") return row;
    if (!ghostRowSupersededOnSync(hub, row, imports, seenGoogleEventIds)) return row;
    retired += 1;
    return {
      ...row,
      status: "REJECTED" as const,
      rejectedReason: CALENDAR_IMPORT_SUPERSEDED_REASON,
      updatedAt: now,
      lastSyncedAt: now,
    };
  });
  return { imports: next, retired };
}