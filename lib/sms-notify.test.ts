import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentSmsToast } from "./sms-notify.ts";

describe("assignmentSmsToast", () => {
  it("does not claim delivery when Twilio only queued the message", () => {
    const text = assignmentSmsToast("Keshawna", "Cleaning assigned.", {
      ok: true,
      provider: "twilio",
      confirmed: false,
    });
    assert.match(text, /not confirmed/i);
    assert.doesNotMatch(text, /Text sent to Keshawna/);
  });

  it("claims delivery only when Twilio confirmed", () => {
    const text = assignmentSmsToast("Keshawna", "Cleaning assigned.", {
      ok: true,
      provider: "twilio",
      confirmed: true,
    });
    assert.match(text, /Text sent to Keshawna/);
  });
});
