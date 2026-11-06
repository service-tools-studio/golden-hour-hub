import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoItem } from "./items.ts";

/** Full table scan — only for dev scripts (e.g. clear-dynamo-table). Not used in app routes. */
export async function scanEntireTable(): Promise<DynamoItem[]> {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const items: DynamoItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: name,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as DynamoItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}
