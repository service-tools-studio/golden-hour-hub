"use client";

import { useState, useTransition } from "react";
import { completeNewPasswordAction, signInAction } from "@/app/actions/auth";

type ChallengeState = { email: string; session: string };

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await signInAction(email, password);
        if (!result.ok) {
          setError(result.message ?? "Sign-in failed.");
          return;
        }
        if ("challenge" in result && result.challenge === "NEW_PASSWORD_REQUIRED") {
          setChallenge({ email: result.email, session: result.session });
          setPassword("");
        }
      } catch (caught) {
        if (caught && typeof caught === "object" && "digest" in caught) return;
        setError("Could not sign in.");
      }
    });
  }

  function submitNewPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeNewPasswordAction(challenge.email, newPassword, challenge.session);
        if (!result.ok) {
          setError(result.message ?? "Could not set password.");
        }
      } catch (caught) {
        if (caught && typeof caught === "object" && "digest" in caught) return;
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
          <input
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-2xl border border-ink/15 bg-white px-4 text-base"
          />
        </label>
        {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
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
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 min-h-12 w-full rounded-2xl border border-ink/15 bg-white px-4 text-base"
        />
      </label>
      {error ? <p role="alert" className="text-sm font-semibold text-red-700">{error}</p> : null}
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
