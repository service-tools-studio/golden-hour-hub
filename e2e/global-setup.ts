import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function resolveEnvFile(): string | null {
  if (process.env.E2E_ENV_FILE?.trim()) return process.env.E2E_ENV_FILE.trim();
  const e2eEnv = path.join(root, "e2e", ".env");
  if (fs.existsSync(e2eEnv)) return e2eEnv;
  const local = path.join(root, ".env.local");
  if (fs.existsSync(local)) return local;
  if (process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    return null;
  }
  throw new Error("Create e2e/.env (see e2e/env.example) with AWS credentials and E2E_DYNAMODB_TABLE_NAME.");
}

export default async function globalSetup(): Promise<void> {
  const envFile = resolveEnvFile();
  const table = process.env.E2E_DYNAMODB_TABLE_NAME ?? "GoldenHourHub-e2e";
  const source = envFile ?? "process env (CI)";
  console.log(`[e2e] Preparing ${table} using ${source}…`);
  const seedCmd = envFile
    ? `node --env-file="${envFile}" --experimental-strip-types scripts/seed-e2e.ts`
    : "node --experimental-strip-types scripts/seed-e2e.ts";
  execSync(seedCmd, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DYNAMODB_TABLE_NAME: table,
    },
  });
}
