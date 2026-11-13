/**
 * Minimal hub slice for Playwright (two markets, one draft job each).
 *
 *   npm run e2e:prepare
 *
 * Requires DYNAMODB_TABLE_NAME pointing at an e2e table (name contains "e2e").
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { hubToItems } from "../lib/data/items.ts";
import { snapshotVisit } from "../lib/domain/customers.ts";
import type { AvailabilityWindow, CleanerProfile, Customer, Job, Property } from "../lib/domain/types.ts";
import { addDays, todayInBusinessZone } from "../lib/domain/time.ts";
import { emptyHub } from "../lib/mock/seed.ts";
import { E2E } from "../e2e/fixtures/ids.ts";

const ACTOR = "e2e-seed";
const STAMP = "2026-01-01T00:00:00.000Z";
const BATCH_SIZE = 25;

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME?.trim();
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
  marshallOptions: { removeUndefinedValues: true },
});

function assertE2eTable(): void {
  const name = tableName();
  if (!name.toLowerCase().includes("e2e") && process.env.E2E_ALLOW_SEED !== "1") {
    console.error(
      `Refusing to seed table "${name}". Use a table whose name contains "e2e", or set E2E_ALLOW_SEED=1.`,
    );
    process.exit(1);
  }
}

async function scanEntireTable(): Promise<Array<{ pk: string; sk: string }>> {
  const items: Array<{ pk: string; sk: string }> = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName(),
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) {
      const pk = item.pk;
      const sk = item.sk;
      if (typeof pk === "string" && typeof sk === "string") items.push({ pk, sk });
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function writeBatches(
  requests: Array<{ PutRequest?: { Item: Record<string, unknown> }; DeleteRequest?: { Key: { pk: string; sk: string } } }>,
): Promise<void> {
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);
    let pending = chunk;
    for (let attempt = 0; attempt < 8 && pending.length > 0; attempt++) {
      const result = await doc.send(
        new BatchWriteCommand({
          RequestItems: { [tableName()]: pending },
        }),
      );
      const unprocessed = result.UnprocessedItems?.[tableName()] ?? [];
      pending = unprocessed as typeof pending;
      if (pending.length > 0) await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
    if (pending.length > 0) throw new Error("DynamoDB BatchWrite still has unprocessed items.");
  }
}

async function clearTable(): Promise<number> {
  const existing = await scanEntireTable();
  if (existing.length === 0) return 0;
  await writeBatches(existing.map((item) => ({ DeleteRequest: { Key: item } })));
  return existing.length;
}

async function putItems(items: Record<string, unknown>[]): Promise<void> {
  if (items.length === 0) return;
  await writeBatches(items.map((item) => ({ PutRequest: { Item: item } })));
  const now = new Date().toISOString();
  await doc.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: "HUB",
        sk: "META",
        entity: "hub_meta",
        revision: 1,
        updatedAt: now,
      },
    }),
  );
}

function cleaner(
  cleanerId: string,
  firstName: string,
  lastName: string,
  homeMarketId: "portland" | "phoenix",
  phone: string,
): CleanerProfile {
  return {
    cleanerId,
    firstName,
    lastName,
    email: `${cleanerId}@e2e.goldenhour.mock`,
    mobilePhone: phone,
    status: "ACTIVE",
    typicalHelperCount: 0,
    maxHelperCount: 0,
    typicalHourlyRateCents: 3000,
    homeMarketId,
    createdAt: STAMP,
    createdBy: ACTOR,
    updatedAt: STAMP,
    updatedBy: ACTOR,
  };
}

function customer(customerId: string, firstName: string, lastName: string, phone: string): Customer {
  return {
    customerId,
    firstName,
    lastName,
    phone,
    status: "ACTIVE",
    createdAt: STAMP,
    createdBy: ACTOR,
    updatedAt: STAMP,
    updatedBy: ACTOR,
  };
}

function property(
  propertyId: string,
  customerId: string,
  marketId: "portland" | "phoenix",
  city: string,
  state: string,
  zip: string,
): Property {
  return {
    propertyId,
    customerId,
    streetAddress: marketId === "portland" ? "100 E2E St" : "200 E2E Blvd",
    city,
    state,
    zip,
    marketId,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1200,
    preferences: "",
    status: "ACTIVE",
    createdAt: STAMP,
    createdBy: ACTOR,
    updatedAt: STAMP,
    updatedBy: ACTOR,
  };
}

function availabilityWindow(
  availabilityId: string,
  cleanerId: string,
  date: string,
): AvailabilityWindow {
  return { availabilityId, cleanerId, date, start: "07:00", end: "17:00" };
}

function draftJob(
  jobId: string,
  date: string,
  customerId: string,
  propertyId: string,
  cust: Customer,
  prop: Property,
): Job {
  return {
    jobId,
    date,
    customerId,
    propertyId,
    snapshot: snapshotVisit(cust, prop),
    serviceType: "DEEP_CLEAN",
    status: "DRAFT",
    headcountNeeded: 1,
    specialInstructions: "",
    expectedDurationMinutes: 240,
    arrivalWindowStart: "09:00",
    arrivalWindowEnd: "09:00",
    draftCleanerIds: [],
    createdAt: STAMP,
    createdBy: ACTOR,
    updatedAt: STAMP,
    updatedBy: ACTOR,
  };
}

export async function seedE2eHub(): Promise<void> {
  assertE2eTable();
  const today = todayInBusinessZone();
  const jobDate = addDays(today, 1);
  const staffingDates = [7, 8, 9, 10].map((offset) => addDays(today, offset));
  const availabilityDates = [...new Set([today, jobDate, ...staffingDates])];

  const pdxCustomer = customer(E2E.customerPortland, "E2E", "Portland", "5035550101");
  const phxCustomer = customer(E2E.customerPhoenix, "E2E", "Phoenix", "6025550102");
  const pdxProperty = property(
    E2E.propertyPortland,
    E2E.customerPortland,
    "portland",
    "Portland",
    "OR",
    "97201",
  );
  const phxProperty = property(
    E2E.propertyPhoenix,
    E2E.customerPhoenix,
    "phoenix",
    "Phoenix",
    "AZ",
    "85004",
  );

  const hub = {
    ...emptyHub(today),
    cleaners: [
      cleaner(E2E.cleanerPortland, "Ada", "E2E", "portland", "5035550201"),
      cleaner(E2E.cleanerPhoenix, "Rio", "E2E", "phoenix", "6025550202"),
    ],
    customers: [pdxCustomer, phxCustomer],
    properties: [pdxProperty, phxProperty],
    jobs: [
      draftJob(E2E.jobPortland, jobDate, E2E.customerPortland, E2E.propertyPortland, pdxCustomer, pdxProperty),
      draftJob(E2E.jobPhoenix, jobDate, E2E.customerPhoenix, E2E.propertyPhoenix, phxCustomer, phxProperty),
      draftJob(E2E.jobPhoenixAssign, jobDate, E2E.customerPhoenix, E2E.propertyPhoenix, phxCustomer, phxProperty),
    ],
    availability: availabilityDates.flatMap((date) => [
      availabilityWindow(`e2e-av-pdx-${date}`, E2E.cleanerPortland, date),
      availabilityWindow(`e2e-av-phx-${date}`, E2E.cleanerPhoenix, date),
    ]),
  };

  const items = hubToItems(hub);
  await putItems(items);
  console.log(`Seeded ${items.length} items into ${tableName()} (job date ${jobDate}).`);
}

async function main() {
  assertE2eTable();
  const removed = await clearTable();
  console.log(`Cleared ${removed} items from ${tableName()}.`);
  await seedE2eHub();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
