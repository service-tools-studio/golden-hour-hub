import "server-only";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let documentClient: DynamoDBDocumentClient | null = null;

export function dynamoTableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

/** Reuse one document client so queries share HTTP connections and credentials. */
export function dynamoDoc(): DynamoDBDocumentClient {
  if (documentClient) return documentClient;
  documentClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return documentClient;
}
