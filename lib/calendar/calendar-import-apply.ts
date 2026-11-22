import {
  calendarEventIndicatesHubCancel,
  calendarEventIsExcludedFromImport,
  calendarImportDefaultServiceType,
  calendarImportActiveJobForStrictEventLink,
  calendarImportLinkedJobId,
  calendarImportPreservedDurationMinutes,
  calendarImportRescheduleStaleImportRow,
  withdrawRescheduleGhostCalendarImportList,
  syncedCalendarImportSpecialInstructions,
  findExistingJobForCalendarImport,
  jobMatchesCalendarImportVisit,
  parseGoogleCalendarEvent,
  suggestCustomerForCalendarImport,
} from "../domain/calendar-import.ts";
import { readMarketId } from "../domain/markets.ts";
import type { MarketId } from "../domain/markets.ts";
import type { CalendarImport } from "../domain/types.ts";
import {
  calendarImportIdForGoogleEvent,
  calendarImportProfileKey,
  calendarImportsMatchingGoogleEvent,
  dedupeCalendarImportsByGoogleEventId,
  pickCanonicalCalendarImport,
} from "./calendar-import-canonical.ts";
import {
  queryCalendarImportItemsByGoogleEventId,
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
  importRowMissingFromGoogleShouldCancelJob,
  seenGoogleEventIdsContains,
  supplementSeenGoogleEventIdsFromLinkedJobs,
} from "./calendar-import-sync-side-effects.ts";
import { googleCalendarEventIdsMatch } from "./google-calendar-event-match.ts";
import { applyApprovedImportScheduleFromGoogle } from "./calendar-import-apply-reschedule.ts";

