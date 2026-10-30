import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mergeRecurringHorizon } from "../domain/recurrence.ts";
import { reconcileScheduleConflictWarnings } from "../domain/scheduling.ts";
import { todayInBusinessZone } from "../domain/time.ts";
import { emptyHub, type HubData } from "../mock/seed.ts";
import { hubToItems, itemsToHub, type DynamoItem } from "./items.ts";

const BATCH_SIZE = 25;
const HUB_META_PK = "HUB";
const HUB_META_SK = "META";

export function isHubMetaItem(item: { pk: string; sk: string; entity?: string }): boolean {
  return item.pk === HUB_META_PK && item.sk === HUB_META_SK;
}

/** Monotonic counter bumped on every hub write; cheap to read for background sync. */
export async function readHubRevision(): Promise<number> {
  const doc = client();
  const result = await doc.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: HUB_META_SK },
    }),
  );
  const revision = result.Item?.revision;
  return typeof revision === "number" && Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

async function bumpHubRevision(): Promise<number> {
  const doc = client();
  const now = new Date().toISOString();
  const result = await doc.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: HUB_META_SK },
      UpdateExpression: "ADD #revision :one SET entity = :entity, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#revision": "revision" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":entity": "hub_meta",
        ":updatedAt": now,
      },
      ReturnValues: "UPDATED_NEW",
    }),
  );
  const revision = result.Attributes?.revision;
  return typeof revision === "number" ? revision : 1;
}

export function dynamoConfigured(): boolean {
  return Boolean(process.env.DYNAMODB_TABLE_NAME);
}

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

function client(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
}

/** Load hub data from DynamoDB. Never writes mock seed data; use scripts/seed-cleaners.ts for cleaners. */
export async function loadHub(): Promise<HubData> {
  const items = await scanAll();
  const today = todayInBusinessZone();
  if (items.length === 0) {
    return emptyHub(today);
  }
  const data = itemsToHub(items, today);
  const generated = mergeRecurringHorizon({ ...data, today, nowIso: new Date().toISOString() });
  const assignments = reconcileScheduleConflictWarnings(generated.assignments, data.cleaners);
  const next = { ...data, today, series: generated.series, jobs: generated.jobs, assignments };
  const beforeById = new Map(generated.assignments.map((assignment) => [assignment.assignmentId, assignment]));
  const assignmentsReconciled = assignments.some((assignment) => {
    const before = beforeById.get(assignment.assignmentId);
    if (!before) return true;
    return before.status !== assignment.status || before.attentionReason !== assignment.attentionReason;
  });
  if (next.jobs.length !== data.jobs.length || next.assignments.length !== data.assignments.length || assignmentsReconciled) {
    await saveHub(next);
  }
  return next;
}

export async function putItems(items: DynamoItem[]): Promise<void> {
  if (items.length === 0) return;
  await writeBatches(items.map((item) => ({ PutRequest: { Item: item } })));
}

/** Remove every item in the table. Use before a clean seed. */
export async function clearTable(): Promise<number> {
  const existing = await scanAll();
  if (existing.length === 0) return 0;
  await writeBatches(existing.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })));
  return existing.length;
}

export async function saveHub(data: HubData): Promise<number> {
  const next = hubToItems(data);
  const existing = await scanAll();
  const nextKeys = new Set(next.map(itemKey));
  const stale = existing.filter(
    (item) =>
      item.entity &&
      !isHubMetaItem(item) &&
      item.entity !== "assignment_sms_log" &&
      !nextKeys.has(itemKey(item)),
  );
  await writeBatches([
    ...stale.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
    ...next.map((item) => ({ PutRequest: { Item: item } })),
  ]);
  return bumpHubRevision();
}

async function scanAll(): Promise<DynamoItem[]> {
  const doc = client();
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName(),
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function writeBatches(
  requests: Array<{ PutRequest: { Item: DynamoItem } } | { DeleteRequest: { Key: { pk: string; sk: string } } }>,
): Promise<void> {
  const doc = client();
  const name = tableName();
  for (let index = 0; index < requests.length; index += BATCH_SIZE) {
    let pending: typeof requests | undefined = requests.slice(index, index + BATCH_SIZE);
    let attempt = 0;
    while (pending && pending.length > 0) {
      const result = await doc.send(new BatchWriteCommand({ RequestItems: { [name]: pending } }));
      pending = result.UnprocessedItems?.[name] as typeof requests | undefined;
      attempt += 1;
      if (pending && pending.length > 0 && attempt > 3) {
        throw new Error("DynamoDB did not accept every write.");
      }
    }
  }
}

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}|${item.sk}`;
}
