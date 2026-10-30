"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { listAssignmentSmsLogs } from "@/lib/data/assignment-sms-log-store";
import { syncAssignmentSmsLogsWithTwilio } from "@/lib/cleaner/assignment-sms-log";
import type { AssignmentSmsLog } from "@/lib/domain/types";

export async function fetchAssignmentSmsLogs(
  assignmentId: string,
): Promise<{ ok: true; logs: AssignmentSmsLog[] } | { ok: false; message: string }> {
  try {
    await requireAdmin();
    if (!assignmentId.trim()) return { ok: false, message: "Missing assignment." };
    const logs = await syncAssignmentSmsLogsWithTwilio(await listAssignmentSmsLogs(assignmentId.trim()));
    return { ok: true, logs };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("fetchAssignmentSmsLogs failed", error);
    return { ok: false, message: "Could not load text history." };
  }
}
