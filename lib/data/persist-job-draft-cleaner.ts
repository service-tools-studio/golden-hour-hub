import "server-only";

import type { AdminHubApplierResult } from "../hub/admin-hub-appliers.ts";
import { buildJobRosterPersistPlan } from "../hub/job-draft-persist-plan.ts";
import { hubMutationPatch, type HubPatchRemove } from "../hub/merge-hub-patch.ts";
import type { HubData } from "../mock/seed.ts";
import { loadHubForJobStaffing, readHubRevision, writeHubItemChanges } from "./repository.ts";

export type PersistJobRosterResult =
  | ({ ok: true; hub: HubData; revision: number; remove?: HubPatchRemove } & Omit<
      Extract<AdminHubApplierResult, { ok: true }>,
      "ok" | "hub"
    >)
  | { ok: false; message: string };

/**
 * Add/remove cleaner on a job: query job partition + cleaner profile (no full-table scan),
 * then put only changed job / assignment rows.
 */
export async function persistJobRosterMutation(
  jobId: string,
  cleanerId: string,
  apply: (hub: HubData) => AdminHubApplierResult,
  maxAttempts = 3,
): Promise<PersistJobRosterResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const before = await loadHubForJobStaffing(jobId, cleanerId);
    if (!before) {
      return { ok: false, message: "That cleaning or cleaner could not be found." };
    }
    const expectedRevision = await readHubRevision();
    const outcome = apply(before);
    if (!outcome.ok) return outcome;

    const plan = buildJobRosterPersistPlan(before, outcome.hub, jobId);
    if (plan.puts.length === 0) {
      return { ok: false, message: "Nothing to save." };
    }

    const saved = await writeHubItemChanges(plan, expectedRevision);
    if (saved.ok) {
      const { ok: _ok, hub, ...rest } = outcome;
      const { patch, remove } = hubMutationPatch(before, hub);
      return { ok: true, hub: patch, remove, revision: saved.revision, ...rest };
    }

    if (attempt + 1 < maxAttempts) {
      continue;
    }
  }

  return { ok: false, message: "Could not save after syncing the latest hub." };
}

/** @deprecated use persistJobRosterMutation */
export const persistJobDraftCleanerMutation = persistJobRosterMutation;

export type PersistJobDraftCleanerResult = PersistJobRosterResult;
