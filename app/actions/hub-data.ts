"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { previewAuthEnabled } from "@/lib/auth/config";
import { loadRemoteHub, type BootstrapResult, type HubVersionResult } from "@/lib/hub/bootstrap-remote";
import { dynamoConfigured, loadHub, readHubRevision, saveHub, saveHubIfRevision } from "@/lib/data/repository";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
import type { HubData } from "@/lib/mock/seed";

export type { BootstrapResult, HubVersionResult };

export async function bootstrapHub(): Promise<BootstrapResult> {
  return loadRemoteHub();
}

export type PersistAdminHubResult =
  | { ok: true; revision: number }
  | { ok: false; conflict: true; revision: number; hub: HubData }
  | { ok: false; message: string };

/** Admin-only full hub save (DynamoDB) with optimistic revision check. */
export async function persistAdminHub(
  data: HubData,
  expectedRevision: number,
): Promise<PersistAdminHubResult> {
  try {
    if (!dynamoConfigured()) return { ok: false, message: "DynamoDB is not configured." };
    if (!previewAuthEnabled()) {
      await requireAdmin();
    }
    const saved = await saveHubIfRevision(data, expectedRevision);
    if (!saved.ok) {
      return { ok: false, conflict: true, revision: saved.revision, hub: saved.hub };
    }
    try {
      await purgeStaleAssignmentSmsLogs(data);
    } catch (error) {
      console.error("purgeStaleAssignmentSmsLogs failed after persistAdminHub.", error);
    }
    return { ok: true, revision: saved.revision };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: error.message };
    }
    console.error("persistAdminHub failed.", error);
    return { ok: false, message: "Could not save Hub data." };
  }
}
