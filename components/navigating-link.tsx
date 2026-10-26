"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ButtonLoadingLabel } from "@/components/ui";
import { pendingNavigationLabel, routeMatchesPendingNavigation } from "@/components/unsaved-changes";

function NavigationLoadingOverlay({
  href,
  onComplete,
}: {
  href: string;
  onComplete?: () => void;
}) {
  const pathname = usePathname();
  useEffect(() => {
    if (!routeMatchesPendingNavigation(pathname, href)) return;
    onComplete?.();
  }, [pathname, href, onComplete]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
      >
        <p className="flex min-h-12 items-center justify-center">
          <ButtonLoadingLabel label={pendingNavigationLabel(href)} />
        </p>
      </div>
    </div>
  );
}

export function NavigatingLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setPending(true);
    router.push(href);
  }

  return (
    <>
      <Link href={href} onClick={onClick} className={className} aria-busy={pending}>
        {children}
      </Link>
      {pending ? <NavigationLoadingOverlay href={href} onComplete={() => setPending(false)} /> : null}
    </>
  );
}
