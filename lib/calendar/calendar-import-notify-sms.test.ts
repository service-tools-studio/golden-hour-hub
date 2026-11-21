import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminNewCalendarImportSms } from "./calendar-import-notify-sms.ts";

describe("adminNewCalendarImportSms", () => {
  it("uses singular copy for one import", () => {
    const body = adminNewCalendarImportSms({ count: 1, dashboardUrl: "https://hub.example/admin" });
    assert.match(body, /1 new Gmail job/);
    assert.match(body, /https:\/\/hub\.example\/admin/);
  });

  it("uses plural copy for multiple imports", () => {
    const body = adminNewCalendarImportSms({ count: 3 });
    assert.match(body, /3 new Gmail jobs/);
    assert.doesNotMatch(body, /https?:/);
  });
});