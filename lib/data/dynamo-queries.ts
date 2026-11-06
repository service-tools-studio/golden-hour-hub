import "server-only";

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoItem } from "./items.ts";
import { dynamoDoc, dynamoTableName } from "./dynamo-client.ts";

export const SCHEDULE_INDEX = "ScheduleIndex";
export const RELATION_INDEX = "RelationIndex";

function tableName(): string {
  return dynamoTableName();
}

function doc() {
  return dynamoDoc();
}

export async function queryItemsByPk(pk: string): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function queryPartitionSkPrefix(pk: string, skPrefix: string): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": skPrefix },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function queryScheduleIndex(
  gsi1pk: string,
  skCondition?: { expression: string; values: Record<string, string> },
): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  const values: Record<string, string> = { ":gsi1pk": gsi1pk, ...(skCondition?.values ?? {}) };
  do {
    const page = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: SCHEDULE_INDEX,
        KeyConditionExpression: skCondition
          ? `gsi1pk = :gsi1pk AND ${skCondition.expression}`
          : "gsi1pk = :gsi1pk",
        ExpressionAttributeValues: values,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function queryRelationIndex(
  gsi2pk: string,
  skBeginsWith: string,
): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: RELATION_INDEX,
        KeyConditionExpression: "gsi2pk = :gsi2pk AND begins_with(gsi2sk, :prefix)",
        ExpressionAttributeValues: { ":gsi2pk": gsi2pk, ":prefix": skBeginsWith },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export function dedupeItemsByKey(items: DynamoItem[]): DynamoItem[] {
  const byKey = new Map<string, DynamoItem>();
  for (const item of items) {
    byKey.set(`${item.pk}|${item.sk}`, item);
  }
  return [...byKey.values()];
}

function readCustomerId(item: DynamoItem): string | null {
  if (typeof item.customerId === "string") return item.customerId;
  if (item.pk.startsWith("CUSTOMER#")) return item.pk.slice("CUSTOMER#".length);
  return null;
}

function readCustomerIdFromSearchRow(item: DynamoItem): string | null {
  const fromField = readCustomerId(item);
  if (fromField) return fromField;
  const sk = item.sk;
  if (typeof sk !== "string") return null;
  const hash = sk.lastIndexOf("#");
  if (hash <= 0) return null;
  const candidate = sk.slice(hash + 1);
  return candidate.length > 0 ? candidate : null;
}

export async function discoverCustomerIds(): Promise<string[]> {
  const gsiProfiles = await queryScheduleIndex("CUSTOMER#ALL");
  const ids = new Set<string>();
  for (const item of gsiProfiles) {
    const id = readCustomerId(item);
    if (id) ids.add(id);
  }
  if (ids.size > 0) return [...ids];
  const searchNameRows = await queryItemsByPk("SEARCH#NAME");
  for (const item of searchNameRows) {
    const id = readCustomerIdFromSearchRow(item);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** All customer PROFILE + PROPERTY rows via GSI, search index, and partition queries (no table scan). */
export async function queryAllCustomerPartitionItems(): Promise<DynamoItem[]> {
  const customerIds = await discoverCustomerIds();
  if (customerIds.length === 0) return [];
  const partitions = await mapWithConcurrency(customerIds, 32, (customerId) =>
    queryItemsByPk(`CUSTOMER#${customerId}`),
  );
  return dedupeItemsByKey(partitions.flat());
}

/** Job PROFILE rows indexed by service date (ScheduleIndex `JOBDATE#YYYY-MM-DD`). */
export async function queryJobProfilesInDateRange(startDate: string, endDate: string): Promise<DynamoItem[]> {
  const { eachDate } = await import("../domain/time.ts");
  const dates = eachDate(startDate, endDate);
  if (dates.length === 0) return [];
  const pages = await mapWithConcurrency(dates, 32, (date) => queryScheduleIndex(`JOBDATE#${date}`));
  return dedupeItemsByKey(
    pages.flat().filter(
      (item) =>
        item.sk === "PROFILE" &&
        (item.entity === "job" || (typeof item.pk === "string" && item.pk.startsWith("JOB#"))),
    ),
  );
}

/** Questionnaire submission rows from cleaner partitions (no table scan). */
export async function queryAllQuestionnaireSubmissionItems(cleanerProfileItems: DynamoItem[]): Promise<DynamoItem[]> {
  const cleanerIds = [
    ...new Set(
      cleanerProfileItems
        .filter((item) => item.entity === "cleaner")
        .map((item) => item.cleanerId)
        .filter((value): value is string => typeof value === "string"),
    ),
  ];
  if (cleanerIds.length === 0) return [];
  const partitions = await mapWithConcurrency(cleanerIds, 16, (cleanerId) =>
    queryPartitionSkPrefix(`CLEANER#${cleanerId}`, "BQSUB#"),
  );
  return partitions.flat().filter((item) => item.entity === "contractor_questionnaire_submission");
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
