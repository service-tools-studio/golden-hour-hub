import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanerMatchesAdminMarket,
  cleanerMatchesJobMarket,
  customerMatchesAdminMarket,
  jobMatchesAdminMarket,
} from "./markets.ts";

describe("admin market filter", () => {
  it("keeps every row on All", () => {
    assert.equal(jobMatchesAdminMarket({ snapshot: { marketId: "phoenix" } }, "all"), true);
    assert.equal(cleanerMatchesAdminMarket({ homeMarketId: "portland" }, "all"), true);
  });

  it("matches jobs and cleaners to the selected city", () => {
    assert.equal(jobMatchesAdminMarket({ snapshot: { marketId: "phoenix" } }, "phoenix"), true);
    assert.equal(jobMatchesAdminMarket({ snapshot: { marketId: "portland" } }, "phoenix"), false);
    assert.equal(cleanerMatchesAdminMarket({ homeMarketId: "phoenix" }, "phoenix"), true);
    assert.equal(cleanerMatchesAdminMarket({ homeMarketId: "portland" }, "phoenix"), false);
  });

  it("treats missing market as Portland", () => {
    assert.equal(jobMatchesAdminMarket({ snapshot: {} }, "portland"), true);
    assert.equal(jobMatchesAdminMarket({ snapshot: {} }, "phoenix"), false);
  });

  it("does not staff a cleaner onto a job in the other city", () => {
    assert.equal(cleanerMatchesJobMarket({ homeMarketId: "portland" }, "portland"), true);
    assert.equal(cleanerMatchesJobMarket({ homeMarketId: "portland" }, "phoenix"), false);
    assert.equal(cleanerMatchesJobMarket({ homeMarketId: "phoenix" }, "phoenix"), true);
  });

  it("matches customers who have a house in the selected city", () => {
    const properties = [
      { customerId: "ada", marketId: "portland" },
      { customerId: "bea", marketId: "phoenix" },
    ];
    assert.equal(customerMatchesAdminMarket("ada", properties, "portland"), true);
    assert.equal(customerMatchesAdminMarket("ada", properties, "phoenix"), false);
    assert.equal(customerMatchesAdminMarket("bea", properties, "all"), true);
  });
});
