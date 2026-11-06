import "server-only";

import {
  signedAvailabilityWeek,
  STALE_AVAILABILITY_WEEK_MESSAGE,
  windowsInWeek,
} from "../domain/availability.ts";
import { addDays } from "../domain/time.ts";
import type { AvailabilityWindow } from "../domain/types.ts";
import { submitAvailabilityOnHub } from "../hub/cleaner-mutations.ts";
import { buildAvailabilityWeekPersistPlan } from "../hub/availability-week-persist-plan.ts";
import { emptyHub, type HubData } from "../mock/seed.ts";
import { loadHubForAvailabilityWeek } from "./load-admin-hub.ts";
import { hubAvailabilityWeekPatch, type HubPatchRemove } from "../hub/merge-hub-patch.ts";
import { readHubRevision, writeHubItemChanges } from "./repository.ts";

export type PersistAvailabilityWeekResult =
  | {
      ok: true;
      hub: HubData;
      notifyHub: HubData;
      remove?: HubPatchRemove;
      revision: number;
      message?: string;
      notificationKind: "submitted" | "updated";
    }
  | { ok: false; message: string; stale?: false }
  | { ok: false; message: string; stale: true; hub: HubData };

function availabilityWeekSlice(hub: HubData, cleanerId: string, weekStart: string): HubData {
  return {
    ...emptyHub(hub.today),
    availability: windowsInWeek(hub.availability, cleanerId, weekStart),
    submissions: hub.submissions.filter(
      (submission) => submission.cleanerId === cleanerId && submission.weekStart === weekStart,
    ),
  };
}

/**
 * Save one cleaner's availability week with targeted AVAIL/SUBMISSION/assignment writes
 * (no full-table saveHub). Retries on hub revision conflict.
 * When `expectedWeekSignature` is set, refuses to write if that week changed since the editor loaded it.
 */
export async function persistAvailabilityWeekMutation(
  cleanerId: string,
  weekStart: string,
  windows: AvailabilityWindow[],
  expectedWeekSignature?: string,
  maxAttempts = 3,
): Promise<PersistAvailabilityWeekResult> {
  const weekEnd = addDays(weekStart, 6);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const before = await loadHubForAvailabilityWeek(cleanerId, weekStart);
    if (
      expectedWeekSignature !== undefined &&
      signedAvailabilityWeek(before.availability, cleanerId, weekStart) !== expectedWeekSignature
    ) {
      return {
        ok: false,
        stale: true,
        message: STALE_AVAILABILITY_WEEK_MESSAGE,
        hub: availabilityWeekSlice(before, cleanerId, weekStart),
      };
    }
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
      const { patch, remove } = hubAvailabilityWeekPatch(before, after, cleanerId, weekStart, weekEnd);
      return {
        ok: true,
        hub: patch,
        notifyHub: after,
        remove,
        revision: saved.revision,
        message: result.message,
        notificationKind,
      };
    }
  }

  return { ok: false, message: "Could not save after syncing the latest hub." };
}
