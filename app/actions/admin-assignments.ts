"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
import { dynamoConfigured } from "@/lib/data/repository";
import { loadHubForCompleteAssignment } from "@/lib/data/load-hub-mutations";
import { persistHubDiffMutation } from "@/lib/data/persist-hub-diff-mutation";
import {
  completeAssignmentOnHub,
  type CompleteAssignmentInput,
} from "@/lib/hub/complete-assignment-mutations";
import type { HubPatchRemove } from "@/lib/hub/merge-hub-patch";
import type { HubData } from "@/lib/mock/seed";

export type CompleteAssignmentActionResult =
  | {
      ok: true;
      hub: HubData;
      remove?: HubPatchRemove;
      revision: number;
      jobId: string;
      message: string;
      assignmentId?: string;
    }
  | { ok: false; message: string };

export async function completeAssignmentAction(
  input: CompleteAssignmentInput,
): Promise<CompleteAssignmentActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistHubDiffMutation(
      () => loadHubForCompleteAssignment(input.jobId, input.cleanerId),
      (hub) => completeAssignmentOnHub(hub, input),
      "That cleaning could not be found.",
    );
    if (!saved.ok) return saved;
    try {
      await purgeStaleAssignmentSmsLogs(saved.hub);
    } catch (error) {
      console.error("purgeStaleAssignmentSmsLogs failed after completeAssignmentAction.", error);
    }
    return {
      ok: true,
      hub: saved.hub,
      remove: saved.remove,
      revision: saved.revision,
      jobId: saved.jobId,
      message: saved.message,
      assignmentId: saved.assignmentId,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("completeAssignmentAction failed.", error);
    return { ok: false, message: "Could not save this assignment." };
  }
}
