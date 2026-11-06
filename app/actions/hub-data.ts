"use server";

import { previewAuthEnabled } from "@/lib/auth/config";
import { loadRemoteHub, loadRemoteHubAdminSupplement, type BootstrapResult, type HubVersionResult } from "@/lib/hub/bootstrap-remote";
import type { HubData } from "@/lib/mock/seed";

export type { BootstrapResult, HubVersionResult };

export async function bootstrapHub(): Promise<BootstrapResult> {
  return loadRemoteHub();
}

export async function bootstrapAdminHubSupplement(): Promise<
  { ok: false; message: string } | { source: "preview" } | { ok: true; data: HubData }
> {
  return loadRemoteHubAdminSupplement();
}
