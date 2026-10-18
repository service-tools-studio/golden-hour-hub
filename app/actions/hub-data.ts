"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { previewAuthEnabled } from "@/lib/auth/config";
import { loadRemoteHub, type BootstrapResult, type HubVersionResult } from "@/lib/hub/bootstrap-remote";
import { dynamoConfigured, saveHub } from "@/lib/data/repository";
import type { HubData } from "@/lib/mock/seed";

export type { BootstrapResult, HubVersionResult };

export async function bootstrapHub(): Promise<BootstrapResult> {
  return loadRemoteHub();
}

/** Admin-only full hub save (DynamoDB). */
export async function persistAdminHub(
  data: HubData,
): Promise<{ ok: true; revision: number } | { ok: false; message: string }> {
  try {
    if (!dynamoConfigured()) return { ok: false, message: "DynamoDB is not configured." };
    if (!previewAuthEnabled()) {
      await requireAdmin();
    }
    const revision = await saveHub(data);
    return { ok: true, revision };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: error.message };
    }
    console.error("persistAdminHub failed.", error);
    return { ok: false, message: "Could not save Hub data." };
  }
}
