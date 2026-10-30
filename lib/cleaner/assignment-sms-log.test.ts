import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentSmsLogDelivery, mapTwilioMessageStatus } from "./assignment-sms-log.ts";

describe("assignmentSmsLogDelivery", () => {
  it("keeps sent status pending until delivered", () => {
    const row = assignmentSmsLogDelivery({
      smsLogId: "1",
      assignmentId: "a",
      jobId: "j",
      cleanerId: "c",
      kind: "invite",
      toPhone: "5035550100",
      bodyPreview: "",
      provider: "twilio",
      status: "sent",
      sentAt: "2026-10-29T20:00:00.000Z",
      updatedAt: "2026-10-29T20:00:00.000Z",
    });
    assert.equal(row.received, "Pending");
    assert.equal(row.receivedAt, null);
  });

  it("treats delivered status as received with updatedAt", () => {
    const row = assignmentSmsLogDelivery({
      smsLogId: "1",
      assignmentId: "a",
      jobId: "j",
      cleanerId: "c",
      kind: "invite",
      toPhone: "5035550100",
      bodyPreview: "",
      provider: "twilio",
      status: "delivered",
      sentAt: "2026-10-29T20:00:00.000Z",
      updatedAt: "2026-10-29T20:01:00.000Z",
    });
    assert.equal(row.received, "Yes");
    assert.equal(row.receivedAt, "2026-10-29T20:01:00.000Z");
  });
});

describe("mapTwilioMessageStatus", () => {
  it("maps delivered and failure states", () => {
    assert.equal(mapTwilioMessageStatus("delivered"), "delivered");
    assert.equal(mapTwilioMessageStatus("sent"), "sent");
    assert.equal(mapTwilioMessageStatus("queued"), "queued");
    assert.equal(mapTwilioMessageStatus("undelivered"), "undelivered");
    assert.equal(mapTwilioMessageStatus("failed"), "failed");
  });
});
