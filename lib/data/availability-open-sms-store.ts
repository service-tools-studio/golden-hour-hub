import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoConfigured } from "./repository.ts";

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

function doc(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

function markerKey(weekStart: string, cleanerId: string): { pk: string; sk: string } {
  return { pk: `AVAIL_OPEN_SMS#${weekStart}`, sk: cleanerId };
}

/** Whether the automated “week open” SMS already went out for this cleaner/week. */
export async function availabilityOpenSmsAlreadySent(weekStart: string, cleanerId: string): Promise<boolean> {
  if (!dynamoConfigured()) return false;
  const result = await doc().send(
    new GetCommand({
      TableName: tableName(),
      Key: markerKey(weekStart, cleanerId),
    }),
  );
  return Boolean(result.Item);
}

export async function markAvailabilityOpenSmsSent(input: {
  weekStart: string;
  cleanerId: string;
  sentAt: string;
}): Promise<void> {
  if (!dynamoConfigured()) return;
  await doc().send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        ...markerKey(input.weekStart, input.cleanerId),
        entity: "availabilityOpenSms",
        weekStart: input.weekStart,
        cleanerId: input.cleanerId,
        sentAt: input.sentAt,
      },
    }),
  );
}