export type CalendarImportApplyResult = {
  created: number;
  /** One entry per new PENDING_REVIEW row (same order as sync created them). */
  createdMarketIds: MarketId[];
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
  const createdMarketIds: MarketId[] = [];
  let updated = 0;
  let jobsCanceled = 0;
  let jobsRescheduled = 0;
  let skipped = 0;
  let withdrawn = 0;
  let workingHub = hub;
  const nextImports = [...hub.calendarImports];
  const importExtraDeletes: string[] = [];
  const seenGoogleEventIds = new Set<string>();
  const today = hub.today;
  const horizonEnd = calendarImportSyncHorizonEnd(today);

  function sweepRescheduleGhostImports() {
    const swept = withdrawRescheduleGhostCalendarImportList(workingHub, nextImports, now);
    if (swept.withdrawn === 0) return;
    withdrawn += swept.withdrawn;
    nextImports.length = 0;
    nextImports.push(...swept.imports);
    workingHub = { ...workingHub, calendarImports: swept.imports };
  }

  function upsertImport(row: CalendarImport) {
    const index = nextImports.findIndex((item) => item.importId === row.importId);
    if (index === -1) nextImports.push(row);
    else nextImports[index] = row;
  }

  function applyImportDedupe() {
    const { imports: deduped, removedImportIds } = dedupeCalendarImportsByGoogleEventId(nextImports);
    if (removedImportIds.length === 0) return;
    importExtraDeletes.push(...removedImportIds);
    nextImports.length = 0;
    nextImports.push(...deduped);
    workingHub = { ...workingHub, calendarImports: deduped };
  }

  async function loadCanonicalCalendarImportForEvent(eventId: string): Promise<CalendarImport | null> {
    const items = await queryCalendarImportItemsByGoogleEventId(eventId);
    for (const item of items) {
      upsertImport(readCalendarImport(item));
    }
    applyImportDedupe();
    const matches = calendarImportsMatchingGoogleEvent(nextImports, eventId);
    return pickCanonicalCalendarImport(matches);
  }

  function withdrawStaleImportOnly(existing: CalendarImport) {
    if (existing.status === "WITHDRAWN") return;
    upsertImport(withdrawCalendarImportRow(existing, now));
    withdrawn += 1;
  }

  function withdrawLinkedImport(existing: CalendarImport) {
    const rescheduleStale = calendarImportRescheduleStaleImportRow(workingHub, existing);
    const jobId = rescheduleStale
      ? undefined
      : calendarImportActiveJobForStrictEventLink(workingHub, existing)?.jobId;
    if (existing.status === "WITHDRAWN" && !jobId) {
      return;
    }
    let notifyCleanerIds = existing.calendarCanceledNotifyCleanerIds;
    if (jobId && !rescheduleStale) {
      const freshIds = calendarCanceledCleanerIdsFromHub(workingHub, jobId);
      if (freshIds.length > 0) notifyCleanerIds = freshIds;
      workingHub = cancelJobFromCalendarSync(workingHub, jobId);
      jobsCanceled += 1;
    }
    const canceledOnCalendar = Boolean(jobId) && !rescheduleStale;
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
  applyImportDedupe();
  sweepRescheduleGhostImports();

  for (const event of events) {
    const eventId = event.id?.trim();
    if (!eventId) {
      skipped += 1;
      continue;
    }
    seenGoogleEventIds.add(eventId);

    if (calendarEventIndicatesHubCancel(event)) {
      const existing = await loadCanonicalCalendarImportForEvent(eventId);
      if (existing) {
        const activeJobId = calendarImportLinkedJobId(workingHub, existing);
        if (calendarImportShouldWithdrawFromGoogleSync(existing, activeJobId)) {
          withdrawLinkedImport(existing);
        }
      } else {
        const job = workingHub.jobs.find(
          (item) =>
            item.googleCalendarEventId &&
            googleCalendarEventIdsMatch(item.googleCalendarEventId, eventId) &&
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
      const existing = await loadCanonicalCalendarImportForEvent(eventId);
      if (existing) {
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

    const existing = await loadCanonicalCalendarImportForEvent(eventId);
    if (existing?.status === "REJECTED") {
      skipped += 1;
      continue;
    }

    if (existing?.status === "APPROVED") {
      const reschedule = applyApprovedImportScheduleFromGoogle(
        workingHub,
        existing,
        parsed.fields.serviceDate,
        parsed.fields.arrivalWindowStart,
        parsed.fields.arrivalWindowEnd,
      );
      workingHub = reschedule.hub;
      jobsRescheduled += reschedule.jobsRescheduled;
      const linkedJobId = calendarImportLinkedJobId(workingHub, existing);
      upsertImport({
        ...existing,
        serviceDate: parsed.fields.serviceDate,
        arrivalWindowStart: parsed.fields.arrivalWindowStart,
        arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
        raw: parsed.fields.raw,
        parsed: parsed.fields.parsed,
        approvedJobId: existing.approvedJobId ?? linkedJobId,
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
        arrivalWindowStart: parsed.fields.arrivalWindowStart,
        arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
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
      const staleMatched =
        existing.matchedJobId?.trim() &&
        workingHub.jobs.find((job) => job.jobId === existing.matchedJobId && job.status !== "CANCELED");
      const visitRow = {
        googleCalendarEventId: parsed.fields.googleCalendarEventId,
        serviceDate: parsed.fields.serviceDate,
        arrivalWindowStart: parsed.fields.arrivalWindowStart,
        arrivalWindowEnd: parsed.fields.arrivalWindowEnd,
        suggestedCustomerId,
        suggestedPropertyId: suggestions.propertyId ?? existing.suggestedPropertyId,
      };
      const preservedMatchedJobId =
        matchedJob?.jobId ??
        (staleMatched && jobMatchesCalendarImportVisit(staleMatched, visitRow) ? staleMatched.jobId : undefined);
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
        matchedJobId: preservedMatchedJobId,
        approvedJobId: existing.approvedJobId,
        status: "PENDING_REVIEW",
        updatedAt: now,
        lastSyncedAt: now,
      };
      upsertImport(next);
      updated += 1;
      continue;
    }

    const importId = calendarImportIdForGoogleEvent(eventId);
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
    createdMarketIds.push(readMarketId(row.marketId));
  }

  sweepRescheduleGhostImports();
  applyImportDedupe();

  await supplementSeenGoogleEventIdsFromLinkedJobs(workingHub, seenGoogleEventIds, today, horizonEnd);

  for (const row of nextImports) {
    if (row.status === "WITHDRAWN") continue;
    if (row.status === "PENDING_REVIEW") continue;
    if (!calendarImportMissingFromGoogleSync(row, seenGoogleEventIds, today, horizonEnd)) continue;
    const activeJobId = calendarImportLinkedJobId(workingHub, row);
    if (!calendarImportShouldWithdrawFromGoogleSync(row, activeJobId)) continue;
    if (importRowMissingFromGoogleShouldCancelJob(workingHub, row, seenGoogleEventIds)) {
      withdrawLinkedImport(row);
    } else {
      withdrawStaleImportOnly(row);
    }
  }

  for (const job of workingHub.jobs) {
    const eventId = job.googleCalendarEventId?.trim();
    if (!eventId || job.status === "CANCELED") continue;
    if (job.date < today || job.date > horizonEnd) continue;
    if (seenGoogleEventIdsContains(seenGoogleEventIds, eventId)) continue;

    workingHub = cancelJobFromCalendarSync(workingHub, job.jobId);
    jobsCanceled += 1;
  }

  const before = hub;
  const after = {
    ...workingHub,
    calendarImports: nextImports,
  };

  const plan = buildHubDiffPersistPlan(before, after);
  for (const importId of [...new Set(importExtraDeletes)]) {
    const key = calendarImportProfileKey(importId);
    if (!plan.deletes.some((item) => item.pk === key.pk && item.sk === key.sk)) {
      plan.deletes.push(key);
    }
  }
  if (plan.puts.length === 0 && plan.deletes.length === 0) {
    return {
      created,
      createdMarketIds,
      updated,
      withdrawn,
      jobsCanceled,
      jobsRescheduled,
      skipped,
      persisted: false,
    };
  }

  const revision = await readHubRevision();
  const saved = await writeHubItemChanges(plan, revision);
  if (!saved.ok) {
    return {
      created: 0,
      createdMarketIds: [],
      updated: 0,
      withdrawn: 0,
      jobsCanceled: 0,
      jobsRescheduled: 0,
      skipped,
      persisted: false,
      message: "Could not persist calendar imports.",
    };
  }

  return {
    created,
    createdMarketIds,
    updated,
    withdrawn,
    jobsCanceled,
    jobsRescheduled,
    skipped,
    persisted: true,
  };
}