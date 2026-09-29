import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { mergeRecurringHorizon } from "../domain/recurrence.ts";
import { todayInBusinessZone } from "../domain/time.ts";
import { buildSeed, type HubData } from "../mock/seed.ts";
import { hubToItems, itemsToHub, type DynamoItem } from "./items.ts";

const BATCH_SIZE = 25;

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

export async function loadHub(): Promise<HubData> {
  const items = await scanAll();
  const today = todayInBusinessZone();
  if (!items.some((item) => item.entity === "cleaner")) {
    const seeded = buildSeed(today);
    await saveHub(seeded);
    return seeded;
  }
  const data = itemsToHub(items, today);
  const generated = mergeRecurringHorizon({ ...data, today, nowIso: new Date().toISOString() });
  const next = { ...data, today, series: generated.series, jobs: generated.jobs, assignments: generated.assignments };
  if (next.jobs.length !== data.jobs.length || next.assignments.length !== data.assignments.length) {
    await saveHub(next);
  }
  return next;
}

export async function saveHub(data: HubData): Promise<void> {
  const next = hubToItems(data);
  const existing = await scanAll();
  const nextKeys = new Set(next.map(itemKey));
  const stale = existing.filter((item) => item.entity && !nextKeys.has(itemKey(item)));
  await writeBatches([
    ...stale.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })),
    ...next.map((item) => ({ PutRequest: { Item: item } })),
  ]);
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
