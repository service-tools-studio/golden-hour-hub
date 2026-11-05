"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";
import {
  completeAssignmentOnHub,
  type CompleteAssignmentInput,
} from "@/lib/hub/complete-assignment-mutations";
import type { HubData } from "@/lib/mock/seed";

export type CompleteAssignmentActionResult =
  | { ok: true; hub: HubData; revision: number; jobId: string; message: string; assignmentId?: string }
  | { ok: false; message: string };

export async function completeAssignmentAction(
  input: CompleteAssignmentInput,
): Promise<CompleteAssignmentActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const outcome = completeAssignmentOnHub(hub, input);
    if (!outcome.ok) return outcome;
    const revision = await saveHub(outcome.hub);
    try {
      await purgeStaleAssignmentSmsLogs(outcome.hub);
    } catch (error) {
      console.error("purgeStaleAssignmentSmsLogs failed after completeAssignmentAction.", error);
    }
    return {
      ok: true,
      hub: outcome.hub,
      revision,
      jobId: outcome.jobId,
      message: outcome.message,
      assignmentId: outcome.assignmentId,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("completeAssignmentAction failed.", error);
    return { ok: false, message: "Could not save this assignment." };
  }
}
