"use server";

import { AuthError, requireAdmin, requireCleaner } from "@/lib/auth/guards";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { dynamoConfigured } from "@/lib/data/repository";
import { persistAvailabilityWeekMutation } from "@/lib/data/persist-availability-week";
import { notifyAdminsCleanerAvailabilitySubmitted } from "@/lib/cleaner/admin-availability-notify";
import { notifyAdminsCleanerAcceptedInvite } from "@/lib/cleaner/admin-invite-notify";
import {
  acceptInvitationOnHub,
  declineInvitationOnHub,
} from "@/lib/hub/cleaner-mutations";
import { persistHubMutation } from "@/lib/hub/persist-hub-mutation";
import type { HubPatchRemove } from "@/lib/hub/merge-hub-patch";
import type { HubData } from "@/lib/mock/seed";
import type { AvailabilityWindow } from "@/lib/domain/types";

type CleanerHubMutationResult =
  | { ok: true; message?: string; data: HubData; revision: number }
  | { ok: false; message: string };

type AvailabilityMutationResult =
  | { ok: true; message?: string; data: HubData; remove?: HubPatchRemove; revision: number }
  | { ok: false; message: string; stale?: false }
  | { ok: false; message: string; stale: true; data: HubData };

export type AdminAvailabilityMutationResult =
  | { ok: true; message?: string; hub: HubData; remove?: HubPatchRemove; revision: number }
  | { ok: false; message: string; stale?: false }
  | { ok: false; message: string; stale: true; hub: HubData };

async function persistCleanerHubMutation(
  cleanerId: string,
  apply: (
    hub: HubData,
    cleanerId: string,
  ) => { hub: HubData; result: { ok: true; message?: string } | { ok: false; message: string } },
): Promise<CleanerHubMutationResult> {
  const saved = await persistHubMutation((hub) => {
    const { hub: next, result } = apply(hub, cleanerId);
    if (!result.ok) return result;
    return { ok: true, hub: next, message: result.message };
  });
  if (!saved.ok) return saved;
  return {
    ok: true,
    message: saved.message,
    revision: saved.revision,
    data: hubDataForCleaner(saved.hub, cleanerId),
  };
}

async function persistAvailabilityWeek(
  cleanerId: string,
  weekStart: string,
  windows: AvailabilityWindow[],
  expectedWeekSignature?: string,
) {
  return persistAvailabilityWeekMutation(cleanerId, weekStart, windows, expectedWeekSignature);
}

async function notifyAvailabilitySubmitted(
  hub: HubData,
  cleanerId: string,
  weekStart: string,
  kind: "submitted" | "updated",
): Promise<void> {
  const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
  if (!cleaner) return;
  try {
    await notifyAdminsCleanerAvailabilitySubmitted({ cleaner, weekStart, kind });
  } catch (error) {
    console.error("[admin:availability] notify failed", error);
  }
}

export async function acceptInvitationAction(
  assignmentId: string,
  crewSize: number,
): Promise<CleanerHubMutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistCleanerHubMutation(session.cleanerId, (hub, cleanerId) =>
      acceptInvitationOnHub(hub, cleanerId, assignmentId, crewSize),
    );
    if (!saved.ok) return saved;

    const assignment = saved.data.assignments.find((item) => item.assignmentId === assignmentId);
    const job = assignment ? saved.data.jobs.find((item) => item.jobId === assignment.jobId) : undefined;
    const cleaner = saved.data.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (assignment && job && cleaner && assignment.status !== "INVITED") {
      try {
        await notifyAdminsCleanerAcceptedInvite({ cleaner, job, assignment });
      } catch (error) {
        console.error("[admin:invite-accept] notify failed", error);
      }
    }

    return saved;
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("cleaner hub mutation failed.", error);
    return { ok: false, message: "Could not update Hub." };
  }
}

export async function declineInvitationAction(assignmentId: string): Promise<CleanerHubMutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistCleanerHubMutation(session.cleanerId, (hub, cleanerId) =>
      declineInvitationOnHub(hub, cleanerId, assignmentId),
    );
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("cleaner hub mutation failed.", error);
    return { ok: false, message: "Could not update Hub." };
  }
}

export async function submitAvailabilityAction(
  weekStart: string,
  windows: AvailabilityWindow[],
  expectedWeekSignature?: string,
): Promise<AvailabilityMutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistAvailabilityWeek(
      session.cleanerId,
      weekStart,
      windows,
      expectedWeekSignature,
    );
    if (!saved.ok) {
      if (saved.stale) return { ok: false, stale: true, message: saved.message, data: saved.hub };
      return saved;
    }
    await notifyAvailabilitySubmitted(saved.notifyHub, session.cleanerId, weekStart, saved.notificationKind);
    return {
      ok: true,
      message: saved.message,
      revision: saved.revision,
      data: saved.hub,
      remove: saved.remove,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("cleaner hub mutation failed.", error);
    return { ok: false, message: "Could not update Hub." };
  }
}

/** Admin team screen: save one cleaner's week without clobbering other cleaners' availability. */
export async function submitCleanerAvailabilityAdminAction(
  cleanerId: string,
  weekStart: string,
  windows: AvailabilityWindow[],
  expectedWeekSignature?: string,
): Promise<AdminAvailabilityMutationResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistAvailabilityWeek(cleanerId, weekStart, windows, expectedWeekSignature);
    if (!saved.ok) {
      if (saved.stale) return { ok: false, stale: true, message: saved.message, hub: saved.hub };
      return saved;
    }
    await notifyAvailabilitySubmitted(saved.notifyHub, cleanerId, weekStart, saved.notificationKind);
    return { ok: true, message: saved.message, hub: saved.hub, remove: saved.remove, revision: saved.revision };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("submitCleanerAvailabilityAdminAction failed.", error);
    return { ok: false, message: "Could not update Hub." };
  }
}
