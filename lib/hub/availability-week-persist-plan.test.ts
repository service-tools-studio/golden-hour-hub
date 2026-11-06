import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mondayOf } from "../domain/time.ts";
import type { AvailabilityWindow, CleanerProfile } from "../domain/types.ts";
import { emptyHub } from "../mock/seed.ts";
import { submitAvailabilityOnHub } from "./cleaner-mutations.ts";
import { buildAvailabilityWeekPersistPlan } from "./availability-week-persist-plan.ts";

const STAMP = "2026-10-01T12:00:00.000Z";

function testCleaner(cleanerId: string): CleanerProfile {
  return {
    cleanerId,
    firstName: "Ada",
    lastName: "Cleaner",
    email: `${cleanerId}@example.com`,
    mobilePhone: "5035550100",
    status: "ACTIVE",
    typicalHelperCount: 0,
    maxHelperCount: 0,
    typicalHourlyRateCents: 3000,
    createdAt: STAMP,
    createdBy: "kelsey",
    updatedAt: STAMP,
    updatedBy: "kelsey",
  };
}

describe("buildAvailabilityWeekPersistPlan", () => {
  it("only touches one cleaner's week availability rows", () => {
    const ada = "ada";
    const maria = "maria";
    const weekStart = mondayOf("2026-10-28");
    const weekEnd = "2026-11-03";
    const before = {
      ...emptyHub("2026-10-27"),
      cleaners: [testCleaner(ada), testCleaner(maria)],
      availability: [
        {
          availabilityId: "maria-old",
          cleanerId: maria,
          date: "2026-10-29",
          start: "09:00",
          end: "17:00",
        },
      ],
    };
    const { hub: after } = submitAvailabilityOnHub(before, ada, weekStart, [
      {
        availabilityId: "ada-new",
        cleanerId: ada,
        date: "2026-10-28",
        start: "08:00",
        end: "16:00",
      },
    ]);
    const plan = buildAvailabilityWeekPersistPlan({ before, after, cleanerId: ada, weekStart, weekEnd });
    assert.equal(plan.deletes.length, 0);
    assert.ok(plan.puts.some((item) => item.entity === "availability" && item.cleanerId === ada));
    assert.ok(plan.puts.some((item) => item.entity === "submission"));
    assert.ok(!plan.puts.some((item) => item.entity === "availability" && item.cleanerId === maria));
    assert.ok(!plan.deletes.some((item) => item.pk === `CLEANER#${maria}`));
  });

  it("deletes replaced week windows before putting new ones", () => {
    const cleanerId = "ada";
    const weekStart = mondayOf("2026-10-28");
    const weekEnd = "2026-11-03";
    const before = {
      ...emptyHub("2026-10-27"),
      cleaners: [testCleaner(cleanerId)],
      availability: [
        {
          availabilityId: "old-win",
          cleanerId,
          date: "2026-10-28",
          start: "07:00",
          end: "12:00",
        },
      ],
    };
    const { hub: after } = submitAvailabilityOnHub(before, cleanerId, weekStart, [
      {
        availabilityId: "new-win",
        cleanerId,
        date: "2026-10-28",
        start: "09:00",
        end: "17:00",
      },
    ]);
    const plan = buildAvailabilityWeekPersistPlan({ before, after, cleanerId, weekStart, weekEnd });
    assert.equal(plan.deletes.length, 1);
    assert.match(plan.deletes[0]?.sk ?? "", /old-win/);
    assert.ok(plan.puts.some((item) => item.sk.includes("new-win")));
  });

  it("does not delete and put the same availability key in one batch", () => {
    const cleanerId = "ada";
    const weekStart = mondayOf("2026-10-28");
    const weekEnd = "2026-11-03";
    const window: AvailabilityWindow = {
      availabilityId: "same-win",
      cleanerId,
      date: "2026-10-28",
      start: "08:00",
      end: "16:00",
    };
    const before = { ...emptyHub("2026-10-27"), cleaners: [testCleaner(cleanerId)], availability: [window] };
    const { hub: after } = submitAvailabilityOnHub(before, cleanerId, weekStart, [window]);
    const plan = buildAvailabilityWeekPersistPlan({ before, after, cleanerId, weekStart, weekEnd });
    const availKey = plan.puts.find((row) => row.entity === "availability");
    assert.ok(availKey);
    assert.equal(plan.deletes.length, 0);
  });
});
