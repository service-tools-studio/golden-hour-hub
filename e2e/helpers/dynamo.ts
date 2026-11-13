import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { E2E } from "../fixtures/ids";

const e2eRoot = path.join(process.cwd(), "e2e");
const repoRoot = process.cwd();

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    if (key === "DYNAMODB_TABLE_NAME") continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(e2eRoot, ".env"));

function e2eTableName(): string {
  const name = process.env.E2E_DYNAMODB_TABLE_NAME?.trim() ?? "GoldenHourHub-e2e";
  if (!name) {
    throw new Error("E2E Dynamo table not configured (set E2E_DYNAMODB_TABLE_NAME).");
  }
  if (!name.toLowerCase().includes("e2e") && process.env.E2E_ALLOW_SEED !== "1") {
    throw new Error(`Refusing Dynamo e2e reads on non-e2e table "${name}".`);
  }
  return name;
}

function docClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
}

async function queryPartition(pk: string): Promise<Record<string, unknown>[]> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: e2eTableName(),
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}

export type JobProfileRow = {
  entity?: string;
  jobId?: string;
  date?: string;
  status?: string;
  gsi1pk?: string;
  gsi2pk?: string;
  draftCleanerIds?: string[];
  snapshot?: { customerDisplayName?: string; marketId?: string };
};

/** Confirms Playwright is wired to the seeded e2e table (not preview-only). */
export async function expectE2eSeedPresentInDynamo(): Promise<void> {
  for (const jobId of [E2E.jobPortland, E2E.jobPhoenix, E2E.jobPhoenixAssign]) {
    const profile = await getJobProfileFromDynamo(jobId);
    if (!profile?.entity || profile.entity !== "job") {
      throw new Error(`Seed job JOB#${jobId} PROFILE missing in ${e2eTableName()}. Run npm run e2e:prepare.`);
    }
  }
  for (const cleanerId of [E2E.cleanerPortland, E2E.cleanerPhoenix]) {
    const cleaner = await getCleanerProfileFromDynamo(cleanerId);
    if (!cleaner?.cleanerId) {
      throw new Error(`Seed cleaner CLEANER#${cleanerId} PROFILE missing in ${e2eTableName()}.`);
    }
  }
}

/** Read `JOB#…` / PROFILE from the e2e Dynamo table (not the in-memory hub). */
export async function getJobProfileFromDynamo(jobId: string): Promise<JobProfileRow | null> {
  const items = await queryPartition(`JOB#${jobId}`);
  const profile = items.find((item) => item.sk === "PROFILE");
  return profile ? (profile as JobProfileRow) : null;
}

export async function getCleanerProfileFromDynamo(
  cleanerId: string,
): Promise<{ cleanerId?: string; homeMarketId?: string; firstName?: string; lastName?: string } | null> {
  const items = await queryPartition(`CLEANER#${cleanerId}`);
  const profile = items.find((item) => item.sk === "PROFILE");
  return profile ?? null;
}

export async function getCustomerPartitionFromDynamo(customerId: string): Promise<Record<string, unknown>[]> {
  return queryPartition(`CUSTOMER#${customerId}`);
}

function customerIdFromPathname(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = /^\/admin\/customers\/([^/]+)$/.exec(pathname);
  if (!match || match[1] === "new") return null;
  return match[1];
}

export function customerIdFromPageUrl(url: string): string {
  const id = customerIdFromPathname(url);
  if (!id) throw new Error(`No saved customer id in URL pathname (URL: ${url})`);
  return id;
}

export async function waitForSavedCustomerId(page: Page): Promise<string> {
  await expect
    .poll(() => customerIdFromPathname(page.url()), { timeout: 60_000 })
    .not.toBeNull();
  return customerIdFromPageUrl(page.url());
}

export async function expectCustomerPersistedInDynamo(
  customerId: string,
  expected: { lastName: string; marketId?: "portland" | "phoenix" },
): Promise<void> {
  if (customerId === "new") {
    throw new Error('Customer id is "new" — save did not allocate a real id (check URL / hub save).');
  }
  const items = await getCustomerPartitionFromDynamo(customerId);
  const profile = items.find((item) => item.sk === "PROFILE" && item.entity === "customer");
  if (!profile) {
    throw new Error(`CUSTOMER#${customerId} PROFILE row missing in Dynamo.`);
  }
  if (profile.lastName !== expected.lastName) {
    throw new Error(`Dynamo lastName is ${String(profile.lastName)}, expected ${expected.lastName}.`);
  }
  if (profile.gsi1pk !== "CUSTOMER#ALL") {
    throw new Error(`Dynamo customer gsi1pk is ${String(profile.gsi1pk)}, expected CUSTOMER#ALL.`);
  }
  if (expected.marketId) {
    const property = items.find((item) => item.entity === "property" && String(item.sk).startsWith("PROPERTY#"));
    if (!property) throw new Error(`CUSTOMER#${customerId} has no PROPERTY row in Dynamo.`);
    if (property.marketId !== expected.marketId) {
      throw new Error(`Dynamo property marketId is ${String(property.marketId)}, expected ${expected.marketId}.`);
    }
  }
}

function jobIdFromPathname(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const match = /^\/admin\/jobs\/([^/]+)$/.exec(pathname);
  if (!match || match[1] === "new") return null;
  return match[1];
}

