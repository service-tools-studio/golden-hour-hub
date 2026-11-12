import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { AuthError, resolveHubAuthSession } from "@/lib/auth/guards";
import { hubDataForCleaner } from "@/lib/auth/hub-scope";
import { cognitoConfigured, previewAuthEnabled } from "@/lib/auth/config";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import type { AuthSession } from "@/lib/auth/session";
import { readHubChangeManifest } from "@/lib/data/hub-change-manifest";
import { loadAdminHubRemainderSlice, loadAdminHubSlices, loadCleanerHubSlices, loadHubPartitions } from "@/lib/data/load-admin-hub";
import { dynamoConfigured } from "@/lib/data/repository";
import { editableAvailabilityHorizonEnd, todayInBusinessZone } from "@/lib/domain/time";
import type { HubData } from "@/lib/mock/seed";
import type { BootstrapResult } from "@/lib/hub/bootstrap-result";

export type { BootstrapResult } from "@/lib/hub/bootstrap-result";

export type HubVersionResult =
  | { ok: false; message: string }
  | { source: "preview" }
  | { revision: number };

export type RemoteHubSyncResult =
  | { ok: false; message: string }
  | { source: "preview" }
  | { source: "dynamodb"; mode: "full"; data: HubData; revision: number }
  | { source: "dynamodb"; mode: "patch"; data: HubData; revision: number };

type RemoteAccess =
  | { ok: false; message: string }
  | { source: "preview" }
  | { source: "dynamodb"; role: "ADMIN" }
  | { source: "dynamodb"; role: "CLEANER"; cleanerId: string };

async function remoteHubAccess(sessionOverride?: AuthSession | null): Promise<RemoteAccess> {
  if (previewAuthEnabled() && !dynamoConfigured()) {
    return { source: "preview" };
  }

  try {
    const session = await resolveHubAuthSession(sessionOverride ?? undefined);
    if (!session) {
      if (previewAuthEnabled() && dynamoConfigured()) {
        return { source: "dynamodb", role: "ADMIN" };
      }
      if (!cognitoConfigured()) {
        if (previewAuthAllowed()) return { source: "preview" };
        return { ok: false, message: "Sign in required." };
      }
      return { ok: false, message: "Sign in required." };
    }
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

async function loadHubForAccess(
  access: Extract<RemoteAccess, { source: "dynamodb" }>,
  options: { loadTeamSchedulingExtras?: boolean; loadSeries?: boolean; jobHorizonEnd?: string } = {},
): Promise<HubData> {
  if (access.role === "ADMIN") {
    return loadAdminHubSlices({
      persistReconciliation: false,
      loadTeamSchedulingExtras: options.loadTeamSchedulingExtras,
      loadSeries: options.loadSeries,
      jobHorizonEnd: options.jobHorizonEnd,
    });
  }
  const data = await loadCleanerHubSlices(access.cleanerId, { persistReconciliation: false });
  return hubDataForCleaner(data, access.cleanerId);
}

/** Fresh hub read for bootstrap and background sync (never cached). Safe in Server Components (does not set cookies). */
export async function loadRemoteHub(session?: AuthSession | null): Promise<BootstrapResult> {
  noStore();
  try {
    const access = await remoteHubAccess(session);
    if ("ok" in access) return access;
    if (access.source === "preview") return { source: "preview" };
    const [data, { revision }] = await Promise.all([
      loadHubForAccess(
        access,
        access.role === "ADMIN"
          ? {
              loadTeamSchedulingExtras: true,
              loadSeries: true,
              jobHorizonEnd: editableAvailabilityHorizonEnd(todayInBusinessZone()),
            }
          : {},
      ),
      readHubChangeManifest(),
    ]);
    return { source: "dynamodb", data, revision };
  } catch (error) {
    console.error("loadRemoteHub failed.", error);
    return { ok: false, message: "Could not load Hub data." };
  }
}

/** Incremental sync when possible; otherwise full admin/cleaner slice reload. */
export async function loadRemoteHubSync(clientRevision: number | null): Promise<RemoteHubSyncResult> {
  noStore();
  try {
    const access = await remoteHubAccess();
    if ("ok" in access) return access;
    if (access.source === "preview") return { source: "preview" };

    const manifest = await readHubChangeManifest();
    const partitions = manifest.changedPartitions;
    const canPatch =
      access.role === "ADMIN" &&
      partitions.length > 0 &&
      partitions.length <= 32 &&
      clientRevision !== null;

    if (canPatch) {
      const patch = await loadHubPartitions(partitions);
      return { source: "dynamodb", mode: "patch", data: patch, revision: manifest.revision };
    }

    const data = await loadHubForAccess(access, { loadTeamSchedulingExtras: true });
    return { source: "dynamodb", mode: "full", data, revision: manifest.revision };
  } catch (error) {
    console.error("loadRemoteHubSync failed.", error);
    return { ok: false, message: "Could not sync Hub data." };
  }
}

/** Team/scheduling slice for admin after fast bootstrap (availability, submissions, BQ). */
export async function loadRemoteHubAdminSupplement(): Promise<
  { ok: false; message: string } | { source: "preview" } | { ok: true; data: HubData }
> {
  noStore();
  try {
    const access = await remoteHubAccess();
    if ("ok" in access) return access;
    if (access.source === "preview") return { source: "preview" };
    if (access.role !== "ADMIN") return { ok: false, message: "Not an admin session." };
    const data = await loadAdminHubRemainderSlice();
    return { ok: true, data };
  } catch (error) {
    console.error("loadRemoteHubAdminSupplement failed.", error);
    return { ok: false, message: "Could not load scheduling data." };
  }
}

/** Cheap revision read for polling (single DynamoDB GetItem). */
export async function loadRemoteHubRevision(): Promise<HubVersionResult> {
  noStore();
  try {
    const access = await remoteHubAccess();
    if ("ok" in access) return access;
    if (access.source === "preview") return { source: "preview" };
    const { revision } = await readHubChangeManifest();
    return { revision };
  } catch (error) {
    console.error("loadRemoteHubRevision failed.", error);
    return { ok: false, message: "Could not read Hub version." };
  }
}
