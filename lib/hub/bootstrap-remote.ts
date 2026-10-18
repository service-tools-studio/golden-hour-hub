import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { AuthError, requireSession } from "@/lib/auth/guards";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import { dynamoConfigured, loadHub, readHubRevision } from "@/lib/data/repository";
import type { HubData } from "@/lib/mock/seed";

export type BootstrapResult =
  | { ok: false; message: string }
  | { source: "preview" }
  | { source: "dynamodb"; data: HubData; revision: number };

export type HubVersionResult =
  | { ok: false; message: string }
  | { source: "preview" }
  | { revision: number };

type RemoteAccess =
  | { ok: false; message: string }
  | { source: "preview" }
  | { source: "dynamodb"; role: "ADMIN" }
  | { source: "dynamodb"; role: "CLEANER"; cleanerId: string };

async function remoteHubAccess(): Promise<RemoteAccess> {
  if (previewAuthEnabled()) {
    if (dynamoConfigured()) return { source: "dynamodb", role: "ADMIN" };
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
    if (session.role === "ADMIN") return { source: "dynamodb", role: "ADMIN" };
    if (!session.cleanerId) {
      return { ok: false, message: "Your cleaner profile is not linked in Hub." };
    }
    return { source: "dynamodb", role: "CLEANER", cleanerId: session.cleanerId };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/** Fresh hub read for bootstrap and background sync (never cached). */
export async function loadRemoteHub(): Promise<BootstrapResult> {
  noStore();
  try {
    const access = await remoteHubAccess();
    if ("ok" in access) return access;
    if (access.source === "preview") return { source: "preview" };
    const data = await loadHub();
    const revision = await readHubRevision();
    if (access.role === "ADMIN") {
      return { source: "dynamodb", data, revision };
    }
    return { source: "dynamodb", data: hubDataForCleaner(data, access.cleanerId), revision };
  } catch (error) {
    console.error("loadRemoteHub failed.", error);
    return { ok: false, message: "Could not load Hub data." };
  }
}

/** Cheap revision read for polling (single DynamoDB GetItem). */
export async function loadRemoteHubRevision(): Promise<HubVersionResult> {
  noStore();
  try {
    const access = await remoteHubAccess();
    if ("ok" in access) return access;
    if (access.source === "preview") return { source: "preview" };
    const revision = await readHubRevision();
    return { revision };
  } catch (error) {
    console.error("loadRemoteHubRevision failed.", error);
    return { ok: false, message: "Could not read Hub version." };
  }
}
