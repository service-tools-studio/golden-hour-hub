import "server-only";

import { previewAuthEnabled } from "@/lib/auth/config";
import { dynamoConfigured } from "@/lib/data/repository";

/** Role picker without Cognito, but edits go to DYNAMODB_TABLE_NAME. */
export function previewPersistsToDynamo(): boolean {
  return previewAuthEnabled() && dynamoConfigured();
}
