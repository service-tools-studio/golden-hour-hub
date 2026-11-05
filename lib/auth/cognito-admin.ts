import "server-only";

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoRegion, cognitoUserPoolId } from "@/lib/auth/config";

const CLEANER_GROUP = "CLEANER";

function client(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: cognitoRegion() });
}

function cognitoErrorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error ? String(error.name) : "";
}

function readSub(attributes: AttributeType[] | undefined): string | null {
  const sub = attributes?.find((item) => item.Name === "sub")?.Value;
  return sub?.trim() ? sub : null;
}

export type CreateCleanerCognitoUserResult =
  | { ok: true; username: string; sub: string }
  | { ok: false; message: string };

/** Creates a pool user; Cognito emails the temporary password when email delivery is configured. */
export async function createCleanerCognitoUser(input: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<CreateCleanerCognitoUserResult> {
  const username = input.email.trim().toLowerCase();
  try {
    const response = await client().send(
      new AdminCreateUserCommand({
        UserPoolId: cognitoUserPoolId(),
        Username: username,
        UserAttributes: [
          { Name: "email", Value: username },
          { Name: "email_verified", Value: "true" },
          { Name: "given_name", Value: input.firstName.trim() },
          { Name: "family_name", Value: input.lastName.trim() },
        ],
        DesiredDeliveryMediums: ["EMAIL"],
      }),
    );
    const sub = readSub(response.User?.Attributes);
    if (!sub) {
      return { ok: false, message: "Sign-in account was created but Hub could not read the user id." };
    }
    return { ok: true, username, sub };
  } catch (error) {
    const name = cognitoErrorName(error);
    if (name === "UsernameExistsException" || name === "AliasExistsException") {
      return { ok: false, message: "An account with this email already exists in sign-in." };
    }
    console.error("AdminCreateUser failed.", error);
    return { ok: false, message: "Could not create the sign-in account. Try again or check Cognito." };
  }
}

export async function addUserToCleanerGroup(username: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalized = username.trim().toLowerCase();
  try {
    await client().send(
      new AdminAddUserToGroupCommand({
        UserPoolId: cognitoUserPoolId(),
        Username: normalized,
        GroupName: CLEANER_GROUP,
      }),
    );
    return { ok: true };
  } catch (error) {
    console.error("AdminAddUserToGroup failed.", error);
    return { ok: false, message: "Could not add the cleaner to the sign-in group." };
  }
}

/** Best-effort rollback when profile creation fails after Cognito user exists. */
export async function deleteCognitoUser(username: string): Promise<void> {
  const normalized = username.trim().toLowerCase();
  try {
    await client().send(
      new AdminDeleteUserCommand({
        UserPoolId: cognitoUserPoolId(),
        Username: normalized,
      }),
    );
  } catch (error) {
    console.error("AdminDeleteUser failed during rollback.", error);
  }
}
