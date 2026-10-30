"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { previewAuthEnabled } from "@/lib/auth/config";
import { purgeAssignmentSmsLogsForRemovedAssignment } from "@/lib/cleaner/assignment-sms-log-retention";

export async function purgeAssignmentSmsLogsOnCleanerRemoval(
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (!previewAuthEnabled()) {
      await requireAdmin();
    }
    const trimmed = assignmentId.trim();
    if (!trimmed) return { ok: false, message: "Missing assignment." };
    await purgeAssignmentSmsLogsForRemovedAssignment(trimmed);
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    console.error("purgeAssignmentSmsLogsOnCleanerRemoval failed", error);
    return { ok: false, message: "Could not clear text history." };
  }
}
