"use client";

import { useEffect } from "react";

import { signedOutRecently } from "@/lib/auth/signed-out-guard";

/** If Cognito session is still valid, leave the login page. */
export function LoginSessionRedirect() {
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (signedOutRecently()) return;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
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
