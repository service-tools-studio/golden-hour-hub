"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: "home" | "calendar" | "people" | "team" | "clock" };

export function BottomNav({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md border-t border-ink/10 bg-[#fffdf6] pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const active = item.href === "/admin" || item.href === "/cleaner" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${
              active ? "text-ink" : "text-ink/45"
            }`}
          >
            <NavIcon name={item.icon} active={active} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavIcon({ name, active }: { name: Item["icon"]; active: boolean }) {
  const color = active ? "#333333" : "#33333380";
  if (name === "calendar") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="3" stroke={color} strokeWidth="1.8" />
        <path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.8" />
        <path d="M12 8v4.5L15 15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "people" || name === "team") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3" stroke={color} strokeWidth="1.8" />
        <path d="M4 19c.6-2.6 2.5-4 5-4s4.4 1.4 5 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="17" cy="9" r="2.2" stroke={color} strokeWidth="1.8" />
        <path d="M16 15c2 .4 3.4 1.6 4 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1v-8.5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export const adminNav: Item[] = [
  { href: "/admin", label: "Dashboard", icon: "home" },
  { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
  { href: "/admin/customers", label: "Customers", icon: "people" },
  { href: "/admin/team", label: "Team", icon: "team" },
];

export const cleanerNav: Item[] = [
  { href: "/cleaner", label: "Home", icon: "home" },
  { href: "/cleaner/schedule", label: "My Schedule", icon: "calendar" },
  { href: "/cleaner/availability", label: "Availability", icon: "clock" },
];
