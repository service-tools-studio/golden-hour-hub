/**
 * Upsert cleaner PROFILE rows in DynamoDB.
 *
 * Requires DYNAMODB_TABLE_NAME (and AWS credentials) in the environment.
 * Run from the repo root:
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/seed-cleaners.ts
 *
 * This script only writes cleaner PROFILE rows (no jobs, customers, or assignments).
 * Recommended order on a fresh table: npm run dynamo:clear → npm run seed:cleaners → open the app.
 * Safe to re-run: existing PROFILE rows for the same cleanerId are overwritten.
 */

import { cleanerToItem } from "../lib/data/items.ts";
import { dynamoConfigured, putItems } from "../lib/data/repository.ts";
import type { CleanerProfile } from "../lib/domain/types.ts";

const SEED_EMAIL = "jasmintmail@gmail.com";

/** Crew size is the cleaner plus helpers; stored counts are helpers only. */
function helpersFromTypicalCrewSize(crewSize: number): number {
  return Math.max(0, crewSize - 1);
}

function profile(
  cleanerId: string,
  firstName: string,
  lastName: string,
  mobilePhone: string,
  typicalCrewSize: number,
  maxHelperCount: number,
  typicalHourlyRateCents: number,
): CleanerProfile {
  const now = new Date().toISOString();
  const typicalHelperCount = helpersFromTypicalCrewSize(typicalCrewSize);
  return {
    cleanerId,
    firstName,
    lastName,
    email: SEED_EMAIL,
    mobilePhone,
    status: "ACTIVE",
    typicalHelperCount: maxHelperCount === 0 ? 0 : Math.min(typicalHelperCount, maxHelperCount),
    maxHelperCount,
    typicalHourlyRateCents,
    createdAt: now,
    createdBy: "seed-cleaners",
    updatedAt: now,
    updatedBy: "seed-cleaners",
  };
}

const CLEANERS: CleanerProfile[] = [
  profile("claudia", "Claudia", "Maqueda Ramos", "3233763753", 2, 2, 3500),
  profile("mariana", "Mariana", "Moncada", "3233763753", 2, 4, 3000),
  profile("shariese", "Shariese", "Miles", "3233763753", 1, 0, 3000),
  profile("keshawna", "Keshawna", "Arrollado", "3233763753", 1, 0, 3000),
  profile("tricia", "Tricia", "Oguaghamba", "3233763753", 1, 0, 3000),
  profile("jasmin", "Jasmin", "Heart", "3233763753", 1, 0, 15000),
  profile("kelsey", "Kelsey", "Collins", "5039335444", 1, 0, 15000),
];

async function main() {
  if (!dynamoConfigured()) {
    console.error("Set DYNAMODB_TABLE_NAME in .env.local (or the environment) and try again.");
    process.exit(1);
  }
  const items = CLEANERS.map(cleanerToItem);
  await putItems(items);
  for (const cleaner of CLEANERS) {
    const crew = cleaner.maxHelperCount === 0 ? 1 : 1 + cleaner.typicalHelperCount;
    const maxCrew = cleaner.maxHelperCount === 0 ? 1 : 1 + cleaner.maxHelperCount;
    console.log(
      `  ${cleaner.cleanerId}: ${cleaner.firstName} ${cleaner.lastName} · usual crew ${crew} · max ${maxCrew} · $${(cleaner.typicalHourlyRateCents / 100).toFixed(2)}/hr`,
    );
  }
  console.log(`\nWrote ${items.length} cleaner profiles to ${process.env.DYNAMODB_TABLE_NAME}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
