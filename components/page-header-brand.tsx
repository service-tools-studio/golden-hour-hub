"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PageHeaderBrand() {
  const pathname = usePathname() ?? "";
  const href =
    pathname.startsWith("/cleaner") || pathname.startsWith("/onboarding") ? "/cleaner" : "/admin";
  return (
    <Link
      href={href}
      className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50 hover:text-ink/70"
    >
      Golden Hour Hub
    </Link>
  );
}
