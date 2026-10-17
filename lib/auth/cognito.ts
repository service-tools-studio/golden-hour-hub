import "server-only";

import { createHmac } from "node:crypto";
import {
  AdminGetUserCommand,
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
import { getPasswordRequirementLines, passwordRejectedMessage } from "@/lib/auth/password-policy";

export type CognitoTokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SignInResult =
  | { ok: true; tokens: CognitoTokens; email: string }
  | { ok: true; challenge: "NEW_PASSWORD_REQUIRED"; session: string; email: string }
  | { ok: false; message: string; passwordRequirements?: string[] };

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
    return await signInFailureFromError(error);
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
    if (!tokens) {
      const passwordRequirements = await getPasswordRequirementLines();
      return {
        ok: false,
        message: passwordRejectedMessage,
        passwordRequirements,
      };
    }
    return { ok: true, tokens, email: username };
  } catch (error) {
    return await signInFailureFromError(error);
  }
}

export async function refreshTokens(cognitoUsername: string, refreshToken: string): Promise<CognitoTokens | null> {
  const username = cognitoUsername.trim().toLowerCase();
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

/** False when the user is disabled or missing in Cognito (disabling does not revoke refresh tokens). */
export async function cognitoUserSignInAllowed(cognitoUsername: string): Promise<boolean> {
  const username = cognitoUsername.trim().toLowerCase();
  if (!username) return false;
  try {
    const response = await client().send(
      new AdminGetUserCommand({
        UserPoolId: cognitoUserPoolId(),
        Username: username,
      }),
    );
    return response.Enabled === true;
  } catch (error) {
    const name = cognitoErrorName(error);
    if (name === "UserNotFoundException") return false;
    console.error("Could not verify Cognito user status.", error);
    return false;
  }
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

function cognitoErrorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error ? String(error.name) : "";
}

function cognitoErrorMessage(error: unknown): string {
  const name = cognitoErrorName(error);
  if (name === "NotAuthorizedException") return "Incorrect email or password.";
  if (name === "UserNotFoundException") return "Incorrect email or password.";
  if (name === "InvalidPasswordException") return passwordRejectedMessage;
  if (name === "InvalidParameterException" && isPasswordParameterError(error)) {
    return passwordRejectedMessage;
  }
  if (name === "PasswordResetRequiredException") return "Your password needs to be reset. Please contact an admin.";
  if (name === "TooManyRequestsException") return "Too many attempts. Try again in a few minutes.";
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    const text = error.message;
    if (/password/i.test(text) && /policy|requirement|invalid/i.test(text)) {
      return passwordRejectedMessage;
    }
    return text;
  }
  return "Sign-in failed.";
}

function isPasswordParameterError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message);
  return /password/i.test(message);
}

async function signInFailureFromError(error: unknown): Promise<{ ok: false; message: string; passwordRequirements?: string[] }> {
  const name = cognitoErrorName(error);
  const passwordIssue =
    name === "InvalidPasswordException" ||
    (name === "InvalidParameterException" && isPasswordParameterError(error)) ||
    (error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      /password/i.test(error.message) &&
      /policy|requirement|invalid|format/i.test(error.message));

  if (passwordIssue) {
    const passwordRequirements = await getPasswordRequirementLines();
    return { ok: false, message: passwordRejectedMessage, passwordRequirements };
  }

  return { ok: false, message: cognitoErrorMessage(error) };
}
