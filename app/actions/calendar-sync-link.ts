"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import {
  buildSyncLinkWorkspace,
  type SyncLinkGcalEventSnapshot,
  type SyncLinkWorkspace,
} from "@/lib/calendar/calendar-sync-link";
import {
  resolveGoogleCalendarEventForLink,
  type SyncLinkGcalFallback,
} from "@/lib/calendar/resolve-google-calendar-event";
import { CALENDAR_IMPORT_HORIZON_DAYS } from "@/lib/domain/calendar-import";
import { addDays, todayInBusinessZone, zonedToUtc } from "@/lib/domain/time";
import { queryApprovedCalendarImportsInRange } from "@/lib/data/calendar-import-queries";
import { dynamoConfigured } from "@/lib/data/repository";
import { loadAdminHubJobPartitionSlice, loadAdminHubSlices } from "@/lib/data/load-admin-hub";
import { persistHubDiffMutation } from "@/lib/data/persist-hub-diff-mutation";
import { readCalendarImport } from "@/lib/data/items";
import { linkCalendarEventToJobOnHub } from "@/lib/hub/calendar-sync-link-mutations";
import type { HubData } from "@/lib/mock/seed";
import { googleCalendarImportConfigured, listGoogleCalendarEventsInRange } from "@/lib/services/google-calendar-client";
import type { CalendarImportActionResult } from "./calendar-import";

function mergeHubWithJobSlice(base: HubData, slice: HubData, jobId: string): HubData {
  const job = slice.jobs.find((item) => item.jobId === jobId);
  if (!job) return base;
  const hasJob = base.jobs.some((item) => item.jobId === jobId);
  const assignments = slice.assignments.filter((item) => item.jobId === jobId);
  return {
    ...base,
    jobs: hasJob ? base.jobs : [...base.jobs, job],
    assignments: [
      ...base.assignments.filter((item) => item.jobId !== jobId),
      ...assignments,
    ],
  };
}

async function loadHubForSyncLink(ensureJobId?: string): Promise<HubData> {
  const hub = await loadAdminHubSlices({ persistReconciliation: false });
  const today = hub.today || todayInBusinessZone();
  const end = addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
  const approvedItems = await queryApprovedCalendarImportsInRange(today, end);
  const approved = approvedItems.map((item) => readCalendarImport(item));
  const byId = new Map<string, (typeof hub.calendarImports)[number]>();
  for (const row of hub.calendarImports) byId.set(row.importId, row);
  for (const row of approved) byId.set(row.importId, row);
  let merged: HubData = { ...hub, calendarImports: [...byId.values()] };
  const jobId = ensureJobId?.trim();
  if (jobId && !merged.jobs.some((item) => item.jobId === jobId)) {
    const slice = await loadAdminHubJobPartitionSlice(jobId);
    merged = mergeHubWithJobSlice(merged, slice, jobId);
  }
  return merged;
}

export type LoadSyncLinkWorkspaceResult =
  | { ok: true; workspace: SyncLinkWorkspace }
  | { ok: false; message: string };

export async function loadSyncLinkWorkspaceAction(
  fuzzyDays = 0,
): Promise<LoadSyncLinkWorkspaceResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    if (!googleCalendarImportConfigured()) {
      return { ok: false, message: "Google Calendar import is not configured." };
    }
    const hub = await loadHubForSyncLink();
    const today = hub.today || todayInBusinessZone();
    const endDate = addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
    const timeMinIso = zonedToUtc(today, "00:00").toISOString();
    const timeMaxIso = zonedToUtc(addDays(endDate, 1), "00:00").toISOString();
    const events = await listGoogleCalendarEventsInRange({ timeMinIso, timeMaxIso });
    const workspace = buildSyncLinkWorkspace(hub, events, { fuzzyDays });
    return { ok: true, workspace };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("loadSyncLinkWorkspaceAction failed.", error);
    return { ok: false, message: "Could not load Gmail link suggestions." };
  }
}

export async function linkCalendarSyncAction(
  jobId: string,
  googleCalendarEventId: string,
  alignScheduleFromGmail = false,
  gcalEvent?: SyncLinkGcalEventSnapshot | null,
  fallback?: SyncLinkGcalFallback | null,
): Promise<CalendarImportActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    if (!googleCalendarImportConfigured()) {
      return { ok: false, message: "Google Calendar import is not configured." };
    }
    const hub = await loadHubForSyncLink(jobId);
    const today = hub.today || todayInBusinessZone();
    const endDate = addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
    const timeMinIso = zonedToUtc(today, "00:00").toISOString();
    const timeMaxIso = zonedToUtc(addDays(endDate, 1), "00:00").toISOString();
    const event = await resolveGoogleCalendarEventForLink(
      googleCalendarEventId,
      timeMinIso,
      timeMaxIso,
      gcalEvent,
      fallback ?? undefined,
    );
    if (!event) {
      return {
        ok: false,
        message:
          "Could not load that Gmail event. Tap Refresh from Gmail, then try Link again.",
      };
    }

    const saved = await persistHubDiffMutation(
      () => loadHubForSyncLink(jobId),
      (before) => {
        const outcome = linkCalendarEventToJobOnHub(before, event, {
          jobId,
          googleCalendarEventId,
          alignScheduleFromGmail,
        });
        if (!outcome.ok && outcome.message.includes("could not be found")) {
          const inSlice = before.jobs.some((item) => item.jobId === jobId);
          if (!inSlice) {
            return {
              ok: false,
              message:
                "That cleaning is not loaded in this admin session. Open the job from Schedule, then try Link again.",
            };
          }
        }
        return outcome;
      },
      "That cleaning could not be found.",
    );
    if (!saved.ok) return saved;
    return {
      ok: true,
      hub: saved.hub,
      remove: saved.remove,
      revision: saved.revision,
      message: saved.message,
      jobId,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("linkCalendarSyncAction failed.", error);
    return { ok: false, message: "Could not link this Gmail event." };
  }
}