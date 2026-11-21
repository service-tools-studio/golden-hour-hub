import {
  calendarEventIndicatesHubCancel,
  calendarEventIsExcludedFromImport,
  calendarImportDefaultServiceType,
  calendarImportLinkedJobId,
  calendarImportPreservedDurationMinutes,
  syncedCalendarImportSpecialInstructions,
  findExistingJobForCalendarImport,
  parseGoogleCalendarEvent,
  suggestCustomerForCalendarImport,
} from "../domain/calendar-import.ts";
import type { CalendarImport } from "../domain/types.ts";
import {
  findCalendarImportByGoogleEventId,
  queryCalendarImportsForSyncInRange,
} from "../data/calendar-import-queries.ts";
import { readCalendarImport } from "../data/items.ts";
import { buildHubDiffPersistPlan } from "../hub/hub-diff-persist-plan.ts";
import type { HubData } from "../mock/seed.ts";
import { readHubRevision, writeHubItemChanges } from "../data/repository.ts";
import type { GoogleCalendarEvent } from "../services/google-calendar-client.ts";
import {
  calendarCanceledCleanerIdsFromHub,
  calendarImportMissingFromGoogleSync,
  calendarImportShouldWithdrawFromGoogleSync,
  calendarImportSyncHorizonEnd,
  cancelJobFromCalendarSync,
  rescheduleJobFromCalendarSync,
} from "./calendar-import-sync-side-effects.ts";

export type CalendarImportApplyResult = {
  created: number;
  updated: number;
  withdrawn: number;
  jobsCanceled: number;
  jobsRescheduled: number;
  skipped: number;
  persisted: boolean;
  message?: string;
};

function withdrawCalendarImportRow(
  existing: CalendarImport,
  now: string,
  patch: Partial<CalendarImport> = {},
): CalendarImport {
  return {
    ...existing,
    status: "WITHDRAWN",
    updatedAt: now,
    lastSyncedAt: now,
    ...patch,
  };
}

