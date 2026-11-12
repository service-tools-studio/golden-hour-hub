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

export async function queryItemsByPk(pk: string, consistentRead = false): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: startKey,
        ConsistentRead: consistentRead,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

export async function queryPartitionSkPrefix(
  pk: string,
  skPrefix: string,
  consistentRead = false,
): Promise<DynamoItem[]> {
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": skPrefix },
        ExclusiveStartKey: startKey,
        ConsistentRead: consistentRead,
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
  const ids = new Set<string>();
  const gsiProfiles = await queryScheduleIndex("CUSTOMER#ALL");
  for (const item of gsiProfiles) {
    const id = readCustomerId(item);
    if (id) ids.add(id);
  }
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
export function readJobIdFromItem(item: DynamoItem): string | null {
  if (typeof item.jobId === "string" && item.jobId.length > 0) return item.jobId;
  if (typeof item.pk === "string" && item.pk.startsWith("JOB#")) return item.pk.slice("JOB#".length);
  if (typeof item.gsi2sk === "string") {
    const fromCustomerJob = /^JOB#[^#]+#(.+)$/.exec(item.gsi2sk);
    if (fromCustomerJob?.[1]) return fromCustomerJob[1];
  }
  if (typeof item.gsi1sk === "string" && item.gsi1sk.length > 0 && !item.gsi1sk.startsWith("JOB#")) {
    return item.gsi1sk;
  }
  return null;
}

/** Job ids from assignment rows indexed under each cleaner (includes far-future staffed visits). */
export async function discoverJobIdsFromCleaners(cleanerIds: string[]): Promise<string[]> {
  if (cleanerIds.length === 0) return [];
  const chunks = await mapWithConcurrency(cleanerIds, 16, (cleanerId) =>
    queryScheduleIndex(`CLEANER#${cleanerId}`),
  );
  const ids = new Set<string>();
  for (const items of chunks) {
    for (const item of items) {
      if (typeof item.jobId === "string" && item.jobId.length > 0) ids.add(item.jobId);
    }
  }
  return [...ids];
}

/** Every job id listed on RelationIndex for the given customers (full cleaning history). */
export async function discoverJobIdsForCustomers(customerIds: string[]): Promise<string[]> {
  if (customerIds.length === 0) return [];
  const chunks = await mapWithConcurrency(customerIds, 16, (customerId) =>
    queryRelationIndex(`CUSTOMER#${customerId}`, "JOB#"),
  );
  const ids = new Set<string>();
  for (const items of chunks) {
    for (const item of items) {
      const id = readJobIdFromItem(item);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

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
