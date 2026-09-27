"use client";

import Link from "next/link";
import { BottomNav, adminNav, cleanerNav } from "@/components/bottom-nav";
import { useHub } from "@/components/hub-provider";
import type { AppRole } from "@/lib/domain/types";

export function RoleGate({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const hub = useHub();
  if (hub.role !== role) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
        <p className="text-xl font-semibold">
          {role === "ADMIN" ? "This area is for Golden Hour admins." : "This area is for cleaners."}
        </p>
        <Link href="/" className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
          Choose a view
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
