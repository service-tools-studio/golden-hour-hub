"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
import { dynamoConfigured } from "@/lib/data/repository";
import { loadHubForCreateJob } from "@/lib/data/load-hub-mutations";
import { persistHubDiffMutation } from "@/lib/data/persist-hub-diff-mutation";
import { createJobOnHub, type CreateJobInput } from "@/lib/hub/create-job-mutations";
import type { HubData } from "@/lib/mock/seed";

export type CreateJobActionResult =
  | { ok: true; hub: HubData; revision: number; jobId: string; message: string }
  | { ok: false; message: string };

export async function createJobAction(input: CreateJobInput): Promise<CreateJobActionResult> {
  try {
    const session = await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistHubDiffMutation(
      () => loadHubForCreateJob(),
      (hub) => createJobOnHub(hub, input, session.email),
    );
    if (!saved.ok) return saved;
    try {
      await purgeStaleAssignmentSmsLogs(saved.hub);
    } catch (error) {
      console.error("purgeStaleAssignmentSmsLogs failed after createJobAction.", error);
    }
    return {
      ok: true,
      hub: saved.hub,
      remove: saved.remove,
      revision: saved.revision,
      jobId: saved.jobId,
      message: saved.message,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("createJobAction failed.", error);
    return { ok: false, message: "Could not save this cleaning." };
  }
}
