import "server-only";

import { addDays } from "../domain/time.ts";
import type { AvailabilityWindow } from "../domain/types.ts";
import { submitAvailabilityOnHub } from "../hub/cleaner-mutations.ts";
import { buildAvailabilityWeekPersistPlan } from "../hub/availability-week-persist-plan.ts";
import type { HubData } from "../mock/seed.ts";
import { loadHubForAvailabilityWeek } from "./load-admin-hub.ts";
import { readHubRevision, writeHubItemChanges } from "./repository.ts";

export type PersistAvailabilityWeekResult =
  | { ok: true; hub: HubData; revision: number; message?: string; notificationKind: "submitted" | "updated" }
  | { ok: false; message: string };

/**
 * Save one cleaner's availability week with targeted AVAIL/SUBMISSION/assignment writes
 * (no full-table saveHub). Retries on hub revision conflict.
 */
export async function persistAvailabilityWeekMutation(
  cleanerId: string,
  weekStart: string,
  windows: AvailabilityWindow[],
  maxAttempts = 3,
): Promise<PersistAvailabilityWeekResult> {
  const weekEnd = addDays(weekStart, 6);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const before = await loadHubForAvailabilityWeek(cleanerId, weekStart);
    const expectedRevision = await readHubRevision();
    const notificationKind = before.submissions.some(
      (submission) => submission.cleanerId === cleanerId && submission.weekStart === weekStart,
    )
      ? "updated"
      : "submitted";
    const { hub: after, result } = submitAvailabilityOnHub(before, cleanerId, weekStart, windows);
    if (!result.ok) return result;

    const plan = buildAvailabilityWeekPersistPlan({
      before,
      after,
      cleanerId,
      weekStart,
      weekEnd,
    });

    const saved = await writeHubItemChanges(plan, expectedRevision);
    if (saved.ok) {
      return {
        ok: true,
        hub: after,
        revision: saved.revision,
        message: result.message,
        notificationKind,
      };
    }
  }

  return { ok: false, message: "Could not save after syncing the latest hub." };
}
