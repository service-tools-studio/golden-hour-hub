import { test, expect } from "./fixtures/test";
import { E2E } from "./fixtures/ids";
import { enterPreviewCleaner } from "./helpers/admin";
import { expectCleanerPersistedInDynamo } from "./helpers/dynamo";

test.describe("cleaner preview", () => {
  test("Portland cleaner loads home", async ({ page }) => {
    await enterPreviewCleaner(page, E2E.labels.portlandCleaner);
    await expect(page.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Availability", exact: true })).toBeVisible();
    await expectCleanerPersistedInDynamo(E2E.cleanerPortland, { homeMarketId: "portland", firstName: "Ada" });
  });
});
