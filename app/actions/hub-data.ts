"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { loadAdminHubCustomerDetailSlice, loadAdminHubJobsInDateRange } from "@/lib/data/load-admin-hub";
import { dynamoConfigured } from "@/lib/data/repository";
import { addDays, isValidDate, scheduleLookbackStart, todayInBusinessZone } from "@/lib/domain/time";
import { loadRemoteHub, loadRemoteHubAdminSupplement, type BootstrapResult, type HubVersionResult } from "@/lib/hub/bootstrap-remote";
import { emptyHub, type HubData } from "@/lib/mock/seed";

export type { BootstrapResult, HubVersionResult };

export async function bootstrapHub(): Promise<BootstrapResult> {
  return loadRemoteHub();
}

export async function bootstrapAdminHubSupplement(): Promise<
  { ok: false; message: string } | { source: "preview" } | { ok: true; data: HubData }
> {
  return loadRemoteHubAdminSupplement();
}

export async function loadCustomerDetailAction(
  customerId: string,
): Promise<{ ok: true; data: HubData } | { ok: false; message: string } | { source: "preview" }> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { source: "preview" };
    if (!customerId.trim()) return { ok: false, message: "That customer could not be found." };
    const data = await loadAdminHubCustomerDetailSlice(customerId.trim());
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("loadCustomerDetailAction failed.", error);
    return { ok: false, message: "Could not load this customer's cleanings." };
  }
}

export async function loadScheduleJobsRangeAction(
  startDate: string,
  endDate: string,
): Promise<{ ok: true; data: HubData } | { ok: false; message: string }> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) {
      return { ok: true, data: emptyHub(todayInBusinessZone()) };
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return { ok: false, message: "Invalid schedule date range." };
    }
    const today = todayInBusinessZone();
    const minStart = scheduleLookbackStart(today);
    const maxEnd = addDays(today, -1);
    const start = startDate < minStart ? minStart : startDate;
    const end = endDate > maxEnd ? maxEnd : endDate;
    if (start > end) return { ok: true, data: emptyHub(today) };
    const data = await loadAdminHubJobsInDateRange(start, end);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("loadScheduleJobsRangeAction failed.", error);
    return { ok: false, message: "Could not load past schedule." };
  }
}
