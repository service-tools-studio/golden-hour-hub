"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BottomNav, adminNav, cleanerNav } from "@/components/bottom-nav";
import { useHub } from "@/components/hub-provider";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";
import type { AppRole } from "@/lib/domain/types";

export function RoleGate({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const hub = useHub();

  useEffect(() => {
    if ((hub.previewAuth && previewAuthAllowed()) || !hub.ready) return;
    if (hub.role === null) {
      window.location.replace("/login");
    }
  }, [hub.previewAuth, hub.ready, hub.role]);

  if (!hub.ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-5 text-sm text-ink/60" aria-busy="true">
        Loading…
      </div>
    );
  }

  if (hub.role === null) {
    if (hub.previewAuth && previewAuthAllowed()) {
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
          <p className="text-xl font-semibold">Choose a role to continue.</p>
          <Link href="/" className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
            Open role switcher
          </Link>
        </main>
      );
    }
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream px-5 text-sm text-ink/60" aria-busy="true">
        Loading…
      </div>
    );
  }

  if (hub.role !== role) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
        <p className="text-xl font-semibold">
          {role === "ADMIN" ? "This area is for Golden Hour admins." : "This area is for cleaners."}
        </p>
        <Link href="/" className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
          Back home
        </Link>
      </main>
    );
  }

  return (
    <>
      {children}
      <BottomNav items={role === "ADMIN" ? adminNav : cleanerNav} />
    </>
  );
}
