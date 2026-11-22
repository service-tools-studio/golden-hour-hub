/**
 * Remove Gmail calendar import staging from Dynamo so the next Check Gmail run starts clean.
 *
 * Deletes:
 *   - All `calendar_import` rows (every status)
 *   - Hub `GCAL_WATCH` push channel state (cron re-registers on next watch job)
 *
 * By default also clears `googleCalendarEventId` on jobs (schedule rows stay; only the Gmail link is removed).
 *
 *   npm run dynamo:clear-calendar-sync -- --dry-run
 *   npm run dynamo:clear-calendar-sync
 *   npm run dynamo:clear-calendar-sync -- --keep-job-links
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoItem } from "../lib/data/items.ts";

const HUB_META_PK = "HUB";
const HUB_META_SK = "META";
const GCAL_WATCH_SK = "GCAL_WATCH";
const BATCH_SIZE = 25;

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function scanByEntity(entity: string): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
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
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

async function scanJobsWithGoogleLink(): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName(),
        FilterExpression: "entity = :job AND attribute_exists(googleCalendarEventId)",
        ExpressionAttributeValues: { ":job": "job" },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

type WriteRequest =
  | { PutRequest: { Item: Record<string, unknown> } }
  | { DeleteRequest: { Key: { pk: string; sk: string } } };

async function writeBatches(requests: WriteRequest[]): Promise<void> {
  const name = tableName();
  for (let index = 0; index < requests.length; index += BATCH_SIZE) {
    let pending = requests.slice(index, index + BATCH_SIZE);
    let attempt = 0;
    while (pending.length > 0) {
      const result = await doc.send(new BatchWriteCommand({ RequestItems: { [name]: pending } }));
      const unprocessed = result.UnprocessedItems?.[name] as WriteRequest[] | undefined;
      pending = unprocessed ?? [];
      attempt += 1;
      if (pending.length > 0 && attempt > 5) {
        throw new Error("DynamoDB did not accept every write.");
      }
    }
  }
}

async function bumpHubRevision(): Promise<number> {
  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: HUB_META_SK },
      UpdateExpression: "ADD #revision :one SET entity = :entity, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#revision": "revision" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":entity": "hub_meta",
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const revision = result.Attributes?.revision;
  return typeof revision === "number" ? revision : 1;
}

async function readWatchRow(): Promise<DynamoItem | null> {
  const result = await doc.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: GCAL_WATCH_SK },
    }),
  );
  return result.Item ? (result.Item as DynamoItem) : null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const keepJobLinks = process.argv.includes("--keep-job-links");

  if (dryRun) console.log("Dry run — no writes.\n");

  const imports = await scanByEntity("calendar_import");
  const watch = await readWatchRow();
  const linkedJobs = keepJobLinks ? [] : await scanJobsWithGoogleLink();

  console.log(`Found ${imports.length} calendar_import row(s).`);
  console.log(watch ? "Found GCAL_WATCH row." : "No GCAL_WATCH row.");
  if (!keepJobLinks) {
    console.log(`Found ${linkedJobs.length} job(s) with googleCalendarEventId.`);
  }

  const deletes: WriteRequest[] = imports.map((item) => ({
    DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
  }));
  if (watch) {
    deletes.push({ DeleteRequest: { Key: { pk: HUB_META_PK, sk: GCAL_WATCH_SK } } });
  }

  const puts: WriteRequest[] = [];
  if (!keepJobLinks) {
    const now = new Date().toISOString();
    for (const item of linkedJobs) {
      if (item.sk !== "PROFILE" || item.entity !== "job") continue;
      const { googleCalendarEventId: _removed, ...rest } = item;
      puts.push({
        PutRequest: {
          Item: {
            ...rest,
            updatedAt: now,
            updatedBy: "clear-calendar-sync",
          },
        },
      });
    }
  }

  if (deletes.length === 0 && puts.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  if (dryRun) {
    console.log(`Would delete ${deletes.length} item(s), update ${puts.length} job link(s).`);
    return;
  }

  await writeBatches([...deletes, ...puts]);
  const revision = await bumpHubRevision();

  console.log(`Deleted ${deletes.length} item(s).`);
  if (puts.length > 0) {
    console.log(`Cleared Gmail link on ${puts.length} job(s).`);
  }
  console.log(`Hub revision is now ${revision}. Run Check Gmail to re-import from Google Calendar.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});