"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";
import { createJobOnHub, type CreateJobInput } from "@/lib/hub/create-job-mutations";
import type { HubData } from "@/lib/mock/seed";

export type CreateJobActionResult =
  | { ok: true; hub: HubData; revision: number; jobId: string; message: string }
  | { ok: false; message: string };

export async function createJobAction(input: CreateJobInput): Promise<CreateJobActionResult> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const hub = await loadHub();
    const outcome = createJobOnHub(hub, input, session.email);
    if (!outcome.ok) return outcome;
    const revision = await saveHub(outcome.hub);
    try {
      await purgeStaleAssignmentSmsLogs(outcome.hub);
    } catch (error) {
      console.error("purgeStaleAssignmentSmsLogs failed after createJobAction.", error);
    }
    return {
      ok: true,
      hub: outcome.hub,
      revision,
      jobId: outcome.jobId,
      message: outcome.message,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("createJobAction failed.", error);
    return { ok: false, message: "Could not save this cleaning." };
  }
}
