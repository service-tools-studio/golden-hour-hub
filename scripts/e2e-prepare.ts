/**
 * Clear + seed the e2e DynamoDB table. Uses e2e/.env when present, else .env.local.
 *
 *   npm run e2e:prepare
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function resolveEnvFile(): string {
  if (process.env.E2E_ENV_FILE?.trim()) return process.env.E2E_ENV_FILE.trim();
  const e2eEnv = path.join(root, "e2e", ".env");
  if (fs.existsSync(e2eEnv)) return e2eEnv;
  const local = path.join(root, ".env.local");
  if (fs.existsSync(local)) return local;
  console.error("Create e2e/.env (see e2e/env.example) or add .env.local with AWS credentials.");
  process.exit(1);
}

const envFile = resolveEnvFile();
const table = process.env.E2E_DYNAMODB_TABLE_NAME ?? "GoldenHourHub-e2e";
console.log(`[e2e:prepare] ${table} via ${envFile}`);
execSync(`node --env-file="${envFile}" --experimental-strip-types scripts/seed-e2e.ts`, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    DYNAMODB_TABLE_NAME: table,
  },
});
