"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHub } from "@/components/hub-provider";

const className = "flex h-11 shrink-0 items-center text-sm font-medium text-ink/60";

export function HeaderAuthAction() {
  const hub = useHub();
  const router = useRouter();

  if (hub.previewAuth) {
    return (
      <Link href="/" className={className}>
        Switch
      </Link>
    );
  }

  if (!hub.role) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        hub.signOut();
        router.replace("/login");
      }}
    >
      Log out
    </button>
  );
}
