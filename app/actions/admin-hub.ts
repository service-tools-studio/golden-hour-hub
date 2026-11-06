"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { purgeStaleAssignmentSmsLogs } from "@/lib/cleaner/assignment-sms-log-retention";
import type { CustomerInput } from "@/lib/domain/customers";
import { dynamoConfigured } from "@/lib/data/repository";
import {
  addJobCleanerOnHub,
  deleteCustomerOnHub,
  deleteJobOnHub,
  deleteSeriesOnHub,
  markAssignmentNotifiedOnHub,
  moveAssignmentTimeOnHub,
  removeJobCleanerOnHub,
  saveCleanerDetailsOnHub,
  saveCustomerOnHub,
  saveSeriesOnHub,
  staffCleanerOnHub,
  undoDeleteCustomerOnHub,
  undoDeleteJobOnHub,
  updateJobOnHub,
  updateVisitOnHub,
} from "@/lib/hub/admin-hub-appliers";
import type {
  DeletedCustomerSnapshot,
  DeletedJobSnapshot,
  SaveCleanerDetailsInput,
  SaveSeriesInput,
  StaffCleanerInput,
  UpdateJobInput,
  UpdateVisitInput,
} from "@/lib/hub/admin-hub-types";
import { updateCleanerAdminOnHub, type UpdateCleanerAdminInput } from "@/lib/hub/admin-mutations";
import { persistHubMutation } from "@/lib/hub/persist-hub-mutation";
import type { HubData } from "@/lib/mock/seed";

export type AdminHubActionResult =
  | {
      ok: true;
      hub: HubData;
      revision: number;
      message?: string;
      customerId?: string;
      jobId?: string;
      assignmentId?: string;
    }
  | { ok: false; message: string };

async function persistAdminHubApplier(
  apply: (hub: HubData) => ReturnType<typeof saveCustomerOnHub>,
): Promise<AdminHubActionResult> {
  const saved = await persistHubMutation(apply);
  if (!saved.ok) return saved;
  try {
    await purgeStaleAssignmentSmsLogs(saved.hub);
  } catch (error) {
    console.error("purgeStaleAssignmentSmsLogs failed after admin hub mutation.", error);
  }
  const { ok: _savedOk, hub, revision, ...rest } = saved;
  return { ok: true, hub, revision, ...rest };
}

export async function saveCustomerAction(
  input: CustomerInput,
  customerId?: string,
): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => saveCustomerOnHub(hub, input, customerId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("saveCustomerAction failed.", error);
    return { ok: false, message: "Could not save this customer." };
  }
}

export async function deleteCustomerAction(customerId: string): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => deleteCustomerOnHub(hub, customerId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("deleteCustomerAction failed.", error);
    return { ok: false, message: "Could not delete this customer." };
  }
}

export async function undoDeleteCustomerAction(snapshot: DeletedCustomerSnapshot): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => undoDeleteCustomerOnHub(hub, snapshot));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("undoDeleteCustomerAction failed.", error);
    return { ok: false, message: "Could not restore this customer." };
  }
}

export async function saveSeriesAction(seriesId: string, input: SaveSeriesInput): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => saveSeriesOnHub(hub, seriesId, input));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("saveSeriesAction failed.", error);
    return { ok: false, message: "Could not save this recurring schedule." };
  }
}

export async function updateCleanerAdminAction(
  cleanerId: string,
  input: UpdateCleanerAdminInput,
): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    const saved = await persistHubMutation((hub) => {
      const outcome = updateCleanerAdminOnHub(hub, cleanerId, input);
      if (!outcome.result.ok) return { ok: false, message: outcome.result.message };
      return { ok: true, hub: outcome.hub };
    });
    if (!saved.ok) return saved;
    try {
      await purgeStaleAssignmentSmsLogs(saved.hub);
    } catch (error) {
      console.error("purgeStaleAssignmentSmsLogs failed after updateCleanerAdminAction.", error);
    }
    return { ok: true, hub: saved.hub, revision: saved.revision };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateCleanerAdminAction failed.", error);
    return { ok: false, message: "Could not update this cleaner." };
  }
}

export async function saveCleanerDetailsAction(input: SaveCleanerDetailsInput): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => saveCleanerDetailsOnHub(hub, input));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("saveCleanerDetailsAction failed.", error);
    return { ok: false, message: "Could not save cleaner details." };
  }
}

export async function staffCleanerAction(input: StaffCleanerInput): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => staffCleanerOnHub(hub, input));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("staffCleanerAction failed.", error);
    return { ok: false, message: "Could not staff this cleaning." };
  }
}

export async function addJobCleanerAction(jobId: string, cleanerId: string): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => addJobCleanerOnHub(hub, jobId, cleanerId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("addJobCleanerAction failed.", error);
    return { ok: false, message: "Could not add this cleaner." };
  }
}

export async function removeJobCleanerAction(jobId: string, cleanerId: string): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => removeJobCleanerOnHub(hub, jobId, cleanerId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("removeJobCleanerAction failed.", error);
    return { ok: false, message: "Could not remove this cleaner." };
  }
}

export async function updateVisitAction(input: UpdateVisitInput): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => updateVisitOnHub(hub, input));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateVisitAction failed.", error);
    return { ok: false, message: "Could not update this cleaning." };
  }
}

export async function updateJobAction(input: UpdateJobInput): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => updateJobOnHub(hub, input));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("updateJobAction failed.", error);
    return { ok: false, message: "Could not save this assignment." };
  }
}

export async function moveAssignmentTimeAction(
  assignmentId: string,
  arrivalWindowStart: string,
  arrivalWindowEnd: string,
): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => moveAssignmentTimeOnHub(hub, assignmentId, arrivalWindowStart, arrivalWindowEnd));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("moveAssignmentTimeAction failed.", error);
    return { ok: false, message: "Could not move this cleaning." };
  }
}

export async function markAssignmentNotifiedAction(assignmentId: string): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => markAssignmentNotifiedOnHub(hub, assignmentId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("markAssignmentNotifiedAction failed.", error);
    return { ok: false, message: "Could not update this assignment." };
  }
}

export async function deleteJobAction(jobId: string): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => deleteJobOnHub(hub, jobId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("deleteJobAction failed.", error);
    return { ok: false, message: "Could not delete this cleaning." };
  }
}

export async function undoDeleteJobAction(snapshot: DeletedJobSnapshot): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => undoDeleteJobOnHub(hub, snapshot));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("undoDeleteJobAction failed.", error);
    return { ok: false, message: "Could not restore this cleaning." };
  }
}

export async function deleteSeriesAction(seriesId: string): Promise<AdminHubActionResult> {
  try {
    await requireAdmin();
    if (!dynamoConfigured()) return { ok: false, message: "Hub is in preview mode." };
    return persistAdminHubApplier((hub) => deleteSeriesOnHub(hub, seriesId));
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("deleteSeriesAction failed.", error);
    return { ok: false, message: "Could not delete this recurring schedule." };
  }
}

export type {
  DeletedCustomerSnapshot,
  DeletedJobSnapshot,
  SaveCleanerDetailsInput,
  SaveSeriesInput,
  StaffCleanerInput,
  UpdateJobInput,
  UpdateVisitInput,
} from "@/lib/hub/admin-hub-types";
