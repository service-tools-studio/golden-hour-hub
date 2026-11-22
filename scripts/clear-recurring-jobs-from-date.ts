/**
 * Remove hub recurring *jobs* (and their assignments / occurrence locks) on or after a date.
 * Keeps RecurringSeries rows and cleanings before the cutoff.
 *
 *   npm run dynamo:clear-recurring-from-date -- --dry-run
 *   npm run dynamo:clear-recurring-from-date
 *   npm run dynamo:clear-recurring-from-date -- --from=2027-01-01
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { addDays } from "../lib/domain/time.ts";
import type { DynamoItem } from "../lib/data/items.ts";

const HUB_META_PK = "HUB";
const HUB_META_SK = "META";
const DEFAULT_FROM = "2027-01-01";
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

function parseFromArg(argv: string[]): string {
  const fromFlag = argv.find((arg) => arg.startsWith("--from="));
  const value = fromFlag?.slice("--from=".length).trim() ?? DEFAULT_FROM;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid --from date (use YYYY-MM-DD): ${value}`);
  }
  return value;
}

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

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const fromDate = parseFromArg(process.argv);
  if (dryRun) console.log("Dry run — no writes.\n");

  const seriesJobs = await scanJobsWithSeries();
  const occurRows = await scanByEntity("occur");
  const assignmentRows = await scanByEntity("assignment");
  const seriesRows = await scanByEntity("series");

  const jobsToRemove = seriesJobs.filter((item) => {
    if (item.sk !== "PROFILE" || item.entity !== "job") return false;
    const date = String(item.date ?? "");
    return date >= fromDate;
  });

  const removedJobIds = new Set(jobsToRemove.map((item) => String(item.jobId)));
  const jobDeletes: WriteRequest[] = jobsToRemove.map((item) => ({
    DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
  }));

  const occurDeletes = occurRows.filter((item) => {
    const date = String(item.date ?? item.sk?.toString().replace(/^OCCUR#/, "") ?? "");
    return date >= fromDate;
  });

  const assignmentDeletes = assignmentRows.filter((item) => removedJobIds.has(String(item.jobId)));

  const rewindThrough = addDays(fromDate, -1);
  const now = new Date().toISOString();
  const seriesUpdates: WriteRequest[] = [];
  for (const item of seriesRows) {
    if (item.sk !== "PROFILE" || item.entity !== "series") continue;
    const generatedThroughDate = String(item.generatedThroughDate ?? "");
    if (generatedThroughDate < fromDate) continue;
    seriesUpdates.push({
      PutRequest: {
        Item: {
          ...item,
          generatedThroughDate: rewindThrough,
          updatedAt: now,
          updatedBy: "clear-recurring-from-date",
        },
      },
    });
  }

  const deletes: WriteRequest[] = [
    ...jobDeletes,
    ...occurDeletes.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
    ...assignmentDeletes.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
  ];

  console.log(`Cutoff date: ${fromDate} (inclusive)`);
  console.log(
    `Recurring jobs to delete: ${jobsToRemove.length}` +
      (jobsToRemove.length > 0
        ? ` (e.g. ${jobsToRemove
            .slice(0, 3)
            .map((item) => `${item.jobId} @ ${item.date}`)
            .join(", ")})`
        : ""),
  );
  console.log(`Occurrence locks: ${occurDeletes.length}`);
  console.log(`Assignments: ${assignmentDeletes.length}`);
  console.log(`Series metadata rows to rewind generatedThroughDate → ${rewindThrough}: ${seriesUpdates.length}`);

  if (deletes.length === 0 && seriesUpdates.length === 0) {
    console.log("Nothing to clear.");
    return;
  }

  if (dryRun) {
    console.log(`Would delete ${deletes.length} item(s), update ${seriesUpdates.length} series row(s).`);
    return;
  }

  await writeBatches([...deletes, ...seriesUpdates]);
  const revision = await bumpHubRevision();
  console.log(`Deleted ${deletes.length} item(s), updated ${seriesUpdates.length} series row(s). Hub revision is now ${revision}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});