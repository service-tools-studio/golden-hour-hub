export type PasswordRuleId = "minLength" | "uppercase" | "lowercase" | "number" | "symbol";

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  minLength?: number;
};

export type PasswordPolicyConfig = {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicyConfig = {
  minimumLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
};

export function passwordRulesFromPolicy(policy: PasswordPolicyConfig): PasswordRule[] {
  const rules: PasswordRule[] = [
    {
      id: "minLength",
      label: `At least ${policy.minimumLength} characters long`,
      minLength: policy.minimumLength,
    },
  ];
  if (policy.requireUppercase) {
    rules.push({ id: "uppercase", label: "At least one uppercase letter (A–Z)" });
  }
  if (policy.requireLowercase) {
    rules.push({ id: "lowercase", label: "At least one lowercase letter (a–z)" });
  }
  if (policy.requireNumbers) {
    rules.push({ id: "number", label: "At least one number (0–9)" });
  }
  if (policy.requireSymbols) {
    rules.push({ id: "symbol", label: "At least one symbol (such as ! @ # $ %)" });
  }
  return rules;
}

export function passwordRuleSatisfied(password: string, rule: PasswordRule): boolean {
  switch (rule.id) {
    case "minLength":
      return password.length >= (rule.minLength ?? 8);
    case "uppercase":
      return /[A-Z]/.test(password);
    case "lowercase":
      return /[a-z]/.test(password);
    case "number":
      return /\d/.test(password);
    case "symbol":
      return /[^A-Za-z0-9]/.test(password);
    default:
      return false;
  }
}

export function evaluatePasswordRules(
  password: string,
  rules: PasswordRule[],
): Array<PasswordRule & { satisfied: boolean }> {
  return rules.map((rule) => ({
    ...rule,
    satisfied: passwordRuleSatisfied(password, rule),
  }));
}

export function passwordRequirementLabels(rules: PasswordRule[]): string[] {
  return rules.map((rule) => rule.label);
}
