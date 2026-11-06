import "server-only";

import type { AssignmentSmsDeliveryStatus, AssignmentSmsKind, AssignmentSmsLog } from "../domain/types.ts";
import { putAssignmentSmsLog, updateAssignmentSmsLogByTwilioSid, patchAssignmentSmsLog } from "../data/assignment-sms-log-store.ts";
import type { SmsSendResult } from "../services/sms-types.ts";
import { lookupTwilioMessageStatus } from "../services/sms.ts";
import { mapTwilioMessageStatus } from "./assignment-sms-log-display.ts";

export {
  assignmentSmsKindLabel,
  assignmentSmsLogDelivery,
  assignmentSmsStatusLabel,
  mapTwilioMessageStatus,
} from "./assignment-sms-log-display.ts";

function bodyPreview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 237)}…`;
}

function newSmsLogId(): string {
  return `sms-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function recordAssignmentSmsLog(input: {
  assignmentId: string;
  jobId: string;
  cleanerId: string;
  kind: AssignmentSmsKind;
  toPhone: string;
  body: string;
  result: SmsSendResult;
  twilioStatus?: string;
  errorMessage?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const provider = input.result.provider;
  let status: AssignmentSmsDeliveryStatus =
    provider === "mock"
      ? "mock"
      : input.errorMessage
        ? "failed"
        : mapTwilioMessageStatus(input.twilioStatus);
  if (provider === "twilio" && input.result.confirmed && status !== "delivered") {
    status = status === "unknown" ? "sent" : status;
  }
  if (provider === "twilio" && input.result.confirmed === false && !input.errorMessage && status === "queued") {
    status = "queued";
  }

  const log: AssignmentSmsLog = {
    smsLogId: newSmsLogId(),
    assignmentId: input.assignmentId,
    jobId: input.jobId,
    cleanerId: input.cleanerId,
    kind: input.kind,
    toPhone: input.toPhone.replace(/\D/g, "").slice(-10),
    bodyPreview: bodyPreview(input.body),
    provider,
    twilioMessageSid: input.result.messageSid,
    status,
    errorMessage: input.errorMessage,
    sentAt: now,
    updatedAt: now,
  };
  await putAssignmentSmsLog(log);
}

const TERMINAL_SMS_STATUSES = new Set<AssignmentSmsDeliveryStatus>([
  "delivered",
  "failed",
  "undelivered",
  "mock",
]);

/** Pull latest delivery status from Twilio when logs are still in-flight. */
export async function syncAssignmentSmsLogsWithTwilio(logs: AssignmentSmsLog[]): Promise<AssignmentSmsLog[]> {
  const next: AssignmentSmsLog[] = [];
  for (const log of logs) {
    if (log.provider !== "twilio" || !log.twilioMessageSid || TERMINAL_SMS_STATUSES.has(log.status)) {
      next.push(log);
      continue;
    }
    const remote = await lookupTwilioMessageStatus(log.twilioMessageSid);
    if (!remote) {
      next.push(log);
      continue;
    }
    const status = mapTwilioMessageStatus(remote.status);
    if (status === log.status) {
      next.push(log);
      continue;
    }
    const updatedAt = new Date().toISOString();
    await patchAssignmentSmsLog(log, {
      status,
      updatedAt,
      errorMessage: remote.errorMessage,
    });
    next.push({
      ...log,
      status,
      updatedAt,
      errorMessage: remote.errorMessage ?? log.errorMessage,
    });
  }
  return next;
}

export async function applyTwilioDeliveryStatusUpdate(input: {
  twilioMessageSid: string;
  twilioStatus: string;
  errorMessage?: string;
}): Promise<boolean> {
  const status = mapTwilioMessageStatus(input.twilioStatus);
  return updateAssignmentSmsLogByTwilioSid({
    twilioMessageSid: input.twilioMessageSid,
    status,
    errorMessage: input.errorMessage,
    updatedAt: new Date().toISOString(),
  });
}
