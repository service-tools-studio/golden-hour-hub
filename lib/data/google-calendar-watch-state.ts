import "server-only";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoConfigured } from "./dynamo-config.ts";
import { dynamoDoc, dynamoTableName } from "./dynamo-client.ts";
import type { DynamoItem } from "./items.ts";

const HUB_PK = "HUB";
const WATCH_SK = "GCAL_WATCH";

export type GoogleCalendarWatchState = {
  channelId: string;
  resourceId: string;
  expirationMs: number;
  channelToken: string;
  calendarId: string;
  webhookUrl: string;
  updatedAt: string;
};

function itemToState(item: DynamoItem): GoogleCalendarWatchState | null {
  if (item.entity !== "google_calendar_watch") return null;
  const channelId = typeof item.channelId === "string" ? item.channelId : "";
  const resourceId = typeof item.resourceId === "string" ? item.resourceId : "";
  const expirationMs = typeof item.expirationMs === "number" ? item.expirationMs : 0;
  const channelToken = typeof item.channelToken === "string" ? item.channelToken : "";
  const calendarId = typeof item.calendarId === "string" ? item.calendarId : "";
  const webhookUrl = typeof item.webhookUrl === "string" ? item.webhookUrl : "";
  const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : "";
  if (!channelId || !resourceId || !expirationMs) return null;
  return { channelId, resourceId, expirationMs, channelToken, calendarId, webhookUrl, updatedAt };
}

export async function readGoogleCalendarWatchState(): Promise<GoogleCalendarWatchState | null> {
  if (!dynamoConfigured()) return null;
  const doc = dynamoDoc();
  const result = await doc.send(
    new GetCommand({
      TableName: dynamoTableName(),
      Key: { pk: HUB_PK, sk: WATCH_SK },
    }),
  );
  if (!result.Item) return null;
  return itemToState(result.Item as DynamoItem);
}

export async function writeGoogleCalendarWatchState(state: GoogleCalendarWatchState): Promise<void> {
  if (!dynamoConfigured()) {
    throw new Error("DynamoDB is not configured.");
  }
  const doc = dynamoDoc();
  const item: DynamoItem = {
    pk: HUB_PK,
    sk: WATCH_SK,
    entity: "google_calendar_watch",
    channelId: state.channelId,
    resourceId: state.resourceId,
    expirationMs: state.expirationMs,
    channelToken: state.channelToken,
    calendarId: state.calendarId,
    webhookUrl: state.webhookUrl,
    updatedAt: state.updatedAt,
  };
  await doc.send(
    new PutCommand({
      TableName: dynamoTableName(),
      Item: item,
    }),
  );
}