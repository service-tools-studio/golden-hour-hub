"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ButtonLoadingLabel } from "@/components/ui";

export function useUnsavedNavigation(active: boolean, blocked: () => boolean, onBlock: (href: string) => void) {
  const activeRef = useRef(active);
  const blockedRef = useRef(blocked);
  const onBlockRef = useRef(onBlock);
  activeRef.current = active;
  blockedRef.current = blocked;
  onBlockRef.current = onBlock;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!activeRef.current || !blockedRef.current()) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.hasAttribute("data-skip-unsaved")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}`;
      if (next === `${window.location.pathname}${window.location.search}`) return;
      event.preventDefault();
      event.stopPropagation();
      onBlockRef.current(next);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

export function routeMatchesPendingNavigation(pathname: string, href: string): boolean {
  const targetPath = href.split("?")[0];
  const currentPath = pathname.split("?")[0];
  if (targetPath === "/admin" || targetPath === "/cleaner") return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function pendingNavigationLabel(href: string): string {
  const path = href.split("?")[0];
  if (path.startsWith("/admin/jobs/new")) return "Opening new cleaning…";
  if (/^\/admin\/jobs\/[^/]+\/edit$/.test(path)) return "Opening cleaning…";
  const labels: Record<string, string> = {
    "/admin": "Dashboard",
    "/admin/schedule": "Schedule",
    "/admin/customers": "Customers",
    "/admin/team": "Team",
    "/cleaner": "Home",
    "/cleaner/schedule": "My Schedule",
    "/cleaner/availability": "Availability",
  };
  const name = labels[path];
  return name ? `Opening ${name}…` : "Loading…";
}

/** Full-screen “Saved” + navigation spinner after a successful save that routes away. */
export function PendingNavigationOverlay({
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
        <h2 className="text-lg font-semibold">Saved</h2>
        <p className="mt-4 flex min-h-12 items-center justify-center">
          <ButtonLoadingLabel label={pendingNavigationLabel(href)} />
        </p>
      </div>
    </div>
  );
}

export function UnsavedChangesDialog({
  open,
  pendingHref,
  onSave,
  onDiscard,
  onDismiss,
  onNavigationComplete,
}: {
  open: boolean;
  pendingHref?: string | null;
  onSave: () => void | boolean | Promise<void | boolean>;
  onDiscard: () => void;
  onDismiss: () => void;
  onNavigationComplete?: () => void;
}) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "saving" | "navigating">("idle");

  useEffect(() => {
    if (!open) setPhase("idle");
  }, [open]);

  useEffect(() => {
    if (phase !== "navigating" || !pendingHref) return;
    if (routeMatchesPendingNavigation(pathname, pendingHref)) {
      setPhase("idle");
      onNavigationComplete?.();
    }
  }, [pathname, phase, pendingHref, onNavigationComplete]);

  async function handleSave() {
    if (phase !== "idle") return;
    flushSync(() => setPhase("saving"));
    try {
      const result = await Promise.resolve(onSave());
      if (result === false) {
        setPhase("idle");
        return;
      }
      if (pendingHref) {
        setPhase("navigating");
        return;
      }
      onDismiss();
      setPhase("idle");
    } catch {
      setPhase("idle");
    }
  }

  if (!open) return null;

  const busy = phase !== "idle";
  const navigating = phase === "navigating";
  const saving = phase === "saving";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28"
      onClick={busy ? undefined : onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-busy={busy}
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        {saving ? (
          <>
            <h2 id="unsaved-title" className="text-lg font-semibold">Saving…</h2>
            <p className="mt-4 flex min-h-12 items-center justify-center">
              <ButtonLoadingLabel label="Saving…" />
            </p>
          </>
        ) : navigating ? (
          <>
            <h2 id="unsaved-title" className="text-lg font-semibold">Saved</h2>
            <p className="mt-4 flex min-h-12 items-center justify-center">
              <ButtonLoadingLabel label={pendingHref ? pendingNavigationLabel(pendingHref) : "Loading…"} />
            </p>
          </>
        ) : (
          <>
            <h2 id="unsaved-title" className="text-lg font-semibold">
              Unsaved changes
            </h2>
            <p className="mt-1 text-sm leading-5 text-ink/70">Save before leaving, or discard the edits.</p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={busy}
                aria-busy={saving}
                onClick={() => void handleSave()}
                className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream disabled:opacity-70"
              >
                {saving ? <ButtonLoadingLabel label="Saving…" /> : "Save"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDiscard}
                className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink disabled:opacity-70"
              >
                Discard changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDismiss}
                className="min-h-12 w-full text-base font-semibold text-ink/70 disabled:opacity-70"
              >
                Keep editing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
