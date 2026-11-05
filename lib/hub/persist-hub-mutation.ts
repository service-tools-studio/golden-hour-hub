import "server-only";

import { loadHub, readHubRevision, saveHubIfRevision } from "../data/repository.ts";
import type { HubData } from "../mock/seed.ts";

type MutationOutcome =
  | { ok: true; hub: HubData }
  | { ok: false; message: string };

/**
 * Apply a hub mutation and save with revision check; on conflict reload and retry (smooth for admins).
 */
export async function persistHubMutation<T extends MutationOutcome>(
  apply: (hub: HubData) => T,
  maxAttempts = 3,
): Promise<(T & { revision: number }) | { ok: false; message: string }> {
  let hub = await loadHub();
  let expectedRevision = await readHubRevision();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const outcome = apply(hub);
    if (!outcome.ok) return outcome as { ok: false; message: string };

    const saved = await saveHubIfRevision(outcome.hub, expectedRevision);
    if (saved.ok) {
      return { ...outcome, revision: saved.revision } as T & { revision: number };
    }

    hub = saved.hub;
    expectedRevision = saved.revision;
  }

  return { ok: false, message: "Could not save after syncing the latest hub." };
}
