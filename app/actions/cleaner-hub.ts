"use server";

import { AuthError } from "@/lib/auth/guards";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { requireCleaner } from "@/lib/auth/guards";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";
import { notifyAdminsCleanerAcceptedInvite } from "@/lib/cleaner/admin-invite-notify";
import {
  acceptInvitationOnHub,
  declineInvitationOnHub,
  submitAvailabilityOnHub,
} from "@/lib/hub/cleaner-mutations";
import type { HubData } from "@/lib/mock/seed";
import type { AvailabilityWindow } from "@/lib/domain/types";

type MutationResult = { ok: true; message?: string; data: HubData } | { ok: false; message: string };

async function runCleanerMutation(
  apply: (hub: HubData, cleanerId: string) => { hub: HubData; result: { ok: true; message?: string } | { ok: false; message: string } },
): Promise<MutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const { hub: next, result } = apply(hub, session.cleanerId);
    if (!result.ok) return result;
    await saveHub(next);
    return { ok: true, message: result.message, data: hubDataForCleaner(next, session.cleanerId) };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("cleaner hub mutation failed.", error);
    return { ok: false, message: "Could not update Hub." };
  }
}

export async function acceptInvitationAction(assignmentId: string, crewSize: number): Promise<MutationResult> {
  try {
    const session = await requireCleaner();
    if (!session.cleanerId) return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const { hub: next, result } = acceptInvitationOnHub(hub, session.cleanerId, assignmentId, crewSize);
    if (!result.ok) return result;
    await saveHub(next);

    const assignment = next.assignments.find((item) => item.assignmentId === assignmentId);
    const job = assignment ? next.jobs.find((item) => item.jobId === assignment.jobId) : undefined;
    const cleaner = next.cleaners.find((item) => item.cleanerId === session.cleanerId);
    if (assignment?.status === "CONFIRMED" && job && cleaner) {
      void notifyAdminsCleanerAcceptedInvite({ cleaner, job, assignment }).catch((error) => {
        console.error("[admin:invite-accept] notify failed", error);
      });
    }

    return { ok: true, message: result.message, data: hubDataForCleaner(next, session.cleanerId) };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("cleaner hub mutation failed.", error);
    return { ok: false, message: "Could not update Hub." };
  }
}

export async function declineInvitationAction(assignmentId: string): Promise<MutationResult> {
  return runCleanerMutation((hub, cleanerId) => declineInvitationOnHub(hub, cleanerId, assignmentId));
}

export async function submitAvailabilityAction(
  weekStart: string,
  windows: AvailabilityWindow[],
): Promise<MutationResult> {
  return runCleanerMutation((hub, cleanerId) => submitAvailabilityOnHub(hub, cleanerId, weekStart, windows));
}
