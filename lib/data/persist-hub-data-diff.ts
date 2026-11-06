import "server-only";

import { buildHubDiffPersistPlan } from "../hub/hub-diff-persist-plan.ts";
import type { HubData } from "../mock/seed.ts";
import { readHubRevision, writeHubItemChanges } from "./repository.ts";

/** Persist only changed Dynamo rows between two in-memory hub snapshots. */
export async function persistHubDataDiff(before: HubData, after: HubData): Promise<number> {
  const plan = buildHubDiffPersistPlan(before, after);
  if (plan.puts.length === 0 && plan.deletes.length === 0) {
    return readHubRevision();
  }
  const expectedRevision = await readHubRevision();
  const saved = await writeHubItemChanges(plan, expectedRevision);
  if (!saved.ok) {
    throw new Error("Hub revision conflict during persistHubDataDiff.");
  }
  return saved.revision;
}
