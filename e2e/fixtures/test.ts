import { test as base, expect } from "@playwright/test";
import { expectE2eSeedPresentInDynamo } from "../helpers/dynamo";

/**
 * Every e2e test asserts the Dynamo e2e table is reachable and seeded before UI steps.
 * Mutation specs add entity-specific expects via helpers in `e2e/helpers/dynamo.ts`.
 */
type E2eFixtures = {
  dynamoE2e: void;
};

export const test = base.extend<E2eFixtures>({
  dynamoE2e: [
    async ({}, use: (value: void) => Promise<void>) => {
      await expectE2eSeedPresentInDynamo();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
