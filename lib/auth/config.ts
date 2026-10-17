import "server-only";

/** Local preview: pick admin or cleaner in the browser when no session secret is set. */
export function previewAuthEnabled(): boolean {
  return !process.env.AUTH_SESSION_SECRET?.trim();
}

export function cognitoConfigured(): boolean {
  return Boolean(
    process.env.COGNITO_USER_POOL_ID?.trim() &&
      process.env.COGNITO_CLIENT_ID?.trim() &&
      process.env.AUTH_SESSION_SECRET?.trim(),
  );
}

export function cognitoRegion(): string {
  return process.env.COGNITO_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-west-2";
}

export function cognitoUserPoolId(): string {
  const id = process.env.COGNITO_USER_POOL_ID?.trim();
  if (!id) throw new Error("COGNITO_USER_POOL_ID is not set.");
  return id;
}

export function cognitoClientId(): string {
  const id = process.env.COGNITO_CLIENT_ID?.trim();
  if (!id) throw new Error("COGNITO_CLIENT_ID is not set.");
  return id;
}

export function cognitoClientSecret(): string | undefined {
  const secret = process.env.COGNITO_CLIENT_SECRET?.trim();
  return secret || undefined;
}

export function authSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not set.");
  return secret;
}
