"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { HubSetupMessage } from "@/components/hub-setup-message";
import { PasswordInput } from "@/components/password-input";
import { LivePasswordRequirements, PasswordRequirements } from "@/components/password-requirements";
import { fetchPasswordRequirements, isPasswordPolicyMessage } from "@/lib/auth/password-requirements-client";
import type { PasswordRule } from "@/lib/auth/password-rules";
import type { HubSetupVariant, SignInApiResult } from "@/lib/auth/sign-in-types";

type ChallengeState = { email: string; session: string };

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordRules, setPasswordRules] = useState<PasswordRule[]>([]);
  const [passwordRequirements, setPasswordRequirements] = useState<string[]>([]);
  const [passwordPolicyError, setPasswordPolicyError] = useState(false);
  const [requirementsIntro, setRequirementsIntro] = useState("Your new password must include:");
  const [hubSetup, setHubSetup] = useState<HubSetupVariant | null>(null);
  const [pending, startTransition] = useTransition();

  const refreshRequirements = useCallback(async () => {
    try {
      const data = await fetchPasswordRequirements();
      if (data.intro) setRequirementsIntro(data.intro);
      if (data.rules?.length) {
        setPasswordRules(data.rules);
      } else if (data.requirements?.length) {
        setPasswordRules(
          data.requirements.map((label, index) => ({
            id: (["minLength", "uppercase", "lowercase", "number", "symbol"] as const)[index] ?? "minLength",
            label,
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshRequirements();
  }, [refreshRequirements]);

  useEffect(() => {
    if (challenge) void refreshRequirements();
  }, [challenge, refreshRequirements]);

  async function applyPasswordError(result: { message?: string; passwordRequirements?: string[] }) {
    let lines = result.passwordRequirements ?? [];
    if (lines.length === 0) {
      const data = await fetchPasswordRequirements();
      lines = data.requirements ?? [];
      if (data.rejectedIntro && result.message) {
        setError(result.message);
      }
    }
    if (lines.length > 0) {
      setPasswordRequirements(lines);
      setPasswordPolicyError(true);
    }
    setError(result.message ?? "That password doesn't meet our security rules yet.");
  }

  function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPasswordPolicyError(false);
    setHubSetup(null);
    startTransition(async () => {
      try {
        const result = await postJson<SignInApiResult>("/api/auth/login", { email, password });
        if (!result.ok) {
          if ("hubSetup" in result && result.hubSetup) {
            setHubSetup(result.hubSetup);
            return;
          }
          const message = "message" in result && result.message ? result.message : "Sign-in failed.";
          if ("passwordRequirements" in result && result.passwordRequirements?.length) {
            await applyPasswordError({ message, passwordRequirements: result.passwordRequirements });
            return;
          }
          if (isPasswordPolicyMessage(message)) {
            await applyPasswordError({ message });
            return;
          }
          setError(message);
          return;
        }
        if ("challenge" in result && result.challenge === "NEW_PASSWORD_REQUIRED") {
          setChallenge({ email: result.email, session: result.session });
          setPassword("");
          return;
        }
        if ("redirect" in result) {
          window.location.href = result.redirect;
        }
      } catch {
        setError("Could not sign in.");
      }
    });
  }

  function submitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError(null);
    setPasswordPolicyError(false);
    setHubSetup(null);
    startTransition(async () => {
      try {
        const result = await postJson<SignInApiResult>("/api/auth/new-password", {
          email: challenge.email,
          password: newPassword,
          session: challenge.session,
        });
        if (!result.ok) {
          if ("hubSetup" in result && result.hubSetup) {
            setHubSetup(result.hubSetup);
            return;
          }
          const message = "message" in result && result.message ? result.message : "Could not set password.";
          if ("passwordRequirements" in result && result.passwordRequirements?.length) {
            await applyPasswordError({ message, passwordRequirements: result.passwordRequirements });
            return;
          }
          if (isPasswordPolicyMessage(message)) {
            await applyPasswordError({ message });
            return;
          }
          setError(message);
          return;
        }
        if ("redirect" in result) {
          window.location.href = result.redirect;
        }
      } catch {
        setError("Could not save password.");
      }
    });
  }

  if (challenge) {
    return (
      <form onSubmit={submitNewPassword} className="mt-8 space-y-4">
        <p className="text-sm leading-5 text-ink/70">
          Set a new password for <span className="font-semibold text-ink">{challenge.email}</span>.
        </p>
        <label className="block">
          <span className="text-sm font-medium text-ink/70">New password</span>
          <PasswordInput
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={setNewPassword}
          />
        </label>
        {passwordRules.length > 0 && !error ? (
          <LivePasswordRequirements intro={requirementsIntro} rules={passwordRules} password={newPassword} />
        ) : null}
        {hubSetup ? (
          <p role="alert" className="text-sm font-semibold leading-5 text-red-700">
            <HubSetupMessage variant={hubSetup} />
          </p>
        ) : null}
        {error && passwordPolicyError && passwordRules.length > 0 ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <div className="mt-3">
              <LivePasswordRequirements intro="" rules={passwordRules} password={newPassword} />
            </div>
          </div>
        ) : null}
        {error && (!passwordPolicyError || passwordRules.length === 0) ? (
          <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitLogin} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink/70">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 min-h-12 w-full rounded-2xl border border-ink/15 bg-white px-4 text-base"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink/70">Password</span>
        <PasswordInput
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
        />
      </label>
      {hubSetup ? (
        <p role="alert" className="text-sm font-semibold leading-5 text-red-700">
          <HubSetupMessage variant={hubSetup} />
        </p>
      ) : null}
      {error && passwordPolicyError && passwordRequirements.length > 0 ? (
        <div role="alert">
          <PasswordRequirements intro={error} requirements={passwordRequirements} tone="error" />
        </div>
      ) : null}
      {error && (!passwordPolicyError || passwordRequirements.length === 0) ? (
        <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
