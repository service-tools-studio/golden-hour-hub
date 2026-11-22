import {
  CALENDAR_IMPORT_HORIZON_DAYS,
  calendarEventIndicatesHubCancel,
  calendarEventIsExcludedFromImport,
  findExistingJobForCalendarImport,
  parseGoogleCalendarEvent,
  suggestCustomerForCalendarImport,
} from "../domain/calendar-import.ts";
import { addDays } from "../domain/time.ts";
import type { CalendarImport, Job } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";
import type { GoogleCalendarEvent } from "../services/google-calendar-client.ts";
import { googleCalendarEventIdsMatch } from "./google-calendar-event-match.ts";

export type SyncLinkGcalEventSnapshot = Pick<
  GoogleCalendarEvent,
  "status" | "summary" | "description" | "location" | "htmlLink" | "iCalUID" | "start" | "end" | "attendees"
> & {
  id?: string;
};

export type SyncLinkConfidence = "high" | "medium" | "low";

export type SyncLinkEventView = {
  googleCalendarEventId: string;
  title: string;
  serviceDate: string;
  arrivalLabel: string;
  importId?: string;
  importStatus?: CalendarImport["status"];
  linkedJobId?: string;
  gcalEvent: SyncLinkGcalEventSnapshot;
};

export type SyncLinkJobView = {
  jobId: string;
  customerName: string;
  serviceDate: string;
  addressLine: string;
  googleCalendarEventId?: string;
};

export type SyncLinkSuggestion = {
  googleCalendarEventId: string;
  jobId: string;
  confidence: SyncLinkConfidence;
  reasons: string[];
  eventTitle: string;
  eventDate: string;
  jobCustomerName: string;
  jobDate: string;
  dateDeltaDays: number;
  /** Gmail payload from the refresh that built this suggestion (used when linking without a second list). */
  gcalEvent: SyncLinkGcalEventSnapshot;
};

export type SyncLinkWorkspace = {
  fetchedEvents: number;
  suggestions: SyncLinkSuggestion[];
  unlinkedEvents: SyncLinkEventView[];
  unlinkedJobs: SyncLinkJobView[];
  linkedPairs: number;
  horizonEnd: string;
};

function jobAddressLine(job: Job): string {
  const s = job.snapshot;
  const parts = [s.streetAddress, s.unit, s.city].filter(Boolean);
  return parts.join(", ");
}

function arrivalLabel(start?: string, end?: string): string {
  if (!start?.trim()) return "Time TBD";
  if (end && end !== start) return `${start}–${end}`;
  return start;
}

function pickGcalSnapshot(event: GoogleCalendarEvent): SyncLinkGcalEventSnapshot {
  return {
    id: event.id,
    status: event.status,
    summary: event.summary,
    description: event.description,
    location: event.location,
    htmlLink: event.htmlLink,
    iCalUID: event.iCalUID,
    start: event.start,
    end: event.end,
    attendees: event.attendees,
  };
}

function activeJobId(hub: HubData, jobId: string | undefined): string | undefined {
  const trimmed = jobId?.trim();
  if (!trimmed) return undefined;
  const job = hub.jobs.find((item) => item.jobId === trimmed && item.status !== "CANCELED");
  return job?.jobId;
}

function linkedJobIdForEvent(
  hub: HubData,
  eventId: string,
  imports: CalendarImport[],
): string | undefined {
  const byJob = hub.jobs.find(
    (job) => googleCalendarEventIdsMatch(job.googleCalendarEventId, eventId) && job.status !== "CANCELED",
  );
  if (byJob) return byJob.jobId;
  const approved = imports.find(
    (row) =>
      googleCalendarEventIdsMatch(row.googleCalendarEventId, eventId) &&
      row.status === "APPROVED" &&
      row.approvedJobId,
  );
  return activeJobId(hub, approved?.approvedJobId);
}

function findJobMatchesForEvent(
  hub: HubData,
  eventId: string,
  serviceDate: string,
  arrivalWindowStart: string | undefined,
  arrivalWindowEnd: string | undefined,
  parsed: CalendarImport["parsed"],
  suggestedCustomerId: string | undefined,
  suggestedPropertyId: string | undefined,
  fuzzyDays: number,
): Array<{ job: Job; dateDeltaDays: number }> {
  const matches: Array<{ job: Job; dateDeltaDays: number }> = [];
  const seen = new Set<string>();
  for (let delta = -fuzzyDays; delta <= fuzzyDays; delta++) {
    const date = addDays(serviceDate, delta);
    const job = findExistingJobForCalendarImport(hub.jobs, hub.customers, hub.properties, {
      googleCalendarEventId: eventId,
      serviceDate: date,
      suggestedCustomerId,
      suggestedPropertyId,
      arrivalWindowStart,
      arrivalWindowEnd,
      parsed,
    });
    if (!job || seen.has(job.jobId)) continue;
    seen.add(job.jobId);
    matches.push({ job, dateDeltaDays: delta });
  }
  return matches;
}

