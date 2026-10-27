import { deriveCrewSettings } from "../domain/cleaners.ts";
import type { CleanerStatus } from "../domain/types.ts";
import type { HubData } from "../mock/seed.ts";

type ActionResult = { ok: true } | { ok: false; message: string };

export type UpdateCleanerAdminInput = {
  typicalHelperCount: number;
  maxHelperCount: number;
  typicalHourlyRateCents: number;
  status: CleanerStatus;
};

/** Admin team profile fields — must merge onto the latest hub snapshot (not a stale copy). */
export function updateCleanerAdminOnHub(
  hub: HubData,
  cleanerId: string,
  input: UpdateCleanerAdminInput,
): { hub: HubData; result: ActionResult } {
  const crew = deriveCrewSettings(input);
  if (!crew.ok) return { hub, result: crew };
  if (!Number.isInteger(input.typicalHourlyRateCents) || input.typicalHourlyRateCents < 0) {
    return { hub, result: { ok: false, message: "Enter a valid hourly rate." } };
  }
  const now = new Date().toISOString();
  return {
    hub: {
      ...hub,
      cleaners: hub.cleaners.map((cleaner) =>
        cleaner.cleanerId === cleanerId
          ? {
              ...cleaner,
              status: input.status,
              typicalHelperCount: crew.typicalHelperCount,
              maxHelperCount: crew.maxHelperCount,
              typicalHourlyRateCents: input.typicalHourlyRateCents,
              updatedAt: now,
              updatedBy: "kelsey",
            }
          : cleaner,
      ),
    },
    result: { ok: true },
  };
}
