/**
 * Remove hub-managed recurring schedules from Dynamo (Gmail is the source for repeat visits).
 *
 *   npm run dynamo:clear-recurring -- --dry-run
 *   npm run dynamo:clear-recurring
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { todayInBusinessZone } from "../lib/domain/time.ts";
import { isGeneratedSeriesJobId } from "../lib/hub/remove-recurring-schedules.ts";
import type { DynamoItem } from "../lib/data/items.ts";

const HUB_META_PK = "HUB";
const HUB_META_SK = "META";
const BATCH_SIZE = 25;

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
  marshallOptions: { removeUndefinedValues: true },
});

type WriteRequest =
  | { PutRequest: { Item: Record<string, unknown> } }
  | { DeleteRequest: { Key: { pk: string; sk: string } } };

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

async function scanJobsWithSeries(): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName(),
        FilterExpression: "entity = :job AND attribute_exists(seriesId)",
        ExpressionAttributeValues: { ":job": "job" },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

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

async function readToday(): Promise<string> {
  const result = await doc.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: HUB_META_SK },
    }),
  );
  const fromMeta = result.Item?.today;
  if (typeof fromMeta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromMeta)) return fromMeta;
  return todayInBusinessZone();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("Dry run — no writes.\n");

  const today = await readToday();
  const seriesRows = await scanByEntity("series");
  const occurRows = await scanByEntity("occur");
  const seriesJobs = await scanJobsWithSeries();

  const jobDeletes: WriteRequest[] = [];
  const jobUpdates: WriteRequest[] = [];
  const now = new Date().toISOString();

  for (const item of seriesJobs) {
    if (item.sk !== "PROFILE" || item.entity !== "job") continue;
    const jobId = String(item.jobId ?? "");
    const seriesId = String(item.seriesId ?? "");
    const date = String(item.date ?? "");
    if (!jobId || !seriesId || !date) continue;
    const remove =
      isGeneratedSeriesJobId({ jobId, seriesId, date }) || (date >= today && item.status !== "CANCELED");
    if (remove) {
      jobDeletes.push({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } });
      continue;
    }
    const { seriesId: _removed, ...rest } = item;
    jobUpdates.push({
      PutRequest: {
        Item: {
          ...rest,
          updatedAt: now,
          updatedBy: "clear-recurring",
        },
      },
    });
  }

  const deletes: WriteRequest[] = [
    ...seriesRows.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
    ...occurRows.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
    ...jobDeletes,
  ];

  console.log(`Today (hub): ${today}`);
  console.log(`Found ${seriesRows.length} recurring series, ${occurRows.length} occurrence lock(s).`);
  console.log(
    `Found ${seriesJobs.length} job(s) with seriesId — delete ${jobDeletes.length}, strip seriesId on ${jobUpdates.length}.`,
  );

  if (deletes.length === 0 && jobUpdates.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  if (dryRun) {
    console.log(`Would delete ${deletes.length} item(s), update ${jobUpdates.length} past job(s).`);
    return;
  }

  await writeBatches([...deletes, ...jobUpdates]);
  const revision = await bumpHubRevision();
  console.log(`Deleted ${deletes.length} item(s), updated ${jobUpdates.length} job(s). Hub revision is now ${revision}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});