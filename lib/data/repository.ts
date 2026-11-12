import "server-only";

import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { buildHubDiffPersistPlan } from "../hub/hub-diff-persist-plan.ts";
import { todayInBusinessZone } from "../domain/time.ts";
import type { HubData } from "../mock/seed.ts";
import type { CleanerProfile } from "../domain/types.ts";
import type { ContractorQuestionnaireSubmissionRecord } from "../domain/contractor-questionnaire-submission.ts";
import {
  appendHubChangeManifest,
  partitionKeysFromChanges,
} from "./hub-change-manifest.ts";
import { dynamoConfigured } from "./dynamo-config.ts";
import { dynamoDoc, dynamoTableName } from "./dynamo-client.ts";
import { queryItemsByPk } from "./dynamo-queries.ts";
import {
  cleanerToItem,
  contractorQuestionnaireSubmissionToItem,
  itemsToHub,
  readCleanerProfileFromItem,
  type DynamoItem,
} from "./items.ts";

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

async function bumpHubRevision(partitionKeys: string[] = []): Promise<number> {
  if (partitionKeys.length > 0) {
    await appendHubChangeManifest(partitionKeys);
  }
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

export { dynamoConfigured } from "./dynamo-config.ts";

function tableName(): string {
  return dynamoTableName();
}

function client(): DynamoDBDocumentClient {
  return dynamoDoc();
}

export type LoadHubOptions = {
  persistReconciliation?: boolean;
};

/** Load hub data from DynamoDB. Reconcile persist is opt-in (`persistReconciliation: true`) so loads never delete Dynamo rows by default. */
export async function loadHub(options: LoadHubOptions = {}): Promise<HubData> {
  const { loadAdminHubSlices } = await import("./load-admin-hub.ts");
  return loadAdminHubSlices(options);
}

/** @deprecated Prefer loadAdminHubSlices; kept for callers that expect a full reconcile pass with persist. */
export async function loadHubWithReconcilePersist(): Promise<HubData> {
  return loadHub({ persistReconciliation: true });
}

/** Read one cleaning and its assignments plus one cleaner profile (no table scan). */
export async function loadHubForJobStaffing(jobId: string, cleanerId: string): Promise<HubData | null> {
  const today = todayInBusinessZone();
  const jobItems = await queryItemsByPk(`JOB#${jobId}`);
  const profile = jobItems.find((item) => item.sk === "PROFILE" && item.entity === "job");
  if (!profile) return null;
  const cleaner = await loadCleanerProfile(cleanerId);
  if (!cleaner) return null;
  return itemsToHub([...jobItems, cleanerToItem(cleaner)], today);
}

export async function putItems(items: DynamoItem[]): Promise<number> {
  if (items.length === 0) return readHubRevision();
  await putItemsWithoutRevision(items);
  return bumpHubRevision([...new Set(items.map((item) => item.pk))]);
}

/** Put rows without bumping hub revision (caller will bump once). */
async function putItemsWithoutRevision(items: DynamoItem[]): Promise<void> {
  if (items.length === 0) return;
  await writeBatches(items.map((item) => ({ PutRequest: { Item: item } })));
}

/** Read a single cleaner PROFILE row (no full-table scan). */
export async function loadCleanerProfile(cleanerId: string): Promise<CleanerProfile | null> {
  const doc = client();
  const result = await doc.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: `CLEANER#${cleanerId}`, sk: "PROFILE" },
    }),
  );
  if (!result.Item || result.Item.entity !== "cleaner") return null;
  return readCleanerProfileFromItem(result.Item as DynamoItem);
}

/** Persist one cleaner profile and bump hub revision (for autosave-sized writes). */
export async function persistCleanerProfile(cleaner: CleanerProfile): Promise<number> {
  return putItems([cleanerToItem(cleaner)]);
}

/** Remove a cleaner PROFILE row (rollback or admin delete). Does not remove availability or assignments. */
export async function deleteCleanerProfile(cleanerId: string): Promise<number> {
  const doc = client();
  await doc.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: `CLEANER#${cleanerId}`, sk: "PROFILE" },
    }),
  );
  return bumpHubRevision([`CLEANER#${cleanerId}`]);
}

