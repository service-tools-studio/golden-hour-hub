"use server";

import { previewAuthEnabled } from "@/lib/auth/config";
import { loadRemoteHub, type BootstrapResult, type HubVersionResult } from "@/lib/hub/bootstrap-remote";

export type { BootstrapResult, HubVersionResult };

export async function bootstrapHub(): Promise<BootstrapResult> {
  return loadRemoteHub();
}
