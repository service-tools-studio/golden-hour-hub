import type { HubData } from "../mock/seed.ts";
import { mergeHubPatchIntoHub } from "./merge-hub-patch.ts";

/** @deprecated use mergeHubPatchIntoHub */
export function mergeJobStaffingIntoHub(current: HubData, patch: HubData): HubData {
  return mergeHubPatchIntoHub(current, patch, { replaceAssignmentsForPatchJobs: true });
}
