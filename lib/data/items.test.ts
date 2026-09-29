import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSeed } from "../mock/seed.ts";
import { hubToItems, itemsToHub } from "./items.ts";

describe("DynamoDB item mapping", () => {
  it("stores helper authorization as maxHelperCount and round-trips the schedule", () => {
    const today = "2026-09-27";
    const data = buildSeed(today);
    const items = hubToItems(data);
    const claudia = items.find((item) => item.entity === "cleaner" && item.cleanerId === "claudia");
    assert.equal(claudia?.pk, "CLEANER#claudia");
    assert.equal(claudia?.maxHelperCount, 2);
    assert.equal(claudia?.typicalHelperCount, 1);
    assert.equal("helpersApproved" in (claudia ?? {}), false);
    assert.equal("typicalCrewSize" in (claudia ?? {}), false);

    const occur = items.find((item) => item.entity === "occur");
    assert.ok(occur);
    assert.match(String(occur?.sk), /^OCCUR#/);

    const restored = itemsToHub(items, today);
    assert.equal(restored.cleaners.find((cleaner) => cleaner.cleanerId === "claudia")?.maxHelperCount, 2);
    assert.equal(restored.jobs.length, data.jobs.length);
    assert.equal(restored.assignments.length, data.assignments.length);
    const dates = restored.jobs.filter((job) => job.seriesId).map((job) => `${job.seriesId}|${job.date}`);
    assert.equal(new Set(dates).size, dates.length);
  });

  it("reads an older helper flag as maxHelperCount", () => {
    const restored = itemsToHub(
      [
        {
          pk: "CLEANER#maria",
          sk: "PROFILE",
          entity: "cleaner",
          cleanerId: "maria",
          firstName: "Maria",
          lastName: "Santos",
          email: "maria@example.com",
          mobilePhone: "5035550101",
          status: "ACTIVE",
          helpersApproved: false,
          typicalHelperCount: 2,
          createdAt: "2026-09-01T00:00:00.000Z",
          createdBy: "kelsey",
          updatedAt: "2026-09-01T00:00:00.000Z",
          updatedBy: "kelsey",
        },
      ],
      "2026-09-27",
    );
    assert.equal(restored.cleaners[0].maxHelperCount, 0);
    assert.equal(restored.cleaners[0].typicalHelperCount, 0);
  });
});
