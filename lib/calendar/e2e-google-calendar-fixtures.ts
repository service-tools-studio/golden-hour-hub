import "server-only";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { e2eGoogleCalendarStubEnabled } from "../e2e/e2e-route-auth.ts";
import { dynamoConfigured } from "../data/dynamo-config.ts";
import { dynamoDoc, dynamoTableName } from "../data/dynamo-client.ts";
import type { DynamoItem } from "../data/items.ts";
import type { GoogleCalendarEvent } from "../services/google-calendar-client.ts";

const HUB_PK = "HUB";
const FIXTURES_SK = "E2E_GCAL_FIXTURES";

function parseFixtureEvents(item: DynamoItem | undefined): GoogleCalendarEvent[] {
  if (!item) return [];
  const raw = item.eventsJson;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is GoogleCalendarEvent => row !== null && typeof row === "object" && "id" in row);
  } catch {
    return [];
  }
}

export async function readE2eGoogleCalendarFixtures(): Promise<GoogleCalendarEvent[]> {
  if (!e2eGoogleCalendarStubEnabled() || !dynamoConfigured()) return [];
  const doc = dynamoDoc();
  const result = await doc.send(
    new GetCommand({
      TableName: dynamoTableName(),
      Key: { pk: HUB_PK, sk: FIXTURES_SK },
    }),
  );
  return parseFixtureEvents(result.Item as DynamoItem | undefined);
}

export async function writeE2eGoogleCalendarFixtures(events: GoogleCalendarEvent[]): Promise<void> {
  if (!e2eGoogleCalendarStubEnabled()) {
    throw new Error("E2E Google Calendar fixtures are only available when E2E_PREVIEW_AUTH is enabled.");
  }
  if (!dynamoConfigured()) {
    throw new Error("DynamoDB is not configured.");
  }
  const now = new Date().toISOString();
  const doc = dynamoDoc();
  const item: DynamoItem = {
    pk: HUB_PK,
    sk: FIXTURES_SK,
    entity: "e2e_gcal_fixtures",
    eventsJson: JSON.stringify(events),
    updatedAt: now,
  };
  await doc.send(
    new PutCommand({
      TableName: dynamoTableName(),
      Item: item,
    }),
  );
}

function eventStartMillis(event: GoogleCalendarEvent): number | null {
  if (event.start?.dateTime) {
    const t = Date.parse(event.start.dateTime);
    return Number.isFinite(t) ? t : null;
  }
  if (event.start?.date) {
    const t = Date.parse(`${event.start.date}T12:00:00`);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Match Google Calendar list API window filtering for E2E stubs. */
export function filterE2eGoogleEventsInRange(
  events: GoogleCalendarEvent[],
  timeMinIso: string,
  timeMaxIso: string,
): GoogleCalendarEvent[] {
  const min = Date.parse(timeMinIso);
  const max = Date.parse(timeMaxIso);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return events;
  return events.filter((event) => {
    const start = eventStartMillis(event);
    if (start === null) return false;
    return start >= min && start < max;
  });
}