import { findExistingJobForCalendarImport } from "../domain/calendar-import.ts";
import { validateOptionalVisitArrival } from "../domain/arrival.ts";
import { snapshotVisit } from "../domain/customers.ts";
import { validateOptionalDurationMinutes } from "../domain/duration.ts";
import { isValidDate } from "../domain/time.ts";
import type { CalendarImport, Job, ServiceType } from "../domain/types.ts";
import { createJobOnHub, type CreateJobInput } from "./create-job-mutations.ts";
import type { HubData } from "../mock/seed.ts";

export type UpdateCalendarImportInput = {
  importId: string;
  serviceDate: string;
  arrivalWindowStart?: string;
  arrivalWindowEnd?: string;
  expectedDurationMinutes?: number;
  serviceType: ServiceType;
  headcountNeeded: number;
  specialInstructions: string;
  pricePerVisitCents?: number;
  suggestedCustomerId?: string;
  suggestedPropertyId?: string;
};

export type ApproveCalendarImportInput = UpdateCalendarImportInput & {
  customerId: string;
  propertyId: string;
};

type MutationResult = { ok: true; hub: HubData; message: string; jobId?: string } | { ok: false; message: string };

const ACTOR = "kelsey";

function findImport(hub: HubData, importId: string): CalendarImport | undefined {
  return hub.calendarImports.find((item) => item.importId === importId);
}

export function updateCalendarImportOnHub(hub: HubData, input: UpdateCalendarImportInput): MutationResult {
  const row = findImport(hub, input.importId);
  if (!row) return { ok: false, message: "That import could not be found." };
  if (row.status !== "PENDING_REVIEW") return { ok: false, message: "That import was already handled." };
  if (!isValidDate(input.serviceDate)) return { ok: false, message: "Choose a valid date." };
  const arrival = validateOptionalVisitArrival(input.arrivalWindowStart, input.arrivalWindowEnd);
  if (!arrival.ok) return arrival;
  const duration = validateOptionalDurationMinutes(input.expectedDurationMinutes);
  if (!duration.ok) return { ok: false, message: duration.message };
  if (!Number.isInteger(input.headcountNeeded) || input.headcountNeeded < 0 || input.headcountNeeded > 12) {
    return { ok: false, message: "Enter how many cleaners are needed." };
  }
  const now = new Date().toISOString();
  const next: CalendarImport = {
    ...row,
    serviceDate: input.serviceDate,
    arrivalWindowStart: arrival.arrivalWindowStart,
    arrivalWindowEnd: arrival.arrivalWindowEnd,
    expectedDurationMinutes: duration.expectedDurationMinutes,
    serviceType: input.serviceType,
    headcountNeeded: input.headcountNeeded,
    specialInstructions: input.specialInstructions.trim(),
    pricePerVisitCents: input.pricePerVisitCents,
    suggestedCustomerId: input.suggestedCustomerId,
    suggestedPropertyId: input.suggestedPropertyId,
    updatedAt: now,
    lastSyncedAt: now,
  };
  return {
    ok: true,
    hub: {
      ...hub,
      calendarImports: hub.calendarImports.map((item) => (item.importId === row.importId ? next : item)),
    },
    message: "Import updated.",
  };
}

export function dismissCalendarCanceledImportOnHub(hub: HubData, importId: string): MutationResult {
  const row = findImport(hub, importId);
  if (!row) return { ok: false, message: "That import could not be found." };
  if (row.status !== "CALENDAR_CANCELED") {
    return { ok: false, message: "That import was already handled." };
  }
  const now = new Date().toISOString();
  const next: CalendarImport = {
    ...row,
    status: "WITHDRAWN",
    updatedAt: now,
    lastSyncedAt: now,
  };
  return {
    ok: true,
    hub: {
      ...hub,
      calendarImports: hub.calendarImports.map((item) => (item.importId === row.importId ? next : item)),
    },
    message: "Canceled import dismissed.",
  };
}

export function markCalendarCanceledNotifiedOnHub(hub: HubData, importId: string): MutationResult {
  const row = findImport(hub, importId);
  if (!row) return { ok: false, message: "That import could not be found." };
  if (row.status !== "CALENDAR_CANCELED") {
    return { ok: false, message: "That import was already handled." };
  }
  const now = new Date().toISOString();
  const next: CalendarImport = {
    ...row,
    cleanerRemovalNotifiedAt: now,
    updatedAt: now,
    lastSyncedAt: now,
  };
  return {
    ok: true,
    hub: {
      ...hub,
      calendarImports: hub.calendarImports.map((item) => (item.importId === row.importId ? next : item)),
    },
    message: "Removal notices recorded.",
  };
}

