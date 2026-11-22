import {
  calendarImportDefaultServiceType,
  findExistingJobForCalendarImport,
  parseGoogleCalendarEvent,
} from "../domain/calendar-import.ts";
import type { CalendarImport } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";
import type { GoogleCalendarEvent } from "../services/google-calendar-client.ts";
import { rescheduleJobFromCalendarSync } from "../calendar/calendar-import-sync-side-effects.ts";

export type LinkCalendarSyncInput = {
  jobId: string;
  googleCalendarEventId: string;
  /** Move hub job date/arrival to match Gmail when they differ. */
  alignScheduleFromGmail?: boolean;
};

type MutationResult = { ok: true; hub: HubData; message: string } | { ok: false; message: string };

const ACTOR = "admin-sync-link";

function findImportByEventId(hub: HubData, eventId: string): CalendarImport | undefined {
  return hub.calendarImports.find((row) => row.googleCalendarEventId === eventId);
}

/** Attach an existing hub job to a Gmail calendar event (creates or upgrades import row to APPROVED). */
export function linkCalendarEventToJobOnHub(
  hub: HubData,
  event: GoogleCalendarEvent,
  input: LinkCalendarSyncInput,
): MutationResult {
  const eventId = input.googleCalendarEventId.trim();
  const jobId = input.jobId.trim();
  if (!eventId) return { ok: false, message: "Missing calendar event id." };

  const parsed = parseGoogleCalendarEvent(event);
  if (!parsed.ok) return { ok: false, message: `This calendar event cannot be linked (${parsed.reason}).` };

  const job = hub.jobs.find((item) => item.jobId === jobId);
  if (!job) return { ok: false, message: "That cleaning could not be found." };
  if (job.status === "CANCELED") return { ok: false, message: "Canceled cleanings cannot be linked." };

  const otherJob = hub.jobs.find(
    (item) => item.jobId !== jobId && item.googleCalendarEventId === eventId && item.status !== "CANCELED",
  );
  if (otherJob) {
    return { ok: false, message: "Another cleaning is already linked to this Gmail event." };
  }

  const approvedElsewhere = hub.calendarImports.find(
    (row) =>
      row.googleCalendarEventId === eventId &&
      row.status === "APPROVED" &&
      row.approvedJobId &&
      row.approvedJobId !== jobId,
  );
  if (approvedElsewhere) {
    const otherJob = hub.jobs.find(
      (item) => item.jobId === approvedElsewhere.approvedJobId && item.status !== "CANCELED",
    );
    if (otherJob) {
      return { ok: false, message: "This Gmail event is already approved on a different cleaning." };
    }
  }

  if (job.googleCalendarEventId && job.googleCalendarEventId !== eventId) {
    return { ok: false, message: "This cleaning is already linked to a different Gmail event." };
  }

  const duplicate = findExistingJobForCalendarImport(hub.jobs, hub.customers, hub.properties, {
    googleCalendarEventId: eventId,
    serviceDate: parsed.fields.serviceDate,
    suggestedCustomerId: job.customerId,
    suggestedPropertyId: job.propertyId,
    arrivalWindowStart: parsed.fields.arrivalWindowStart,
    arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
    parsed: parsed.fields.parsed,
  });
  if (duplicate && duplicate.jobId !== jobId) {
    return { ok: false, message: "Hub already has another cleaning for this customer on this Gmail date." };
  }

  const now = new Date().toISOString();
  const existing = findImportByEventId(hub, eventId);
  const importId =
    existing?.importId ??
    `calimp-${eventId.slice(0, 12)}-link-${Date.now().toString(36)}`;

  const linkedImport: CalendarImport = {
    importId,
    googleCalendarEventId: eventId,
    googleCalendarIcalUid: parsed.fields.googleCalendarIcalUid ?? existing?.googleCalendarIcalUid,
    status: "APPROVED",
    serviceDate: parsed.fields.serviceDate,
    arrivalWindowStart: parsed.fields.arrivalWindowStart ?? existing?.arrivalWindowStart,
    arrivalWindowEnd: parsed.fields.arrivalWindowEnd ?? existing?.arrivalWindowEnd,
    expectedDurationMinutes: existing?.expectedDurationMinutes ?? parsed.fields.expectedDurationMinutes,
    serviceType: calendarImportDefaultServiceType(
      parsed.fields.serviceType,
      job.customerId,
      hub.customers,
      hub.jobs,
    ),
    headcountNeeded: existing?.headcountNeeded ?? parsed.fields.headcountNeeded,
    specialInstructions: existing?.specialInstructions?.trim()
      ? existing.specialInstructions
      : parsed.fields.specialInstructions,
    pricePerVisitCents: existing?.pricePerVisitCents,
    marketId: parsed.fields.marketId,
    raw: parsed.fields.raw,
    parsed: parsed.fields.parsed,
    suggestedCustomerId: job.customerId,
    suggestedPropertyId: job.propertyId,
    matchedJobId: jobId,
    approvedJobId: jobId,
    rejectedReason: undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSyncedAt: now,
  };

  let nextHub: HubData = {
    ...hub,
    calendarImports: existing
      ? hub.calendarImports.map((row) => (row.importId === importId ? linkedImport : row))
      : [...hub.calendarImports, linkedImport],
    jobs: hub.jobs.map((item) =>
      item.jobId === jobId
        ? {
            ...item,
            googleCalendarEventId: eventId,
            updatedAt: now,
            updatedBy: ACTOR,
          }
        : item,
    ),
  };

  if (input.alignScheduleFromGmail) {
    const dateMoved = job.date !== parsed.fields.serviceDate;
    const arrivalMoved =
      (job.arrivalWindowStart ?? "") !== (parsed.fields.arrivalWindowStart ?? "") ||
      (job.arrivalWindowEnd ?? "") !== (parsed.fields.arrivalWindowEnd ?? "");
    if (dateMoved || arrivalMoved) {
      nextHub = rescheduleJobFromCalendarSync(nextHub, jobId, {
        date: parsed.fields.serviceDate,
        arrivalWindowStart: parsed.fields.arrivalWindowStart,
        arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
      });
    }
  }

  return {
    ok: true,
    hub: nextHub,
    message: input.alignScheduleFromGmail
      ? "Gmail event linked and schedule aligned."
      : "Gmail event linked to this cleaning.",
  };
}