/**
 * Set ScheduleIndex / RelationIndex keys on job PROFILE rows (hub lists all jobs per customer on GSI2).
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/backfill-job-gsi.ts job-1794525842040
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

async function main(): Promise<void> {
  const args = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
  const jobIds = args.length > 0 ? args : [];
  if (jobIds.length === 0) {
    console.error("Pass at least one jobId (e.g. job-1794525842040).");
    process.exit(1);
  }

  let updated = 0;
  for (const jobId of jobIds) {
    const partition = await queryPk(`JOB#${jobId}`);
    const profile = partition.find((item) => item.sk === "PROFILE" && item.entity === "job");
    if (!profile) {
      console.warn(`No job PROFILE for ${jobId}`);
      continue;
    }
    const date = typeof profile.date === "string" ? profile.date : "";
    const customerId = typeof profile.customerId === "string" ? profile.customerId : "";
    if (!date || !customerId) {
      console.warn(`Job ${jobId} missing date or customerId on PROFILE.`);
      continue;
    }
    const expectedGsi1pk = `JOBDATE#${date}`;
    if (profile.gsi1pk === expectedGsi1pk && profile.gsi2pk === `CUSTOMER#${customerId}`) {
      console.log(`${jobId}: GSI already set.`);
      continue;
    }
    await doc.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          ...profile,
          gsi1pk: expectedGsi1pk,
          gsi1sk: jobId,
          gsi2pk: `CUSTOMER#${customerId}`,
          gsi2sk: `JOB#${date}#${jobId}`,
        },
      }),
    );
    updated += 1;
    console.log(`${jobId}: updated JOBDATE#${date} index keys.`);
  }
  console.log(`Done. Updated ${updated} job PROFILE row(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
