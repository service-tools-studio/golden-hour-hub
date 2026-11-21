"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { runCalendarImportCron } from "@/lib/calendar/calendar-import-cron";
import { calendarImportCustomerPrefillFromRow } from "@/lib/domain/calendar-import";
import type { CalendarImportParsedHints } from "@/lib/domain/types";
import { dynamoConfigured, readHubRevision } from "@/lib/data/repository";
import { loadAdminHubCalendarImportSlice, loadAdminHubSlices } from "@/lib/data/load-admin-hub";
import { googleCalendarImportConfigured } from "@/lib/services/google-calendar-client";
import { persistHubDiffMutation } from "@/lib/data/persist-hub-diff-mutation";
import {
  approveCalendarImportOnHub,
  dismissCalendarCanceledImportOnHub,
  markCalendarCanceledNotifiedOnHub,
  rejectCalendarImportOnHub,
  updateCalendarImportOnHub,
  type ApproveCalendarImportInput,
} from "@/lib/hub/calendar-import-mutations";
import type { HubData } from "@/lib/mock/seed";
import { hubMutationPatch, type HubPatchRemove } from "@/lib/hub/merge-hub-patch";

export type CalendarImportActionResult =
  | {
      ok: true;
      hub: HubData;
      remove?: HubPatchRemove;
      revision: number;
      message: string;
      jobId?: string;
    }
  | { ok: false; message: string };

function formatCalendarSyncMessage(result: Awaited<ReturnType<typeof runCalendarImportCron>>): string {
  if (!result.ran) return result.message ?? "Could not check Gmail Calendar.";
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} new`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.withdrawn > 0) parts.push(`${result.withdrawn} removed from calendar`);
  if (result.jobsCanceled > 0) parts.push(`${result.jobsCanceled} scheduled cleaning${result.jobsCanceled === 1 ? "" : "s"} canceled`);
  if (result.jobsRescheduled > 0) parts.push(`${result.jobsRescheduled} rescheduled on the schedule`);
  if (parts.length === 0) {
    return result.fetched > 0
      ? `Checked Gmail. ${result.fetched} events on the calendar, nothing new to review.`
      : "Checked Gmail. No upcoming events in the import window.";
  }
  return `Checked Gmail. ${parts.join(", ")}.`;
}

export async function syncCalendarImportsAction(): Promise<CalendarImportActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    if (!googleCalendarImportConfigured()) {
      return { ok: false, message: "Google Calendar import is not configured." };
    }
    const hub = await loadAdminHubSlices({ persistReconciliation: true });
    const result = await runCalendarImportCron(hub);
    if (!result.ran) {
      return { ok: false, message: formatCalendarSyncMessage(result) };
    }
    const after = await loadAdminHubSlices({ persistReconciliation: false });
    const { patch, remove } = hubMutationPatch(hub, after);
    const revision = await readHubRevision();
    return {
      ok: true,
      hub: patch,
      remove,
      revision,
      message: formatCalendarSyncMessage(result),
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("syncCalendarImportsAction failed.", error);
    return { ok: false, message: "Could not check Gmail Calendar." };
  }
}

async function persistCalendarImportMutation(
  loadBefore: () => Promise<HubData | null>,
  apply: (hub: HubData) => ReturnType<typeof updateCalendarImportOnHub>,
  notFoundMessage = "That import could not be found.",
): Promise<CalendarImportActionResult> {
  const saved = await persistHubDiffMutation(loadBefore, apply, notFoundMessage);
  if (!saved.ok) return saved;
  return {
    ok: true,
    hub: saved.hub,
    remove: saved.remove,
    revision: saved.revision,
    message: saved.message,
  };
}

export async function dismissCalendarCanceledImportAction(
  importId: string,
): Promise<CalendarImportActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistCalendarImportMutation(
      () => loadAdminHubSlices({ persistReconciliation: false }),
      (hub) => dismissCalendarCanceledImportOnHub(hub, importId),
    );
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("dismissCalendarCanceledImportAction failed.", error);
    return { ok: false, message: "Could not dismiss this import." };
  }
}

export async function markCalendarCanceledNotifiedAction(
  importId: string,
): Promise<CalendarImportActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistCalendarImportMutation(
      () => loadAdminHubSlices({ persistReconciliation: false }),
      (hub) => markCalendarCanceledNotifiedOnHub(hub, importId),
    );
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("markCalendarCanceledNotifiedAction failed.", error);
    return { ok: false, message: "Could not save removal notice." };
  }
}

export async function rejectCalendarImportAction(
  importId: string,
  reason?: string,
): Promise<CalendarImportActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistCalendarImportMutation(
      () => loadAdminHubSlices({ persistReconciliation: false }),
      (hub) => rejectCalendarImportOnHub(hub, importId, reason),
    );
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("rejectCalendarImportAction failed.", error);
    return { ok: false, message: "Could not dismiss this import." };
  }
}

export async function approveCalendarImportAction(
  input: ApproveCalendarImportInput,
): Promise<CalendarImportActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistHubDiffMutation(
      () => loadAdminHubSlices({ persistReconciliation: false }),
      (hub) => approveCalendarImportOnHub(hub, input),
      "That import could not be found.",
    );
    if (!saved.ok) return saved;
    return {
      ok: true,
      hub: saved.hub,
      remove: saved.remove,
      revision: saved.revision,
      message: saved.message,
      jobId: saved.jobId,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("approveCalendarImportAction failed.", error);
    return { ok: false, message: "Could not approve this import." };
  }
}

export async function loadCalendarImportPrefillAction(
  importId: string,
): Promise<{ ok: true; prefill: CalendarImportParsedHints } | { ok: false; message: string }> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const trimmed = importId.trim();
    if (!trimmed) return { ok: false, message: "That import could not be found." };
    const hub = await loadAdminHubCalendarImportSlice(trimmed);
    const row = hub.calendarImports[0];
    if (!row) return { ok: false, message: "That import could not be found." };
    return { ok: true, prefill: calendarImportCustomerPrefillFromRow(row) };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("loadCalendarImportPrefillAction failed.", error);
    return { ok: false, message: "Could not load this import." };
  }
}

export async function loadCalendarImportAction(importId: string): Promise<
  | { ok: true; hub: HubData; revision: number }
  | { ok: false; message: string }
> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadAdminHubCalendarImportSlice(importId);
    if (hub.calendarImports.length === 0) return { ok: false, message: "That import could not be found." };
    const { readHubRevision } = await import("@/lib/data/repository");
    const revision = await readHubRevision();
    const full = await loadAdminHubSlices({ persistReconciliation: false });
    return {
      ok: true,
      hub: {
        ...full,
        calendarImports: hub.calendarImports,
      },
      revision,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("loadCalendarImportAction failed.", error);
    return { ok: false, message: "Could not load this import." };
  }
}