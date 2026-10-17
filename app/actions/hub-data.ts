"use server";

import { AuthError, requireAdmin, requireSession } from "@/lib/auth/guards";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";
import type { HubData } from "@/lib/mock/seed";

export type BootstrapResult =
  | { ok: false; message: string }
  | { source: "preview" }
  | { source: "dynamodb"; data: HubData };

export async function bootstrapHub(): Promise<BootstrapResult> {
  if (previewAuthEnabled()) {
    if (dynamoConfigured()) {
      try {
        const data = await loadHub();
        return { source: "dynamodb", data };
      } catch (error) {
        console.error("bootstrapHub preview+dynamo failed.", error);
        return { ok: false, message: "Could not load Hub data from DynamoDB." };
      }
    }
    return { source: "preview" };
  }
  if (!cognitoConfigured()) {
    return { ok: false, message: "Sign-in is not configured." };
  }
  try {
    const session = await requireSession();
    if (!dynamoConfigured()) {
      if (previewAuthAllowed()) return { source: "preview" };
      return { ok: false, message: "Hub database is not configured." };
    }
    const data = await loadHub();
    if (session.role === "ADMIN") {
      return { source: "dynamodb", data };
    }
    if (!session.cleanerId) {
      return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    }
    return { source: "dynamodb", data: hubDataForCleaner(data, session.cleanerId) };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: error.message };
    }
    console.error("bootstrapHub failed.", error);
    return { ok: false, message: "Could not load Hub data." };
  }
}

/** Admin-only full hub save (DynamoDB). */
export async function persistAdminHub(data: HubData): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "DynamoDB is not configured." };
    await saveHub(data);
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: error.message };
    }
    console.error("persistAdminHub failed.", error);
    return { ok: false, message: "Could not save Hub data." };
  }
}