/** Apply Google Calendar events to hub calendar_import rows and linked jobs. */
export async function applyCalendarEventsToHub(
  hub: HubData,
  events: GoogleCalendarEvent[],
): Promise<CalendarImportApplyResult> {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let withdrawn = 0;
  let jobsCanceled = 0;
  let jobsRescheduled = 0;
  let skipped = 0;
  let workingHub = hub;
  const nextImports = [...hub.calendarImports];
  const seenGoogleEventIds = new Set<string>();
  const today = hub.today;
  const horizonEnd = calendarImportSyncHorizonEnd(today);

  function upsertImport(row: CalendarImport) {
    const index = nextImports.findIndex((item) => item.importId === row.importId);
    if (index === -1) nextImports.push(row);
    else nextImports[index] = row;
  }

  function withdrawLinkedImport(existing: CalendarImport) {
    const jobId = calendarImportLinkedJobId(workingHub, existing);
    let notifyCleanerIds = existing.calendarCanceledNotifyCleanerIds;
    if (jobId) {
      const freshIds = calendarCanceledCleanerIdsFromHub(workingHub, jobId);
      if (freshIds.length > 0) notifyCleanerIds = freshIds;
      workingHub = cancelJobFromCalendarSync(workingHub, jobId);
      jobsCanceled += 1;
    }
    const canceledOnCalendar = Boolean(jobId);
    upsertImport(
      withdrawCalendarImportRow(existing, now, {
        status: canceledOnCalendar ? "CALENDAR_CANCELED" : "WITHDRAWN",
        approvedJobId: existing.approvedJobId ?? jobId,
        calendarCanceledNotifyCleanerIds: notifyCleanerIds,
      }),
    );
    withdrawn += 1;
  }

  const syncImportItems = await queryCalendarImportsForSyncInRange(today, horizonEnd);
  for (const item of syncImportItems) {
    upsertImport(readCalendarImport(item));
  }

  for (const event of events) {
    const eventId = event.id?.trim();
    if (!eventId) {
      skipped += 1;
      continue;
    }
    seenGoogleEventIds.add(eventId);

    if (calendarEventIndicatesHubCancel(event)) {
      const existingItem = await findCalendarImportByGoogleEventId(eventId);
      if (existingItem) {
        const existing = readCalendarImport(existingItem);
        const activeJobId = calendarImportLinkedJobId(workingHub, existing);
        if (calendarImportShouldWithdrawFromGoogleSync(existing, activeJobId)) {
          withdrawLinkedImport(existing);
        }
      } else {
        const job = workingHub.jobs.find(
          (item) =>
            item.googleCalendarEventId === eventId &&
            item.status !== "CANCELED" &&
            item.date >= today &&
            item.date <= horizonEnd,
        );
        if (job) {
          workingHub = cancelJobFromCalendarSync(workingHub, job.jobId);
          jobsCanceled += 1;
        }
      }
      continue;
    }

    if (calendarEventIsExcludedFromImport(event)) {
      const existingItem = await findCalendarImportByGoogleEventId(eventId);
      if (existingItem) {
        const existing = readCalendarImport(existingItem);
        const activeJobId = calendarImportLinkedJobId(workingHub, existing);
        if (calendarImportShouldWithdrawFromGoogleSync(existing, activeJobId)) {
          withdrawLinkedImport(existing);
        }
      }
      skipped += 1;
      continue;
    }

    const parsed = parseGoogleCalendarEvent(event);
    if (!parsed.ok) {
      skipped += 1;
      continue;
    }

    const existingItem = await findCalendarImportByGoogleEventId(eventId);
    const existing = existingItem ? readCalendarImport(existingItem) : null;
    if (existing?.status === "REJECTED") {
      skipped += 1;
      continue;
    }

    if (existing?.status === "APPROVED") {
      const dateMoved =
        existing.serviceDate !== parsed.fields.serviceDate ||
        existing.arrivalWindowStart !== parsed.fields.arrivalWindowStart ||
        existing.arrivalWindowEnd !== parsed.fields.arrivalWindowEnd;
      if (existing.approvedJobId && dateMoved) {
        workingHub = rescheduleJobFromCalendarSync(workingHub, existing.approvedJobId, {
          date: parsed.fields.serviceDate,
          arrivalWindowStart: parsed.fields.arrivalWindowStart,
          arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
        });
        jobsRescheduled += 1;
      }
      upsertImport({
        ...existing,
        serviceDate: parsed.fields.serviceDate,
        arrivalWindowStart: parsed.fields.arrivalWindowStart,
        arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
        raw: parsed.fields.raw,
        parsed: parsed.fields.parsed,
        lastSyncedAt: now,
        updatedAt: now,
      });
      updated += 1;
      continue;
    }

    const suggestions = suggestCustomerForCalendarImport(
      workingHub.customers,
      parsed.fields.parsed,
      workingHub.properties,
    );
    const matchedJob = findExistingJobForCalendarImport(
      workingHub.jobs,
      workingHub.customers,
      workingHub.properties,
      {
        googleCalendarEventId: eventId,
        serviceDate: parsed.fields.serviceDate,
        suggestedCustomerId: suggestions.customerId ?? existing?.suggestedCustomerId,
        suggestedPropertyId: suggestions.propertyId ?? existing?.suggestedPropertyId,
        parsed: parsed.fields.parsed,
      },
    );

    if (existing) {
      const {
        specialInstructions: _eventInstructions,
        expectedDurationMinutes: _eventDuration,
        ...syncedFields
      } = parsed.fields;
      const suggestedCustomerId = suggestions.customerId ?? existing.suggestedCustomerId;
      const next: CalendarImport = {
        ...existing,
        ...syncedFields,
        serviceType: calendarImportDefaultServiceType(
          syncedFields.serviceType,
          suggestedCustomerId,
          workingHub.customers,
          workingHub.jobs,
        ),
        specialInstructions: syncedCalendarImportSpecialInstructions(
          existing,
          parsed.fields.specialInstructions,
          event,
        ),
        expectedDurationMinutes: calendarImportPreservedDurationMinutes(existing, event),
        suggestedCustomerId,
        suggestedPropertyId: suggestions.propertyId ?? existing.suggestedPropertyId,
        matchedJobId: matchedJob?.jobId,
        status: "PENDING_REVIEW",
        updatedAt: now,
        lastSyncedAt: now,
      };
      upsertImport(next);
      updated += 1;
      continue;
    }

    const importId = `calimp-${eventId.slice(0, 12)}-${Date.now().toString(36)}`;
    const row: CalendarImport = {
      importId,
      ...parsed.fields,
      serviceType: calendarImportDefaultServiceType(
        parsed.fields.serviceType,
        suggestions.customerId,
        workingHub.customers,
        workingHub.jobs,
      ),
      status: "PENDING_REVIEW",
      suggestedCustomerId: suggestions.customerId,
      suggestedPropertyId: suggestions.propertyId,
      matchedJobId: matchedJob?.jobId,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
    };
    upsertImport(row);
    created += 1;
  }

  for (const row of nextImports) {
    if (!calendarImportMissingFromGoogleSync(row, seenGoogleEventIds, today, horizonEnd)) continue;
    const activeJobId = calendarImportLinkedJobId(workingHub, row);
    if (calendarImportShouldWithdrawFromGoogleSync(row, activeJobId)) {
      withdrawLinkedImport(row);
    }
  }

  for (const job of workingHub.jobs) {
    const eventId = job.googleCalendarEventId?.trim();
    if (!eventId || job.status === "CANCELED") continue;
    if (job.date < today || job.date > horizonEnd) continue;
    if (seenGoogleEventIds.has(eventId)) continue;

    const existingItem = await findCalendarImportByGoogleEventId(eventId);
    if (existingItem) {
      const existing = readCalendarImport(existingItem);
      const activeJobId = calendarImportLinkedJobId(workingHub, existing);
      if (calendarImportShouldWithdrawFromGoogleSync(existing, activeJobId)) {
        withdrawLinkedImport(existing);
      }
      continue;
    }

    const notifyIds = calendarCanceledCleanerIdsFromHub(workingHub, job.jobId);
    workingHub = cancelJobFromCalendarSync(workingHub, job.jobId);
    jobsCanceled += 1;
    if (notifyIds.length === 0) continue;
  }

  const before = hub;
  const after = {
    ...workingHub,
    calendarImports: nextImports,
  };

  const plan = buildHubDiffPersistPlan(before, after);
  if (plan.puts.length === 0) {
    return { created, updated, withdrawn, jobsCanceled, jobsRescheduled, skipped, persisted: false };
  }

  const revision = await readHubRevision();
  const saved = await writeHubItemChanges(plan, revision);
  if (!saved.ok) {
    return {
      created: 0,
      updated: 0,
      withdrawn: 0,
      jobsCanceled: 0,
      jobsRescheduled: 0,
      skipped,
      persisted: false,
      message: "Could not persist calendar imports.",
    };
  }

  return { created, updated, withdrawn, jobsCanceled, jobsRescheduled, skipped, persisted: true };
}