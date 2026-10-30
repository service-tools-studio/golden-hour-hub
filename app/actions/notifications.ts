"use server";

import { AuthError, requireAdmin } from "@/lib/auth/guards";
import { recordAssignmentSmsLog } from "@/lib/cleaner/assignment-sms-log";
import { cleanerAllowsSchedulingSms } from "@/lib/cleaner/sms-consent";
import { dynamoConfigured, loadHub } from "@/lib/data/repository";
import type { AssignmentSmsKind } from "@/lib/domain/types";
import type { CleanerTextResult } from "@/lib/sms-notify";
import { SmsDeliveryError, sendSms } from "@/lib/services/sms";

export type AssignmentSmsLogInput = {
  assignmentId: string;
  jobId: string;
  kind: AssignmentSmsKind;
};

export async function sendCleanerText(
  to: string,
  body: string,
  options?: { cleanerId?: string; assignmentLog?: AssignmentSmsLogInput },
): Promise<CleanerTextResult> {
  const logContext = options?.assignmentLog;
  const cleanerId = options?.cleanerId;
  try {
    await requireAdmin();
    if (cleanerId && dynamoConfigured()) {
      const hub = await loadHub();
      const cleaner = hub.cleaners.find((item) => item.cleanerId === cleanerId);
      if (cleaner && !cleanerAllowsSchedulingSms(cleaner)) {
        return { ok: false, message: `${cleaner.firstName} has not opted in to SMS notifications.` };
      }
    }
    if (!/^\d{10}$/.test(to)) return { ok: false, message: "This cleaner has no mobile number on file." };
    const result = await sendSms({ to, body });
    if (logContext && cleanerId) {
      await recordAssignmentSmsLog({
        assignmentId: logContext.assignmentId,
        jobId: logContext.jobId,
        cleanerId,
        kind: logContext.kind,
        toPhone: to,
        body,
        result,
        twilioStatus: result.twilioStatus,
      });
    }
    return {
      ok: true,
      provider: result.provider,
      confirmed: result.provider === "twilio" && result.confirmed === true,
    };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, message: error.message };
    const message =
      error instanceof SmsDeliveryError ? error.userMessage : "The text could not be sent. Please try again.";
    if (logContext && cleanerId) {
      try {
        await recordAssignmentSmsLog({
          assignmentId: logContext.assignmentId,
          jobId: logContext.jobId,
          cleanerId,
          kind: logContext.kind,
          toPhone: to,
          body,
          result: { provider: "twilio", confirmed: false },
          errorMessage: message,
        });
      } catch (logError) {
        console.error("assignment sms log failed", logError);
      }
    }
    console.error(error);
    return { ok: false, message };
  }
}
