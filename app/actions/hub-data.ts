"use server";

import { dynamoConfigured, loadHub, saveHub } from "@/lib/data/repository";
import type { HubData } from "@/lib/mock/seed";

export async function bootstrapHub(): Promise<{ source: "preview" } | { source: "dynamodb"; data: HubData }> {
  if (!dynamoConfigured()) return { source: "preview" };
  try {
    const data = await loadHub();
    return { source: "dynamodb", data };
  } catch (error) {
    console.error("DynamoDB is configured but could not be read. Using the preview store.", error);
    return { source: "preview" };
  }
}

export async function persistHub(data: HubData): Promise<{ ok: true } | { ok: false }> {
  if (!dynamoConfigured()) return { ok: false };
  try {
    await saveHub(data);
    return { ok: true };
  } catch (error) {
    console.error("DynamoDB save failed.", error);
    return { ok: false };
  }
}
