import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyHub } from "../mock/seed.ts";
import {
  buildNewCleanerProfile,
  validateCreateCleanerAccountInput,
} from "./create-cleaner-account.ts";

describe("create-cleaner-account", () => {
  it("rejects duplicate email on the team", () => {
    const hub = {
      ...emptyHub("2026-11-01"),
      cleaners: [
        buildNewCleanerProfile(
          {
            firstName: "Paige",
            lastName: "Thielbar",
            email: "paige@example.com",
            mobilePhone: "5035550100",
            typicalHelperCount: 0,
            maxHelperCount: 0,
            typicalHourlyRateCents: 3000,
          },
          "existing",
          "2026-01-01T00:00:00.000Z",
          "admin@example.com",
        ),
      ],
    };
    const result = validateCreateCleanerAccountInput(
      {
        firstName: "New",
        lastName: "Person",
        email: "paige@example.com",
        mobilePhone: "5035550199",
        typicalHelperCount: 0,
        maxHelperCount: 0,
        typicalHourlyRateCents: 3000,
      },
      hub,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.fieldErrors.email, "A cleaner with this email is already on the team.");
  });

  it("accepts valid input", () => {
    const hub = emptyHub("2026-11-01");
    const result = validateCreateCleanerAccountInput(
      {
        firstName: "Jennifer",
        lastName: "Stiles",
        email: "Jennifer@Example.COM",
        mobilePhone: "(503) 574-0595",
        typicalHelperCount: 0,
        maxHelperCount: 0,
        typicalHourlyRateCents: 3000,
      },
      hub,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.email, "jennifer@example.com");
    assert.equal(result.value.mobilePhone, "5035740595");
  });
});
