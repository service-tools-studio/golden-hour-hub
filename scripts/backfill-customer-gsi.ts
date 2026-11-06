/**
 * Set ScheduleIndex keys on existing customer PROFILE rows (CUSTOMER#ALL listing GSI).
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/backfill-customer-gsi.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
  marshallOptions: { removeUndefinedValues: true },
});

async function customerIdsFromSearch(): Promise<string[]> {
  const ids = new Set<string>();
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "SEARCH#NAME" },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (typeof item.customerId === "string") ids.add(item.customerId);
      else if (typeof item.sk === "string") {
        const hash = item.sk.lastIndexOf("#");
        if (hash > 0) ids.add(item.sk.slice(hash + 1));
      }
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return [...ids];
}

async function main(): Promise<void> {
  const customerIds = await customerIdsFromSearch();
  console.log(`Found ${customerIds.length} customer id(s) from SEARCH#NAME.`);
  let updated = 0;
  for (const customerId of customerIds) {
    const profile = await doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk AND sk = :sk",
        ExpressionAttributeValues: { ":pk": `CUSTOMER#${customerId}`, ":sk": "PROFILE" },
      }),
    );
    const item = profile.Items?.[0];
    if (!item || item.entity !== "customer") continue;
    if (item.gsi1pk === "CUSTOMER#ALL") continue;
    const firstName = String(item.firstName ?? "");
    const lastName = String(item.lastName ?? "");
    await doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          ...item,
          gsi1pk: "CUSTOMER#ALL",
          gsi1sk: `${lastName.toLowerCase()}#${firstName.toLowerCase()}#${customerId}`,
        },
      }),
    );
    updated += 1;
  }
  console.log(`Updated ${updated} customer PROFILE row(s) with CUSTOMER#ALL GSI keys.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
