import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoConfigured } from "./dynamo-config.ts";
import { dynamoDoc, dynamoTableName } from "./dynamo-client.ts";

function tableName(): string {
  return dynamoTableName();
}

function doc() {
  return dynamoDoc();
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
