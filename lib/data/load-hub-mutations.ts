import "server-only";

import { todayInBusinessZone } from "../domain/time.ts";
import { itemsToHub } from "./items.ts";
import type { HubData } from "../mock/seed.ts";
import { loadAdminHubSlices } from "./load-admin-hub.ts";
import {
  dedupeItemsByKey,
  queryAllCustomerPartitionItems,
  queryItemsByPk,
  queryRelationIndex,
} from "./dynamo-queries.ts";

/** Customers + properties (+ one customer's jobs/series when editing) for saveCustomerOnHub. */
export async function loadHubForCustomerSave(customerId?: string): Promise<HubData> {
  const today = todayInBusinessZone();
  const items = [...(await queryAllCustomerPartitionItems())];
  if (customerId) {
    const [jobs, series] = await Promise.all([
      queryRelationIndex(`CUSTOMER#${customerId}`, "JOB#"),
      queryRelationIndex(`CUSTOMER#${customerId}`, "SERIES#"),
    ]);
    items.push(...jobs, ...series);
  }
  return itemsToHub(dedupeItemsByKey(items), today);
}

/** Full scheduling graph for createJob (recurring horizon generation). */
export async function loadHubForCreateJob(): Promise<HubData> {
  return loadAdminHubSlices({ persistReconciliation: false });
}

/** Staffing context for completeAssignmentOnHub (conflicts, availability, headcount). */
export async function loadHubForCompleteAssignment(jobId: string, cleanerId: string): Promise<HubData | null> {
  const today = todayInBusinessZone();
  const [adminContext, jobItems] = await Promise.all([
    loadAdminHubSlices({ persistReconciliation: false }),
    queryItemsByPk(`JOB#${jobId}`),
  ]);
  if (!jobItems.some((item) => item.sk === "PROFILE" && item.entity === "job")) return null;

  const jobHub = itemsToHub(jobItems, today);
  const job = jobHub.jobs.find((item) => item.jobId === jobId);
  if (!job) return null;
  if (!adminContext.cleaners.some((item) => item.cleanerId === cleanerId)) {
    const cleaner = jobHub.cleaners.find((item) => item.cleanerId === cleanerId);
    if (!cleaner) return null;
    adminContext.cleaners.push(cleaner);
  }

  return {
    ...adminContext,
    today,
    jobs: adminContext.jobs.some((item) => item.jobId === jobId)
      ? adminContext.jobs.map((item) => (item.jobId === jobId ? job : item))
      : [job, ...adminContext.jobs],
    assignments: [
      ...adminContext.assignments.filter((item) => item.jobId !== jobId),
      ...jobHub.assignments,
    ],
  };
}
