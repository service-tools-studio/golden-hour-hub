import type { AssignmentSmsDeliveryStatus, AssignmentSmsKind, AssignmentSmsLog } from "../domain/types.ts";

export function assignmentSmsKindLabel(kind: AssignmentSmsKind): string {
  switch (kind) {
    case "invite":
      return "Invite";
    case "direct_assign":
      return "Assign";
    case "follow_up":
      return "Reminder";
    case "removal":
      return "Removal";
    case "start_time_update":
      return "Time update";
  }
}

/** Whether Twilio reported delivery and when (if known). Mock logs are not received. */
export function assignmentSmsLogDelivery(log: AssignmentSmsLog): {
  received: string;
  receivedAt: string | null;
} {
  switch (log.status) {
    case "delivered":
      if (!log.deliveryConfirmedAt) {
        return { received: "Pending", receivedAt: null };
      }
      return { received: "Yes", receivedAt: log.deliveryConfirmedAt };
    case "mock":
      return { received: "—", receivedAt: null };
    case "failed":
    case "undelivered":
      return { received: "No", receivedAt: null };
    case "sent":
    case "queued":
    case "unknown":
      return { received: "Pending", receivedAt: null };
  }
}

export function assignmentSmsStatusLabel(status: AssignmentSmsDeliveryStatus): string {
  switch (status) {
    case "mock":
      return "Logged (mock)";
    case "queued":
      return "Queued";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "undelivered":
      return "Undelivered";
    case "failed":
      return "Failed";
    case "unknown":
      return "Unknown";
  }
}

export function mapTwilioMessageStatus(raw: string | undefined): AssignmentSmsDeliveryStatus {
  const status = (raw ?? "").trim().toLowerCase();
  if (!status) return "unknown";
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "sent" || status === "receiving") return "sent";
  if (status === "queued" || status === "accepted" || status === "sending") return "queued";
  if (status === "undelivered") return "undelivered";
  if (status === "failed" || status === "canceled") return "failed";
  return "unknown";
}

/** When a message is first logged or refreshed via API poll — not delivery webhooks. */
export function mapTwilioMessageStatusWithoutDelivery(raw: string | undefined): AssignmentSmsDeliveryStatus {
  const status = mapTwilioMessageStatus(raw);
  return status === "delivered" ? "sent" : status;
}
