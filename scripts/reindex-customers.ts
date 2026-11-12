/**
 * Backfill CUSTOMER#ALL GSI keys and SEARCH#NAME rows from customer PROFILE partitions.
 * Use when customers exist in Dynamo but do not appear in admin search (legacy imports).
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/reindex-customers.ts
 */

import { buildCustomerSearchKeys } from "../lib/domain/customers.ts";
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

async function queryScheduleIndex(gsi1pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: "ScheduleIndex",
        KeyConditionExpression: "gsi1pk = :gsi1pk",
        ExpressionAttributeValues: { ":gsi1pk": gsi1pk },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function queryPk(pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

function readCustomerIdFromSearchSk(sk: string): string | null {
  const hash = sk.lastIndexOf("#");
  if (hash <= 0) return null;
  const candidate = sk.slice(hash + 1);
  return candidate.length > 0 ? candidate : null;
}

async function discoverCustomerIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const item of await queryScheduleIndex("CUSTOMER#ALL")) {
    if (typeof item.customerId === "string") ids.add(item.customerId);
    else if (typeof item.pk === "string" && item.pk.startsWith("CUSTOMER#")) {
      ids.add(item.pk.slice("CUSTOMER#".length));
    }
  }
  for (const item of await queryPk("SEARCH#NAME")) {
    if (typeof item.customerId === "string") ids.add(item.customerId);
    else if (typeof item.sk === "string") {
      const id = readCustomerIdFromSearchSk(item.sk);
      if (id) ids.add(id);
    }
  }
  return ids;
}

async function main(): Promise<void> {
  const customerIds = await discoverCustomerIds();
  for (const arg of process.argv.slice(2)) {
    const id = arg.trim();
    if (id) customerIds.add(id);
  }
  const searchNameRows = await queryPk("SEARCH#NAME");
  const customersWithNameSearch = new Set<string>();
  for (const row of searchNameRows) {
    if (typeof row.customerId === "string") customersWithNameSearch.add(row.customerId);
    else if (typeof row.sk === "string") {
      const id = readCustomerIdFromSearchSk(row.sk);
      if (id) customersWithNameSearch.add(id);
    }
  }

  console.log(`Reindexing ${customerIds.size} customer(s).`);
  let gsiUpdated = 0;
  let searchWritten = 0;

  for (const customerId of customerIds) {
    const partition = await queryPk(`CUSTOMER#${customerId}`);
    const profile = partition.find((item) => item.sk === "PROFILE" && item.entity === "customer");
    if (!profile) continue;

    const firstName = String(profile.firstName ?? "");
    const lastName = String(profile.lastName ?? "");
    const phone = String(profile.phone ?? "");

    if (profile.gsi1pk !== "CUSTOMER#ALL") {
      await doc.send(
        new PutCommand({
          TableName: tableName(),
          Item: {
            ...profile,
            gsi1pk: "CUSTOMER#ALL",
            gsi1sk: `${lastName.toLowerCase()}#${firstName.toLowerCase()}#${customerId}`,
          },
        }),
      );
      gsiUpdated += 1;
    }

    const hasNameSearch = customersWithNameSearch.has(customerId);
    if (!hasNameSearch) {
      const keys = buildCustomerSearchKeys({ firstName, lastName, phone });
      for (const name of keys.nameKeys) {
        await doc.send(
          new PutCommand({
            TableName: tableName(),
            Item: {
              pk: "SEARCH#NAME",
              sk: `${name}#${customerId}`,
              entity: "search",
              customerId,
            },
          }),
        );
        searchWritten += 1;
      }
    }
  }

  console.log(`Updated ${gsiUpdated} PROFILE row(s) with CUSTOMER#ALL GSI keys.`);
  console.log(`Wrote ${searchWritten} SEARCH#NAME row(s).`);
  console.log(
    "If a customer still does not appear, load their partition CUSTOMER#<id> and confirm PROFILE + at least one PROPERTY exist.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
