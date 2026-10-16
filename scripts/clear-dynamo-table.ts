/**
 * Delete every row in the DynamoDB table (cleaners, jobs, customers, search keys, etc.).
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/clear-dynamo-table.ts
 */

import { clearTable, dynamoConfigured } from "../lib/data/repository.ts";

async function main() {
  if (!dynamoConfigured()) {
    console.error("Set DYNAMODB_TABLE_NAME in .env.local and try again.");
    process.exit(1);
  }
  const removed = await clearTable();
  console.log(`Deleted ${removed} items from ${process.env.DYNAMODB_TABLE_NAME}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
