import "server-only";

import { createHmac } from "node:crypto";
import {
  AdminListGroupsForUserCommand,
  AuthFlowType,
  ChallengeNameType,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  cognitoClientId,
  cognitoClientSecret,
  cognitoRegion,
  cognitoUserPoolId,
} from "@/lib/auth/config";

export type CognitoTokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SignInResult =
  | { ok: true; tokens: CognitoTokens; email: string }
  | { ok: true; challenge: "NEW_PASSWORD_REQUIRED"; session: string; email: string }
  | { ok: false; message: string };

function client(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: cognitoRegion() });
}

function secretHash(username: string): string | undefined {
  const secret = cognitoClientSecret();
  if (!secret) return undefined;
  return createHmac("sha256", secret)
    .update(`${username}${cognitoClientId()}`)
    .digest("base64");
}

function authParameters(username: string, extras: Record<string, string> = {}): Record<string, string> {
  const params: Record<string, string> = { USERNAME: username, ...extras };
  const hash = secretHash(username);
  if (hash) params.SECRET_HASH = hash;
  return params;
}

function tokensFromAuth(result: {
  AuthenticationResult?: {
    IdToken?: string;
    AccessToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
  };
}): CognitoTokens | null {
  const auth = result.AuthenticationResult;
  if (!auth?.IdToken || !auth.AccessToken || !auth.RefreshToken) return null;
  return {
    idToken: auth.IdToken,
    accessToken: auth.AccessToken,
    refreshToken: auth.RefreshToken,
    expiresIn: auth.ExpiresIn ?? 3600,
  };
}

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const username = email.trim().toLowerCase();
  try {
    const response = await client().send(
      new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: cognitoClientId(),
        AuthParameters: authParameters(username, { PASSWORD: password }),
      }),
    );
    if (response.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED && response.Session) {
      return { ok: true, challenge: "NEW_PASSWORD_REQUIRED", session: response.Session, email: username };
    }
    const tokens = tokensFromAuth(response);
    if (!tokens) return { ok: false, message: "Sign-in did not return tokens." };
    return { ok: true, tokens, email: username };
  } catch (error) {
    return { ok: false, message: cognitoErrorMessage(error) };
  }
}

export async function completeNewPassword(
  email: string,
  newPassword: string,
  session: string,
): Promise<SignInResult> {
  const username = email.trim().toLowerCase();
  try {
    const response = await client().send(
      new RespondToAuthChallengeCommand({
        ClientId: cognitoClientId(),
        ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
        Session: session,
        ChallengeResponses: authParameters(username, { NEW_PASSWORD: newPassword }),
      }),
    );
    const tokens = tokensFromAuth(response);
    if (!tokens) return { ok: false, message: "Password was not accepted." };
    return { ok: true, tokens, email: username };
  } catch (error) {
    return { ok: false, message: cognitoErrorMessage(error) };
  }
}

export async function refreshTokens(email: string, refreshToken: string): Promise<CognitoTokens | null> {
  const username = email.trim().toLowerCase();
  try {
    const response = await client().send(
      new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: cognitoClientId(),
        AuthParameters: authParameters(username, { REFRESH_TOKEN: refreshToken }),
      }),
    );
    const auth = response.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken) return null;
    return {
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken ?? refreshToken,
      expiresIn: auth.ExpiresIn ?? 3600,
    };
  } catch {
    return null;
  }
}

export function decodeIdToken(idToken: string): { sub: string; email: string; username: string; groups: string[]; exp: number } {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("Invalid ID token.");
  const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub?: string;
    email?: string;
    username?: string;
    "cognito:username"?: string;
    exp?: number;
    "cognito:groups"?: string[];
  };
  if (!json.sub || typeof json.exp !== "number") {
    throw new Error("ID token is missing required claims.");
  }
  const username = (json["cognito:username"] ?? json.username ?? json.email ?? "").toLowerCase();
  const email = (json.email ?? json["cognito:username"] ?? json.username ?? "").toLowerCase();
  if (!email) throw new Error("ID token is missing an email claim.");
  return {
    sub: json.sub,
    email,
    username,
    groups: json["cognito:groups"] ?? [],
    exp: json.exp,
  };
}

/** Groups are usually in the ID token; fall back to Admin API when IAM credentials allow it. */
export async function resolveCognitoGroups(username: string, tokenGroups: string[]): Promise<string[]> {
  if (tokenGroups.length > 0) return tokenGroups;
  try {
    const response = await client().send(
      new AdminListGroupsForUserCommand({
        UserPoolId: cognitoUserPoolId(),
        Username: username,
      }),
    );
    return (response.Groups ?? []).map((group) => group.GroupName ?? "").filter(Boolean);
  } catch {
    return tokenGroups;
  }
}

function cognitoErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAuthorizedException") return "Incorrect email or password.";
  if (name === "UserNotFoundException") return "Incorrect email or password.";
  if (name === "InvalidPasswordException") return "Password does not meet the pool requirements.";
  if (name === "PasswordResetRequiredException") return "Password reset is required. Contact an admin.";
  if (name === "TooManyRequestsException") return "Too many attempts. Try again in a few minutes.";
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Sign-in failed.";
}
