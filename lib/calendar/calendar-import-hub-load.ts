import "server-only";

import { queryCalendarImportsForSyncInRange } from "../data/calendar-import-queries.ts";
import { loadAdminHubJobPartitionSlice, loadAdminHubSlices } from "../data/load-admin-hub.ts";
import { readCalendarImport } from "../data/items.ts";
import type { HubData } from "../mock/seed.ts";
import { calendarImportSyncHorizonEnd } from "./calendar-import-sync-side-effects.ts";
import { mergeJobPartitionIntoHub } from "./calendar-import-sync-side-effects.ts";

/**
 * Hub slice for Gmail import/link/sync: dashboard imports + all staged rows in the sync window,
 * and job partitions for every linked cleaning (admin bootstrap omits APPROVED imports and may miss a new job).
 */
export async function loadHubForCalendarImportApply(extraJobIds: string[] = []): Promise<HubData> {
  const hub = await loadAdminHubSlices({ persistReconciliation: false });
  const today = hub.today;
  const horizonEnd = calendarImportSyncHorizonEnd(today);
  const importItems = await queryCalendarImportsForSyncInRange(today, horizonEnd);
  const byId = new Map(hub.calendarImports.map((row) => [row.importId, row]));
  const jobIds = new Set(extraJobIds.map((id) => id.trim()).filter(Boolean));
  for (const item of importItems) {
    const row = readCalendarImport(item);
    byId.set(row.importId, row);
    if (row.approvedJobId?.trim()) jobIds.add(row.approvedJobId.trim());
    if (row.matchedJobId?.trim()) jobIds.add(row.matchedJobId.trim());
  }
  let merged: HubData = { ...hub, calendarImports: [...byId.values()] };
  for (const jobId of jobIds) {
    const slice = await loadAdminHubJobPartitionSlice(jobId);
    merged = mergeJobPartitionIntoHub(merged, slice, jobId);
  }
  return merged;
}