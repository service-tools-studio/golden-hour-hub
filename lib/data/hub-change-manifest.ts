import "server-only";

import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDoc, dynamoTableName } from "./dynamo-client.ts";

const HUB_META_PK = "HUB";
const HUB_META_SK = "META";
const MAX_PARTITIONS = 64;

function tableName(): string {
  return dynamoTableName();
}

function doc() {
  return dynamoDoc();
}

export type HubChangeManifest = {
  revision: number;
  changedPartitions: string[];
};

export async function readHubChangeManifest(): Promise<HubChangeManifest> {
  const result = await doc().send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: HUB_META_SK },
    }),
  );
  const revision = result.Item?.revision;
  const changedPartitions = result.Item?.changedPartitions;
  return {
    revision:
      typeof revision === "number" && Number.isInteger(revision) && revision >= 0 ? revision : 0,
    changedPartitions: Array.isArray(changedPartitions)
      ? changedPartitions.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export function partitionKeysFromChanges(input: {
  puts: Array<{ pk: string }>;
  deletes: Array<{ pk: string }>;
}): string[] {
  const keys = new Set<string>();
  for (const item of input.puts) keys.add(item.pk);
  for (const item of input.deletes) keys.add(item.pk);
  return [...keys];
}

/** Append partition keys to HUB/META (ring buffer) as part of a revision bump. */
export async function appendHubChangeManifest(partitionKeys: string[]): Promise<void> {
  if (partitionKeys.length === 0) return;
  const current = await readHubChangeManifest();
  const merged = [...current.changedPartitions];
  for (const key of partitionKeys) {
    if (!merged.includes(key)) merged.push(key);
  }
  const trimmed = merged.slice(-MAX_PARTITIONS);
  await doc().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: HUB_META_PK, sk: HUB_META_SK },
      UpdateExpression: "SET entity = :entity, changedPartitions = :partitions",
      ExpressionAttributeValues: {
        ":entity": "hub_meta",
        ":partitions": trimmed,
      },
    }),
  );
}