function scoreSuggestion(
  match: { job: Job; dateDeltaDays: number },
  suggestedPropertyId: string | undefined,
): { confidence: SyncLinkConfidence; reasons: string[] } {
  const reasons: string[] = ["Customer matches Gmail event"];
  if (match.dateDeltaDays === 0) {
    reasons.push("Same visit date");
  } else {
    reasons.push(
      match.dateDeltaDays > 0
        ? `Hub job is ${match.dateDeltaDays} day(s) before Gmail`
        : `Hub job is ${-match.dateDeltaDays} day(s) after Gmail`,
    );
  }
  if (suggestedPropertyId && match.job.propertyId === suggestedPropertyId) {
    reasons.push("Property matches");
    return { confidence: match.dateDeltaDays === 0 ? "high" : "medium", reasons };
  }
  if (match.dateDeltaDays === 0) return { confidence: "medium", reasons };
  return { confidence: "low", reasons };
}

/** Compare Gmail events to hub jobs/imports for the link review UI. */
export function buildSyncLinkWorkspace(
  hub: HubData,
  events: GoogleCalendarEvent[],
  options: { fuzzyDays?: number } = {},
): SyncLinkWorkspace {
  const fuzzyDays = Math.min(Math.max(options.fuzzyDays ?? 0, 0), 14);
  const today = hub.today;
  const horizonEnd = addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
  const imports = hub.calendarImports;

  let linkedPairs = 0;
  const suggestions: SyncLinkSuggestion[] = [];
  const unlinkedEvents: SyncLinkEventView[] = [];
  const suggestionKeys = new Set<string>();

  for (const event of events) {
    const eventId = event.id?.trim();
    if (!eventId) continue;
    if (calendarEventIndicatesHubCancel(event) || calendarEventIsExcludedFromImport(event)) continue;
    const parsed = parseGoogleCalendarEvent(event);
    if (!parsed.ok) continue;

    const linkedJobId = linkedJobIdForEvent(hub, eventId, imports);
    const importRow = imports.find((row) => googleCalendarEventIdsMatch(row.googleCalendarEventId, eventId));

    if (linkedJobId) {
      linkedPairs += 1;
      continue;
    }

    const suggestionsForCustomer = suggestCustomerForCalendarImport(
      hub.customers,
      parsed.fields.parsed,
      hub.properties,
    );
    const customerId = importRow?.suggestedCustomerId ?? suggestionsForCustomer.customerId;
    const propertyId = importRow?.suggestedPropertyId ?? suggestionsForCustomer.propertyId;

    const matches = findJobMatchesForEvent(
      hub,
      eventId,
      parsed.fields.serviceDate,
      parsed.fields.arrivalWindowStart,
      parsed.fields.arrivalWindowEnd,
      parsed.fields.parsed,
      customerId,
      propertyId,
      fuzzyDays,
    );

    if (matches.length === 1) {
      const match = matches[0]!;
      const { confidence, reasons } = scoreSuggestion(match, propertyId);
      const key = `${eventId}|${match.job.jobId}`;
      if (!suggestionKeys.has(key)) {
        suggestionKeys.add(key);
        suggestions.push({
          googleCalendarEventId: eventId,
          jobId: match.job.jobId,
          confidence,
          reasons,
          eventTitle: parsed.fields.raw.title,
          eventDate: parsed.fields.serviceDate,
          jobCustomerName: match.job.snapshot.customerDisplayName,
          jobDate: match.job.date,
          dateDeltaDays: match.dateDeltaDays,
          gcalEvent: pickGcalSnapshot(event),
        });
      }
    }

    unlinkedEvents.push({
      googleCalendarEventId: eventId,
      title: parsed.fields.raw.title,
      serviceDate: parsed.fields.serviceDate,
      arrivalLabel: arrivalLabel(parsed.fields.arrivalWindowStart, parsed.fields.arrivalWindowEnd),
      importId: importRow?.importId,
      importStatus: importRow?.status,
      gcalEvent: pickGcalSnapshot(event),
    });
  }

  suggestions.sort(
    (a, b) =>
      confidenceRank(a.confidence) - confidenceRank(b.confidence) ||
      a.eventDate.localeCompare(b.eventDate),
  );

  const unlinkedJobs: SyncLinkJobView[] = hub.jobs
    .filter(
      (job) =>
        job.status !== "CANCELED" &&
        !job.googleCalendarEventId?.trim() &&
        job.date >= today &&
        job.date <= horizonEnd,
    )
    .map((job) => ({
      jobId: job.jobId,
      customerName: job.snapshot.customerDisplayName,
      serviceDate: job.date,
      addressLine: jobAddressLine(job),
    }))
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.customerName.localeCompare(b.customerName));

  return {
    fetchedEvents: events.length,
    suggestions,
    unlinkedEvents,
    unlinkedJobs,
    linkedPairs,
    horizonEnd,
  };
}

function confidenceRank(level: SyncLinkConfidence): number {
  switch (level) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}