export function reopenCalendarImportOnHub(hub: HubData, importId: string): MutationResult {
  const row = findImport(hub, importId);
  if (!row) return { ok: false, message: "That import could not be found." };
  if (row.status !== "REJECTED" && row.status !== "WITHDRAWN") {
    return { ok: false, message: "Only dismissed or sync-removed imports can be reopened." };
  }
  const eventId = row.googleCalendarEventId?.trim();
  if (eventId) {
    const clash = hub.calendarImports.find(
      (item) =>
        item.importId !== row.importId &&
        item.googleCalendarEventId === eventId &&
        (item.status === "PENDING_REVIEW" || item.status === "APPROVED"),
    );
    if (clash) {
      return {
        ok: false,
        message:
          clash.status === "PENDING_REVIEW"
            ? "This calendar event is already waiting for review."
            : "This calendar event was already approved.",
      };
    }
  }
  const removedBySync = row.status === "WITHDRAWN";
  const now = new Date().toISOString();
  const next: CalendarImport = {
    ...row,
    status: "PENDING_REVIEW",
    rejectedReason: undefined,
    updatedAt: now,
    lastSyncedAt: now,
  };
  return {
    ok: true,
    hub: {
      ...hub,
      calendarImports: hub.calendarImports.map((item) => (item.importId === row.importId ? next : item)),
    },
    message: removedBySync
      ? "Back in the review queue. Tap Check Gmail to refresh event details."
      : "Import returned to the review queue.",
  };
}

export function rejectCalendarImportOnHub(
  hub: HubData,
  importId: string,
  reason?: string,
): MutationResult {
  const row = findImport(hub, importId);
  if (!row) return { ok: false, message: "That import could not be found." };
  if (row.status !== "PENDING_REVIEW" && row.status !== "WITHDRAWN") {
    return { ok: false, message: "That import was already handled." };
  }
  const now = new Date().toISOString();
  const next: CalendarImport = {
    ...row,
    status: "REJECTED",
    rejectedReason: reason?.trim() || (row.status === "WITHDRAWN" ? "Dismissed after sync removal" : undefined),
    updatedAt: now,
    lastSyncedAt: now,
  };
  return {
    ok: true,
    hub: {
      ...hub,
      calendarImports: hub.calendarImports.map((item) => (item.importId === row.importId ? next : item)),
    },
    message: "Import dismissed.",
  };
}

export function approveCalendarImportOnHub(hub: HubData, input: ApproveCalendarImportInput): MutationResult {
  const row = findImport(hub, input.importId);
  if (!row) return { ok: false, message: "That import could not be found." };
  if (row.status !== "PENDING_REVIEW") return { ok: false, message: "That import was already handled." };
  const duplicateJob =
    row.matchedJobId ||
    findExistingJobForCalendarImport(hub.jobs, hub.customers, hub.properties, {
      googleCalendarEventId: row.googleCalendarEventId,
      serviceDate: row.serviceDate,
      suggestedCustomerId: row.suggestedCustomerId,
      suggestedPropertyId: row.suggestedPropertyId,
      parsed: row.parsed,
    })?.jobId;
  if (duplicateJob) {
    return { ok: false, message: "A cleaning is already scheduled for this calendar event." };
  }

  const draft = updateCalendarImportOnHub(hub, input);
  if (!draft.ok) return draft;
  const updated = draft.hub.calendarImports.find((item) => item.importId === input.importId);
  if (!updated) return { ok: false, message: "That import could not be found." };

  const createInput: CreateJobInput = {
    date: updated.serviceDate,
    customerId: input.customerId,
    propertyId: input.propertyId,
    serviceType: updated.serviceType,
    arrivalWindowStart: updated.arrivalWindowStart,
    arrivalWindowEnd: updated.arrivalWindowEnd,
    headcountNeeded: updated.headcountNeeded,
    expectedDurationMinutes: updated.expectedDurationMinutes,
    cleanerIds: [],
    specialInstructions: updated.specialInstructions,
    pricePerVisitCents: updated.pricePerVisitCents,
  };

  const created = createJobOnHub(draft.hub, createInput, ACTOR);
  if (!created.ok) return created;

  const now = new Date().toISOString();
  const createdJob = created.hub.jobs.find((job) => job.jobId === created.jobId);
  if (!createdJob) return { ok: false, message: "The cleaning could not be created." };
  const jobWithLink: Job = {
    ...createdJob,
    googleCalendarEventId: updated.googleCalendarEventId,
    updatedAt: now,
    updatedBy: ACTOR,
  };

  const approved: CalendarImport = {
    ...updated,
    status: "APPROVED",
    approvedJobId: created.jobId,
    updatedAt: now,
    lastSyncedAt: now,
  };

  return {
    ok: true,
    hub: {
      ...created.hub,
      jobs: created.hub.jobs.map((job) => (job.jobId === created.jobId ? jobWithLink : job)),
      calendarImports: created.hub.calendarImports.map((item) => (item.importId === row.importId ? approved : item)),
    },
    message: "Cleaning added to the schedule.",
    jobId: created.jobId,
  };
}