"use client";

import Link from "next/link";
import { useHub } from "@/components/hub-provider";
import { previewAuthAllowed } from "@/lib/auth/preview-mode";

export function PreviewModeBanner() {
  const hub = useHub();
  if (!hub.previewAuth || !previewAuthAllowed()) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 border-b border-amber-200/90 bg-amber-50 px-4 py-2.5 text-center text-sm leading-5 text-ink/85"
    >
      <span className="font-semibold text-ink">Preview mode.</span> Changes are not saved to the database. Set{" "}
      <code className="rounded bg-amber-100/80 px-1 text-xs">AUTH_SESSION_SECRET</code> and sign in at{" "}
      <Link href="/login" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-2">
        /login
      </Link>{" "}
      to persist edits.
    </div>
  );
}
