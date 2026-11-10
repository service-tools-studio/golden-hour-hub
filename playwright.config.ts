import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root = process.cwd();
const e2ePort = process.env.E2E_PORT ?? "3099";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${e2ePort}`;
const e2eTable = process.env.E2E_DYNAMODB_TABLE_NAME ?? "GoldenHourHub-e2e";

function loadEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(path.join(root, ".env.local")),
  ...loadEnvFile(path.join(root, "e2e", ".env")),
};

/** Next 16 single-instance lock; e2e uses its own port but shares `.next`, so drop stale lock before start. */
const devCommand = `sh -c 'rm -f .next/dev/lock 2>/dev/null; exec npx next dev -p ${e2ePort}'`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    ...devices["Pixel 5"],
    trace: "on-first-retry",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: devCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...fileEnv,
      ...process.env,
      E2E_PREVIEW_AUTH: "true",
      DYNAMODB_TABLE_NAME: e2eTable,
      SMS_PROVIDER: "mock",
      E2E_DYNAMODB_TABLE_NAME: e2eTable,
    },
  },
});
