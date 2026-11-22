import { findCalendarImportByGoogleEventId } from "../data/calendar-import-queries.ts";
import { readCalendarImport } from "../data/items.ts";
import { isValidDate, zonedToUtc } from "../domain/time.ts";
import type { GoogleCalendarEvent } from "../services/google-calendar-client.ts";
import {
  getGoogleCalendarEvent,
  listGoogleCalendarEventsInRange,
} from "../services/google-calendar-client.ts";
import {
  googleCalendarEventIdsMatch,
  normalizeGoogleCalendarEventId,
} from "./google-calendar-event-match.ts";
import type { SyncLinkGcalEventSnapshot } from "./calendar-sync-link.ts";

function eventFromImportRow(row: ReturnType<typeof readCalendarImport>): GoogleCalendarEvent | null {
  const id = row.googleCalendarEventId?.trim();
  if (!id) return null;
  const startTime = row.arrivalWindowStart?.trim() || "09:00";
  let startIso: string;
  try {
    startIso = zonedToUtc(row.serviceDate, startTime).toISOString();
  } catch {
    return null;
  }
  const endIso = zonedToUtc(row.serviceDate, row.arrivalWindowEnd?.trim() || startTime).toISOString();
  return {
    id,
    summary: row.raw.title || "Calendar event",
    description: row.raw.description,
    location: row.raw.location,
    htmlLink: row.raw.htmlLink,
    iCalUID: row.googleCalendarIcalUid,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
  };
}

function findInListedEvents(events: GoogleCalendarEvent[], targetId: string): GoogleCalendarEvent | undefined {
  return events.find((item) => googleCalendarEventIdsMatch(item.id, targetId));
}

export type SyncLinkGcalFallback = {
  serviceDate?: string;
  title?: string;
};

/** Event payload returned from the link UI (server actions may omit `id` on round-trip — use request id). */
export function coalesceGcalEventSnapshot(
  snapshot: SyncLinkGcalEventSnapshot | null | undefined,
  targetId: string,
  fallback?: SyncLinkGcalFallback,
): GoogleCalendarEvent | null {
  const id = normalizeGoogleCalendarEventId(snapshot?.id ?? targetId);
  if (!googleCalendarEventIdsMatch(id, targetId)) return null;

  const timeZone = snapshot?.start?.timeZone ?? snapshot?.end?.timeZone ?? "America/Los_Angeles";
  let startIso = snapshot?.start?.dateTime;
  let endIso = snapshot?.end?.dateTime;
  const serviceDate = fallback?.serviceDate?.trim();
  if (!startIso && serviceDate && isValidDate(serviceDate)) {
    startIso = zonedToUtc(serviceDate, "09:00").toISOString();
  }
  if (!endIso && startIso) {
    endIso = snapshot?.end?.dateTime ?? new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
  }
  if (!startIso || !endIso) return null;

  return {
    id,
    summary: snapshot?.summary ?? fallback?.title ?? "Calendar event",
    description: snapshot?.description ?? "",
    location: snapshot?.location ?? "",
    htmlLink: snapshot?.htmlLink,
    iCalUID: snapshot?.iCalUID,
    status: snapshot?.status,
    attendees: snapshot?.attendees,
    start: { dateTime: startIso, timeZone },
    end: { dateTime: endIso, timeZone: snapshot?.end?.timeZone ?? timeZone },
  };
}

/** Resolve a Gmail event for linking (snapshot → list window → get by id → Dynamo import row). */
export async function resolveGoogleCalendarEventForLink(
  googleCalendarEventId: string,
  timeMinIso: string,
  timeMaxIso: string,
  snapshot?: SyncLinkGcalEventSnapshot | null,
  fallback?: SyncLinkGcalFallback,
): Promise<GoogleCalendarEvent | null> {
  const targetId = normalizeGoogleCalendarEventId(googleCalendarEventId);
  if (!targetId) return null;

  const fromSnapshot = coalesceGcalEventSnapshot(snapshot, targetId, fallback);
  if (fromSnapshot) return fromSnapshot;

  if (fallback?.serviceDate && isValidDate(fallback.serviceDate)) {
    const minimal = coalesceGcalEventSnapshot(null, targetId, fallback);
    if (minimal) return minimal;
  }

  const listed = await listGoogleCalendarEventsInRange({ timeMinIso, timeMaxIso });
  const fromList = findInListedEvents(listed, targetId);
  if (fromList) return fromList;

  const fetched = await getGoogleCalendarEvent(targetId);
  if (fetched) return fetched;

  const importItem = await findCalendarImportByGoogleEventId(targetId);
  if (!importItem) return null;
  return eventFromImportRow(readCalendarImport(importItem));
}