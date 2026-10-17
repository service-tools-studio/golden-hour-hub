export type HubSetupVariant = "sign-in" | "password-updated";

export type SignInApiResult =
  | { ok: true; redirect: string; role: "ADMIN" | "CLEANER" }
  | { ok: true; challenge: "NEW_PASSWORD_REQUIRED"; session: string; email: string }
  | { ok: false; message: string; passwordRequirements?: string[] }
  | { ok: false; hubSetup: HubSetupVariant; message?: string };