/** Persist cleaner questionnaire submit: profile + append-only submission row. */
export async function persistCleanerQuestionnaireSubmit(
  cleaner: CleanerProfile,
  submission: ContractorQuestionnaireSubmissionRecord,
): Promise<number> {
  const items = [cleanerToItem(cleaner), contractorQuestionnaireSubmissionToItem(submission)];
  await putItemsWithoutRevision(items);
  return bumpHubRevision([...new Set(items.map((item) => item.pk))]);
}

/** Remove every item in the table. Uses a table scan — scripts/dev only. */
export async function clearTable(): Promise<number> {
  const { scanEntireTable } = await import("./dynamo-scan-dev.ts");
  const existing = await scanEntireTable();
  if (existing.length === 0) return 0;
  await writeBatches(existing.map((item) => ({ DeleteRequest: { Key: { pk: item.pk, sk: item.sk } } })));
  return existing.length;
}

/** @deprecated Use persistHubDataDiff or writeHubItemChanges instead. */
export async function saveHub(after: HubData, before: HubData): Promise<number> {
  const plan = buildHubDiffPersistPlan(before, after);
  if (plan.puts.length === 0 && plan.deletes.length === 0) {
    return readHubRevision();
  }
  const expectedRevision = await readHubRevision();
  const saved = await writeHubItemChanges(plan, expectedRevision);
  if (!saved.ok) {
    throw new Error("Hub revision conflict during saveHub.");
  }
  return saved.revision;
}

export type SaveHubRevisionResult =
  | { ok: true; revision: number }
  | { ok: false; kind: "conflict"; revision: number; hub: HubData };

export type HubItemChangesResult = { ok: true; revision: number } | { ok: false; kind: "conflict"; revision: number };

/** Targeted puts/deletes with revision check (does not scan/delete unrelated hub rows). */
export async function writeHubItemChanges(
  plan: { puts: DynamoItem[]; deletes: Array<{ pk: string; sk: string }> },
  expectedRevision: number,
): Promise<HubItemChangesResult> {
  const current = await readHubRevision();
  if (current !== expectedRevision) {
    return { ok: false, kind: "conflict", revision: current };
  }

  const putsByKey = new Map<string, DynamoItem>();
  for (const item of plan.puts) {
    putsByKey.set(itemKey(item), item);
  }
  const putKeys = new Set(putsByKey.keys());
  const deletesByKey = new Map<string, { pk: string; sk: string }>();
  for (const key of plan.deletes) {
    const id = itemKey(key);
    if (putKeys.has(id)) continue;
    deletesByKey.set(id, key);
  }
  const deletes = [...deletesByKey.values()];

  const requests: Array<{ PutRequest: { Item: DynamoItem } } | { DeleteRequest: { Key: { pk: string; sk: string } } }> =
    [
      ...deletes.map((key) => ({ DeleteRequest: { Key: key } })),
      ...[...putsByKey.values()].map((item) => ({ PutRequest: { Item: item } })),
    ];
  if (requests.length > 0) {
    await writeBatches(requests);
  }
  const revision = await bumpHubRevision(partitionKeysFromChanges(plan));
  return { ok: true, revision };
}

/** Save only when hub revision still matches what the caller loaded. */
export async function saveHubIfRevision(before: HubData, after: HubData, expectedRevision: number): Promise<SaveHubRevisionResult> {
  const current = await readHubRevision();
  if (current !== expectedRevision) {
    const hub = await loadHub({ persistReconciliation: false });
    return { ok: false, kind: "conflict", revision: current, hub };
  }
  const plan = buildHubDiffPersistPlan(before, after);
  if (plan.puts.length === 0 && plan.deletes.length === 0) {
    return { ok: true, revision: expectedRevision };
  }
  const saved = await writeHubItemChanges(plan, expectedRevision);
  if (saved.ok) {
    return { ok: true, revision: saved.revision };
  }
  const hub = await loadHub({ persistReconciliation: false });
  return { ok: false, kind: "conflict", revision: saved.revision, hub };
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
