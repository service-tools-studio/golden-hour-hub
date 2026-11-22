import { createHash } from "node:crypto";
import { googleCalendarEventIdsMatch, normalizeGoogleCalendarEventId } from "./google-calendar-event-match.ts";
import type { CalendarImport } from "../domain/types.ts";

/** Stable import id for a Google event — one Dynamo row per calendar event id. */
export function calendarImportIdForGoogleEvent(googleCalendarEventId: string): string {
  const normalized = normalizeGoogleCalendarEventId(googleCalendarEventId);
  if (!normalized) throw new Error("Missing google calendar event id.");
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 24);
  return `calimp-gcal-${digest}`;
}

export function calendarImportProfileKey(importId: string): { pk: string; sk: string } {
  return { pk: `CAL_IMPORT#${importId.trim()}`, sk: "PROFILE" };
}

function calendarImportCanonicalStatusRank(status: CalendarImport["status"]): number {
  switch (status) {
    case "APPROVED":
      return 50;
    case "CALENDAR_CANCELED":
      return 40;
    case "PENDING_REVIEW":
      return 30;
    case "REJECTED":
      return 20;
    case "WITHDRAWN":
      return 10;
    default:
      return 0;
  }
}

function calendarImportCanonicalTieBreak(a: CalendarImport, b: CalendarImport): CalendarImport {
  const createdA = a.createdAt?.trim() ?? "";
  const createdB = b.createdAt?.trim() ?? "";
  if (createdA && createdB && createdA !== createdB) {
    return createdA <= createdB ? a : b;
  }
  return a.importId <= b.importId ? a : b;
}

/** Pick the single staging row that should represent this Gmail event. */
export function pickCanonicalCalendarImport(rows: CalendarImport[]): CalendarImport | null {
  const filtered = rows.filter((row) => normalizeGoogleCalendarEventId(row.googleCalendarEventId));
  if (filtered.length === 0) return null;
  return filtered.reduce((best, row) => {
    const rank = calendarImportCanonicalStatusRank(row.status);
    const bestRank = calendarImportCanonicalStatusRank(best.status);
    if (rank > bestRank) return row;
    if (rank < bestRank) return best;
    return calendarImportCanonicalTieBreak(row, best);
  });
}

/** Merge staging metadata from duplicate rows into the canonical import before dropping duplicates. */
export function mergeCalendarImportDuplicateFields(
  canonical: CalendarImport,
  other: CalendarImport,
): CalendarImport {
  return {
    ...canonical,
    approvedJobId: canonical.approvedJobId?.trim() || other.approvedJobId?.trim() || undefined,
    matchedJobId: canonical.matchedJobId?.trim() || other.matchedJobId?.trim() || undefined,
    suggestedCustomerId: canonical.suggestedCustomerId?.trim() || other.suggestedCustomerId?.trim() || undefined,
    suggestedPropertyId: canonical.suggestedPropertyId?.trim() || other.suggestedPropertyId?.trim() || undefined,
    googleCalendarIcalUid: canonical.googleCalendarIcalUid?.trim() || other.googleCalendarIcalUid?.trim() || undefined,
    cleanerRemovalNotifiedAt:
      canonical.cleanerRemovalNotifiedAt?.trim() || other.cleanerRemovalNotifiedAt?.trim() || undefined,
    calendarCanceledNotifyCleanerIds:
      (canonical.calendarCanceledNotifyCleanerIds?.length ?? 0) > 0
        ? canonical.calendarCanceledNotifyCleanerIds
        : other.calendarCanceledNotifyCleanerIds,
  };
}

export type CalendarImportDedupeResult = {
  imports: CalendarImport[];
  removedImportIds: string[];
};

/** Collapse multiple staging rows for the same Google event id into one canonical row. */
export function dedupeCalendarImportsByGoogleEventId(imports: CalendarImport[]): CalendarImportDedupeResult {
  const byEvent = new Map<string, CalendarImport[]>();
  const passthrough: CalendarImport[] = [];

  for (const row of imports) {
    const eventId = normalizeGoogleCalendarEventId(row.googleCalendarEventId);
    if (!eventId) {
      passthrough.push(row);
      continue;
    }
    let bucket = byEvent.get(eventId);
    if (!bucket) {
      bucket = [];
      byEvent.set(eventId, bucket);
    }
    bucket.push(row);
  }

  const removedImportIds: string[] = [];
  const merged: CalendarImport[] = [...passthrough];

  for (const [, group] of byEvent) {
    if (group.length === 1) {
      const row = group[0]!;
      const targetId = calendarImportIdForGoogleEvent(row.googleCalendarEventId);
      if (row.importId !== targetId) {
        removedImportIds.push(row.importId);
        merged.push({ ...row, importId: targetId });
      } else {
        merged.push(row);
      }
      continue;
    }
    const canonical = pickCanonicalCalendarImport(group);
    if (!canonical) continue;
    let next = canonical;
    for (const row of group) {
      if (row.importId === canonical.importId) continue;
      next = mergeCalendarImportDuplicateFields(next, row);
      removedImportIds.push(row.importId);
    }
    const targetId = calendarImportIdForGoogleEvent(next.googleCalendarEventId);
    if (next.importId !== targetId) {
      removedImportIds.push(next.importId);
      next = { ...next, importId: targetId };
    }
    merged.push(next);
  }

  return { imports: merged, removedImportIds: [...new Set(removedImportIds)] };
}

export function calendarImportsMatchingGoogleEvent(
  imports: CalendarImport[],
  googleCalendarEventId: string,
): CalendarImport[] {
  return imports.filter((row) => googleCalendarEventIdsMatch(row.googleCalendarEventId, googleCalendarEventId));
}