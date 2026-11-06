import "server-only";

import { buildHubDiffPersistPlan } from "../hub/hub-diff-persist-plan.ts";
import type { HubData } from "../mock/seed.ts";
import { readHubRevision, writeHubItemChanges } from "./repository.ts";

type MutationOutcome = { ok: true; hub: HubData } | { ok: false; message: string };

/**
 * Apply a hub mutation against a scoped load, persist only Dynamo diff (no saveHub scan).
 */
export async function persistHubDiffMutation<T extends MutationOutcome>(
  loadBefore: () => Promise<HubData | null>,
  apply: (hub: HubData) => T,
  notFoundMessage = "That record could not be found.",
  maxAttempts = 3,
): Promise<(T & { revision: number }) | { ok: false; message: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const before = await loadBefore();
    if (!before) return { ok: false, message: notFoundMessage };
    const expectedRevision = await readHubRevision();
    const outcome = apply(before);
    if (!outcome.ok) return outcome as { ok: false; message: string };

    const plan = buildHubDiffPersistPlan(before, outcome.hub);
    if (plan.puts.length === 0 && plan.deletes.length === 0) {
      return { ok: false, message: "Nothing to save." };
    }

    const saved = await writeHubItemChanges(plan, expectedRevision);
    if (saved.ok) {
      return { ...outcome, revision: saved.revision } as T & { revision: number };
    }
  }

  return { ok: false, message: "Could not save after syncing the latest hub." };
}
