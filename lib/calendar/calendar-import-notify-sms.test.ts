import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminNewCalendarImportSms } from "./calendar-import-notify-sms.ts";

describe("adminNewCalendarImportSms", () => {
  it("uses singular copy for one import", () => {
    const body = adminNewCalendarImportSms({
      count: 1,
      marketIds: ["portland"],
      dashboardUrl: "https://hub.example/admin",
    });
    assert.match(body, /1 new Gmail job/);
    assert.match(body, /Market: Portland/);
    assert.match(body, /https:\/\/hub\.example\/admin/);
  });

  it("uses plural copy for multiple imports", () => {
    const body = adminNewCalendarImportSms({ count: 3, marketIds: ["portland", "portland", "phoenix"] });
    assert.match(body, /3 new Gmail jobs/);
    assert.match(body, /Markets: 2 Portland, 1 Phoenix/);
    assert.doesNotMatch(body, /https?:/);
  });
});