import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { AssignmentSmsLog } from "../domain/types.ts";
import type { DynamoItem } from "./items.ts";
import { dynamoConfigured } from "./repository.ts";

function tableName(): string {
  const name = process.env.DYNAMODB_TABLE_NAME;
  if (!name) throw new Error("DYNAMODB_TABLE_NAME is not set.");
  return name;
}

function doc(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

const BATCH_SIZE = 25;
const RELATION_INDEX = "RelationIndex";

function assignmentPk(assignmentId: string): string {
  return `ASSIGNMENT#${assignmentId}`;
}

function jobGsi2pk(jobId: string): string {
  return `JOB#${jobId}`;
}

async function batchDeleteKeys(keys: Array<{ pk: string; sk: string }>): Promise<number> {
  if (keys.length === 0) return 0;
  const name = tableName();
  const requests = keys.map((key) => ({ DeleteRequest: { Key: key } }));
  for (let index = 0; index < requests.length; index += BATCH_SIZE) {
    let pending = requests.slice(index, index + BATCH_SIZE);
    let attempt = 0;
    while (pending.length > 0) {
      const result = await doc().send(new BatchWriteCommand({ RequestItems: { [name]: pending } }));
      pending = (result.UnprocessedItems?.[name] ?? []) as typeof pending;
      attempt += 1;
      if (pending.length > 0 && attempt > 3) {
        throw new Error("DynamoDB did not accept every SMS log delete.");
      }
    }
  }
  return keys.length;
}

async function querySmsLogKeys(input: {
  indexName?: string;
  keyCondition: string;
  values: Record<string, string>;
}): Promise<Array<{ pk: string; sk: string }>> {
  const keys: Array<{ pk: string; sk: string }> = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: input.indexName,
        KeyConditionExpression: input.keyCondition,
        FilterExpression: "entity = :entity",
        ExpressionAttributeValues: {
          ...input.values,
          ":entity": "assignment_sms_log",
        },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const pk = item.pk;
      const sk = item.sk;
      if (typeof pk === "string" && typeof sk === "string") {
        keys.push({ pk, sk });
      }
    }
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return keys;
}

export function assignmentSmsLogItem(log: AssignmentSmsLog): DynamoItem {
  const item: DynamoItem = {
    pk: assignmentPk(log.assignmentId),
    sk: `SMS#${log.sentAt}#${log.smsLogId}`,
    entity: "assignment_sms_log",
    gsi2pk: `JOB#${log.jobId}`,
    gsi2sk: `SMS#${log.sentAt}#${log.assignmentId}`,
    ...log,
  };
  if (log.twilioMessageSid) {
    item.gsi1pk = `SMS_SID#${log.twilioMessageSid}`;
    item.gsi1sk = log.sentAt;
  }
  return item;
}

function readAssignmentSmsLog(item: DynamoItem): AssignmentSmsLog {
  return {
    smsLogId: String(item.smsLogId),
    assignmentId: String(item.assignmentId),
    jobId: String(item.jobId),
    cleanerId: String(item.cleanerId),
    kind: item.kind as AssignmentSmsLog["kind"],
    toPhone: String(item.toPhone),
    bodyPreview: String(item.bodyPreview),
    provider: item.provider === "twilio" ? "twilio" : "mock",
    twilioMessageSid: typeof item.twilioMessageSid === "string" ? item.twilioMessageSid : undefined,
    status: item.status as AssignmentSmsLog["status"],
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : undefined,
    sentAt: String(item.sentAt),
    updatedAt: String(item.updatedAt),
  };
}

export async function putAssignmentSmsLog(log: AssignmentSmsLog): Promise<void> {
  if (!dynamoConfigured()) return;
  await doc().send(
    new PutCommand({
      TableName: tableName(),
      Item: assignmentSmsLogItem(log),
    }),
  );
}

export async function listAssignmentSmsLogs(assignmentId: string, limit = 25): Promise<AssignmentSmsLog[]> {
  if (!dynamoConfigured()) return [];
  const result = await doc().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": assignmentPk(assignmentId),
        ":prefix": "SMS#",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? [])
    .filter((item) => item.entity === "assignment_sms_log")
    .map((item) => readAssignmentSmsLog(item as DynamoItem));
}

export async function updateAssignmentSmsLogByTwilioSid(input: {
  twilioMessageSid: string;
  status: AssignmentSmsLog["status"];
  errorMessage?: string;
  updatedAt: string;
}): Promise<boolean> {
  if (!dynamoConfigured()) return false;
  const found = await doc().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: "ScheduleIndex",
      KeyConditionExpression: "gsi1pk = :gsi1pk",
      ExpressionAttributeValues: {
        ":gsi1pk": `SMS_SID#${input.twilioMessageSid}`,
      },
      Limit: 1,
    }),
  );
  const item = found.Items?.[0] as DynamoItem | undefined;
  if (!item?.pk || !item.sk) return false;
  await doc().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: item.pk, sk: item.sk },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": input.status,
        ":updatedAt": input.updatedAt,
        ":errorMessage": input.errorMessage ?? null,
      },
    }),
  );
  return true;
}

/** Deletes every outbound SMS log row for one assignment (invite, reminder, etc.). */
export async function deleteAssignmentSmsLogsForAssignment(assignmentId: string): Promise<number> {
  if (!dynamoConfigured()) return 0;
  const trimmed = assignmentId.trim();
  if (!trimmed) return 0;
  const keys = await querySmsLogKeys({
    keyCondition: "pk = :pk AND begins_with(sk, :prefix)",
    values: {
      ":pk": assignmentPk(trimmed),
      ":prefix": "SMS#",
    },
  });
  return batchDeleteKeys(keys);
}

/** Deletes every outbound SMS log row tied to a job (all cleaners on that job). */
export async function deleteAssignmentSmsLogsForJob(jobId: string): Promise<number> {
  if (!dynamoConfigured()) return 0;
  const trimmed = jobId.trim();
  if (!trimmed) return 0;
  const keys = await querySmsLogKeys({
    indexName: RELATION_INDEX,
    keyCondition: "gsi2pk = :gsi2pk AND begins_with(gsi2sk, :prefix)",
    values: {
      ":gsi2pk": jobGsi2pk(trimmed),
      ":prefix": "SMS#",
    },
  });
  return batchDeleteKeys(keys);
}

export async function patchAssignmentSmsLog(
  log: Pick<AssignmentSmsLog, "assignmentId" | "sentAt" | "smsLogId">,
  patch: {
    status: AssignmentSmsLog["status"];
    updatedAt: string;
    errorMessage?: string;
  },
): Promise<void> {
  if (!dynamoConfigured()) return;
  await doc().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: {
        pk: assignmentPk(log.assignmentId),
        sk: `SMS#${log.sentAt}#${log.smsLogId}`,
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": patch.status,
        ":updatedAt": patch.updatedAt,
        ":errorMessage": patch.errorMessage ?? null,
      },
    }),
  );
}
