import "server-only";

import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  type PasswordPolicyType,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoConfigured, cognitoRegion, cognitoUserPoolId } from "@/lib/auth/config";
import {
  DEFAULT_PASSWORD_POLICY,
  passwordRequirementLabels,
  passwordRulesFromPolicy,
  type PasswordPolicyConfig,
  type PasswordRule,
} from "@/lib/auth/password-rules";

const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedPolicy: { policy: PasswordPolicyType; fetchedAt: number } | null = null;

function cognitoClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: cognitoRegion() });
}

function envFlag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

/** Optional mirror of Cognito console policy when DescribeUserPool is not allowed on IAM. */
function passwordPolicyFromEnv(): PasswordPolicyType | null {
  const hasConfig = [
    "COGNITO_PASSWORD_MIN_LENGTH",
    "COGNITO_PASSWORD_REQUIRE_UPPERCASE",
    "COGNITO_PASSWORD_REQUIRE_LOWERCASE",
    "COGNITO_PASSWORD_REQUIRE_NUMBERS",
    "COGNITO_PASSWORD_REQUIRE_SYMBOLS",
  ].some((key) => process.env[key]?.trim());

  if (!hasConfig) return null;

  return {
    MinimumLength: Number(process.env.COGNITO_PASSWORD_MIN_LENGTH) || 8,
    RequireUppercase: envFlag("COGNITO_PASSWORD_REQUIRE_UPPERCASE"),
    RequireLowercase: envFlag("COGNITO_PASSWORD_REQUIRE_LOWERCASE"),
    RequireNumbers: envFlag("COGNITO_PASSWORD_REQUIRE_NUMBERS"),
    RequireSymbols: envFlag("COGNITO_PASSWORD_REQUIRE_SYMBOLS"),
  };
}

export async function getCognitoPasswordPolicy(): Promise<PasswordPolicyType | null> {
  const fromEnv = passwordPolicyFromEnv();
  if (fromEnv) return fromEnv;

  if (!cognitoConfigured()) return null;
  const now = Date.now();
  if (cachedPolicy && now - cachedPolicy.fetchedAt < CACHE_TTL_MS) {
    return cachedPolicy.policy;
  }
  try {
    const response = await cognitoClient().send(
      new DescribeUserPoolCommand({ UserPoolId: cognitoUserPoolId() }),
    );
    const policy = response.UserPool?.Policies?.PasswordPolicy;
    if (!policy) return null;
    cachedPolicy = { policy, fetchedAt: now };
    return policy;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const name = error && typeof error === "object" && "name" in error ? String(error.name) : "Error";
      console.warn(
        `[auth] Could not read Cognito password policy (${name}). ` +
        "Add cognito-idp:DescribeUserPool to IAM or set COGNITO_PASSWORD_* in .env.local.",
      );
    }
    return null;
  }
}

export function cognitoPolicyToConfig(policy: PasswordPolicyType): PasswordPolicyConfig {
  return {
    minimumLength: policy.MinimumLength ?? 8,
    requireUppercase: Boolean(policy.RequireUppercase),
    requireLowercase: Boolean(policy.RequireLowercase),
    requireNumbers: Boolean(policy.RequireNumbers),
    requireSymbols: Boolean(policy.RequireSymbols),
  };
}

function configFromEnv(): PasswordPolicyConfig | null {
  const fromEnv = passwordPolicyFromEnv();
  if (!fromEnv) return null;
  return cognitoPolicyToConfig(fromEnv);
}

export async function getPasswordRules(): Promise<PasswordRule[]> {
  const envConfig = configFromEnv();
  if (envConfig) return passwordRulesFromPolicy(envConfig);
  const policy = await getCognitoPasswordPolicy();
  return passwordRulesFromPolicy(policy ? cognitoPolicyToConfig(policy) : DEFAULT_PASSWORD_POLICY);
}

export async function getPasswordRequirementLines(): Promise<string[]> {
  return passwordRequirementLabels(await getPasswordRules());
}

export const passwordRejectedMessage =
  "That password doesn't meet our security rules yet. Please update it to include:";
