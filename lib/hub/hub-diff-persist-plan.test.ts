import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHubDiffPersistPlan } from "./hub-diff-persist-plan.ts";
import { saveCustomerOnHub } from "./admin-hub-appliers.ts";
import { emptyHub } from "../mock/seed.ts";
import type { CustomerInput } from "../domain/customers.ts";

describe("buildHubDiffPersistPlan", () => {
  it("puts customer, properties, and search rows on save", () => {
    const before = emptyHub("2026-11-05");
    const input: CustomerInput = {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "5035550100",
      email: "ada@test.com",
      notes: "",
      properties: [
        {
          streetAddress: "123 Main St",
          city: "Portland",
          state: "OR",
          zip: "97201",
          bedrooms: 3,
          bathrooms: 2,
          squareFeet: 1800,
          preferences: "",
        },
      ],
    };
    const outcome = saveCustomerOnHub(before, input);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    const plan = buildHubDiffPersistPlan(before, outcome.hub);
    assert.ok(plan.puts.some((item) => item.entity === "customer"));
    assert.ok(plan.puts.some((item) => item.entity === "property"));
    assert.ok(plan.puts.some((item) => item.entity === "search"));
    assert.equal(plan.deletes.length, 0);
  });
});
