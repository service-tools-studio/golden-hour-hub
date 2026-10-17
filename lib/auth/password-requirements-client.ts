import type { PasswordRule } from "@/lib/auth/password-rules";
import { passwordRequirementLabels } from "@/lib/auth/password-rules";

export type PasswordRequirementsResponse = {
  configured?: boolean;
  intro?: string;
  requirements?: string[];
  rules?: PasswordRule[];
  rejectedIntro?: string;
};

export async function fetchPasswordRequirements(): Promise<PasswordRequirementsResponse> {
  const response = await fetch("/api/auth/password-requirements", { cache: "no-store" });
  const data = (await response.json()) as PasswordRequirementsResponse;
  if (data.rules?.length) return data;
  if (data.requirements?.length) {
    return {
      ...data,
      rules: data.requirements.map((label, index) => ({
        id: (["minLength", "uppercase", "lowercase", "number", "symbol"] as const)[index] ?? "minLength",
        label,
      })),
    };
  }
  return data;
}

/** True only for Cognito/policy rejection copy — not generic credential errors. */
export function isPasswordPolicyMessage(message: string): boolean {
  const trimmed = message.trim();
  if (/^incorrect email or password/i.test(trimmed)) return false;
  if (/that password doesn't meet our security rules/i.test(trimmed)) return true;
  return /security rules|pool requirements/i.test(trimmed);
}

export function requirementLabelsFromRules(rules: PasswordRule[]): string[] {
  return passwordRequirementLabels(rules);
}
