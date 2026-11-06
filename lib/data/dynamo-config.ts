/** Safe on client and server — no DynamoDB imports. */
export function dynamoConfigured(): boolean {
  return Boolean(process.env.DYNAMODB_TABLE_NAME);
}
