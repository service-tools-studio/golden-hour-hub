"use client";

import { useEffect } from "react";

/** If Cognito session is still valid, leave the login page. */
export function LoginSessionRedirect() {
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = (await response.json()) as {
          session?: { role: "ADMIN" | "CLEANER" } | null;
        };
        if (cancelled || !data.session) return;
        window.location.replace(data.session.role === "ADMIN" ? "/admin" : "/cleaner");
      } catch {
        /* stay on login */
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
