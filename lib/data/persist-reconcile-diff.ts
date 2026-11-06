import "server-only";

import { buildHubDiffPersistPlan } from "../hub/hub-diff-persist-plan.ts";
import type { HubData } from "../mock/seed.ts";
import { readHubRevision, writeHubItemChanges } from "./repository.ts";

/** Persist reconcile/generation changes without a full-table saveHub. */
export async function persistReconcileDiff(before: HubData, after: HubData): Promise<void> {
  const plan = buildHubDiffPersistPlan(before, after);
  if (plan.puts.length === 0 && plan.deletes.length === 0) return;
  const expectedRevision = await readHubRevision();
  const saved = await writeHubItemChanges(plan, expectedRevision);
  if (!saved.ok) {
    throw new Error("Hub revision conflict during reconcile persist.");
  }
}