export async function waitForSavedJobId(page: Page): Promise<string> {
  await expect.poll(() => jobIdFromPathname(page.url()), { timeout: 60_000 }).not.toBeNull();
  const jobId = jobIdFromPathname(page.url());
  if (!jobId) throw new Error(`No saved job id in URL (URL: ${page.url()})`);
  return jobId;
}

export async function expectJobPersistedInDynamo(
  jobId: string,
  expected: { date: string; customerLastName: string },
): Promise<void> {
  if (jobId === "new") {
    throw new Error('Job id is "new" — save did not navigate to a created cleaning.');
  }
  const profile = await getJobProfileFromDynamo(jobId);
  if (!profile || profile.entity !== "job") {
    throw new Error(`JOB#${jobId} PROFILE row missing in Dynamo.`);
  }
  if (profile.date !== expected.date) {
    throw new Error(`Dynamo job date is ${profile.date}, expected ${expected.date}.`);
  }
  const displayName = profile.snapshot?.customerDisplayName ?? "";
  if (!displayName.includes(expected.customerLastName)) {
    throw new Error(`Dynamo snapshot name "${displayName}" missing "${expected.customerLastName}".`);
  }
  const dateKey = `JOBDATE#${expected.date}`;
  if (profile.gsi1pk !== dateKey) {
    throw new Error(`Dynamo gsi1pk is ${profile.gsi1pk ?? "unset"}, expected ${dateKey}.`);
  }
}

export async function expectSeedJobSnapshotInDynamo(
  jobId: string,
  expected: { customerDisplaySubstring: string; marketId: "portland" | "phoenix" },
): Promise<void> {
  const profile = await getJobProfileFromDynamo(jobId);
  if (!profile?.entity || profile.entity !== "job") {
    throw new Error(`JOB#${jobId} PROFILE missing in Dynamo.`);
  }
  const displayName = profile.snapshot?.customerDisplayName ?? "";
  if (!displayName.includes(expected.customerDisplaySubstring)) {
    throw new Error(`Dynamo job ${jobId} snapshot "${displayName}" missing "${expected.customerDisplaySubstring}".`);
  }
  const marketId = profile.snapshot?.marketId ?? "";
  if (marketId !== expected.marketId) {
    throw new Error(`Dynamo job ${jobId} marketId is ${marketId}, expected ${expected.marketId}.`);
  }
}

export async function expectCleanerPersistedInDynamo(
  cleanerId: string,
  expected: { homeMarketId: "portland" | "phoenix"; firstName?: string },
): Promise<void> {
  const profile = await getCleanerProfileFromDynamo(cleanerId);
  if (!profile?.cleanerId) {
    throw new Error(`CLEANER#${cleanerId} PROFILE missing in Dynamo.`);
  }
  if (profile.homeMarketId !== expected.homeMarketId) {
    throw new Error(`Dynamo cleaner homeMarketId is ${profile.homeMarketId}, expected ${expected.homeMarketId}.`);
  }
  if (expected.firstName && profile.firstName !== expected.firstName) {
    throw new Error(`Dynamo cleaner firstName is ${profile.firstName}, expected ${expected.firstName}.`);
  }
}

export async function expectJobDraftCleanerInDynamo(jobId: string, cleanerId: string): Promise<void> {
  const profile = await getJobProfileFromDynamo(jobId);
  if (!profile?.entity || profile.entity !== "job") {
    throw new Error(`JOB#${jobId} PROFILE missing in Dynamo.`);
  }
  const ids = profile.draftCleanerIds;
  if (!Array.isArray(ids) || !ids.includes(cleanerId)) {
    throw new Error(`JOB#${jobId} draftCleanerIds ${JSON.stringify(ids)} does not include ${cleanerId}.`);
  }
}

export type JobAssignmentRow = {
  assignmentId?: string;
  cleanerId?: string;
  status?: string;
  entity?: string;
};

export async function getJobAssignmentsFromDynamo(jobId: string): Promise<JobAssignmentRow[]> {
  const items = await queryPartition(`JOB#${jobId}`);
  return items.filter(
    (item) => item.entity === "assignment" || String(item.sk ?? "").startsWith("ASSIGN#"),
  ) as JobAssignmentRow[];
}

export async function expectJobAssignmentInDynamo(
  jobId: string,
  cleanerId: string,
  status: "INVITED" | "CONFIRMED" | "DECLINED",
): Promise<void> {
  const assignments = await getJobAssignmentsFromDynamo(jobId);
  const forCleaner = assignments.filter((item) => item.cleanerId === cleanerId);
  if (forCleaner.length === 0) {
    throw new Error(
      `JOB#${jobId} has no assignment for cleaner ${cleanerId} (rows: ${JSON.stringify(assignments)}).`,
    );
  }
  if (forCleaner.length > 1) {
    throw new Error(
      `JOB#${jobId} has ${forCleaner.length} assignments for cleaner ${cleanerId}; expected exactly one.`,
    );
  }
  const match = forCleaner[0]!;
  if (match.jobId && match.jobId !== jobId) {
    throw new Error(`Assignment jobId is ${String(match.jobId)}, expected ${jobId}.`);
  }
  if (match.status !== status) {
    throw new Error(`Assignment for ${cleanerId} status is ${String(match.status)}, expected ${status}.`);
  }
}
