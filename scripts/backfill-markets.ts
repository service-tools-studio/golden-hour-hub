/**
 * Set Portland market on existing cleaner profiles, properties, and job snapshots.
 * Skips rows that already have a market. Does not infer timezone from city/state.
 *
 *   npm run dynamo:backfill-markets
 *   npm run dynamo:backfill-markets -- --dry-run
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_MARKET_ID, isMarketId, timeZoneForMarket } from "../lib/domain/markets.ts";

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
  marshallOptions: { removeUndefinedValues: true },
});

const MARKET_ID = DEFAULT_MARKET_ID;
const TIME_ZONE = timeZoneForMarket(MARKET_ID);

type Counts = { scanned: number; updated: number; skipped: number };

async function scanEntity(entity: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName(),
        FilterExpression: "entity = :entity",
        ExpressionAttributeValues: { ":entity": entity },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as Record<string, unknown>[]));
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

async function put(item: Record<string, unknown>, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  await doc.send(new PutCommand({ TableName: tableName(), Item: item }));
}

function alreadyHasMarket(value: unknown): boolean {
  return isMarketId(value);
}

async function backfillCleaners(dryRun: boolean): Promise<Counts> {
  const items = await scanEntity("cleaner");
  let updated = 0;
  let skipped = 0;
  for (const item of items) {
    if (alreadyHasMarket(item.homeMarketId)) {
      skipped += 1;
      continue;
    }
    await put({ ...item, homeMarketId: MARKET_ID }, dryRun);
    updated += 1;
  }
  return { scanned: items.length, updated, skipped };
}

async function backfillProperties(dryRun: boolean): Promise<Counts> {
  const items = await scanEntity("property");
  let updated = 0;
  let skipped = 0;
  for (const item of items) {
    if (alreadyHasMarket(item.marketId)) {
      skipped += 1;
      continue;
    }
    await put({ ...item, marketId: MARKET_ID }, dryRun);
    updated += 1;
  }
  return { scanned: items.length, updated, skipped };
}

async function backfillJobSnapshots(dryRun: boolean): Promise<Counts> {
  const items = await scanEntity("job");
  let updated = 0;
  let skipped = 0;
  for (const item of items) {
    const snapshot =
      item.snapshot && typeof item.snapshot === "object"
        ? (item.snapshot as Record<string, unknown>)
        : {};
    if (alreadyHasMarket(snapshot.marketId) && typeof snapshot.timeZone === "string" && snapshot.timeZone.length > 0) {
      skipped += 1;
      continue;
    }
    await put(
      {
        ...item,
        snapshot: {
          ...snapshot,
          marketId: alreadyHasMarket(snapshot.marketId) ? snapshot.marketId : MARKET_ID,
          timeZone:
            typeof snapshot.timeZone === "string" && snapshot.timeZone.length > 0 ? snapshot.timeZone : TIME_ZONE,
        },
      },
      dryRun,
    );
    updated += 1;
  }
  return { scanned: items.length, updated, skipped };
}

function logCounts(label: string, counts: Counts, dryRun: boolean): void {
  const verb = dryRun ? "would update" : "updated";
  console.log(
    `${label}: scanned ${counts.scanned}, ${verb} ${counts.updated}, already had market ${counts.skipped}`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("Dry run — no writes.");
  console.log(`Assigning market "${MARKET_ID}" (${TIME_ZONE}) to rows that are missing it.`);
  const cleaners = await backfillCleaners(dryRun);
  logCounts("Cleaners", cleaners, dryRun);
  const properties = await backfillProperties(dryRun);
  logCounts("Properties", properties, dryRun);
  const jobs = await backfillJobSnapshots(dryRun);
  logCounts("Job snapshots", jobs, dryRun);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
