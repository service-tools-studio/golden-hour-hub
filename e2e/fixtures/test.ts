import { test as base, expect } from "@playwright/test";
import { expectE2eSeedPresentInDynamo } from "../helpers/dynamo";

/**
 * Every e2e test asserts the Dynamo e2e table is reachable and seeded before UI steps.
 * Mutation specs add entity-specific expects via helpers in `e2e/helpers/dynamo.ts`.
 */
export const test = base.extend({
  dynamoE2e: [
    async ({}, use) => {
      await expectE2eSeedPresentInDynamo();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
