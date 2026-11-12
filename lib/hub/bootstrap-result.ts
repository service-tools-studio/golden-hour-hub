import type { HubData } from "@/lib/mock/seed";

export type BootstrapResult =
  | { ok: false; message: string }
  | { source: "preview" }
  | { source: "dynamodb"; data: HubData; revision: number };

export function isDynamoBootstrapResult(
  result: BootstrapResult,
): result is { source: "dynamodb"; data: HubData; revision: number } {
  return "source" in result && result.source === "dynamodb";
}

export function isBootstrapFailure(result: BootstrapResult): result is { ok: false; message: string } {
  return "ok" in result && result.ok === false;
}

export type CustomerDetailLoadResult =
  | { ok: true; data: HubData }
  | { ok: false; message: string }
  | { source: "preview" };

export function customerDetailLoadSucceeded(
  result: CustomerDetailLoadResult,
): result is { ok: true; data: HubData } {
  return "ok" in result && result.ok === true;
}
