"use client";

import { useEffect, useRef, useState } from "react";
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

export function UnsavedChangesDialog({
  open,
  onSave,
  onDiscard,
  onDismiss,
}: {
  open: boolean;
  onSave: () => void | boolean | Promise<void | boolean>;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setSaving(false);
  }, [open]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave());
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-5 pb-28" onClick={onDismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="unsaved-title" className="text-lg font-semibold">
          Unsaved changes
        </h2>
        <p className="mt-1 text-sm leading-5 text-ink/70">Save before leaving, or discard the edits.</p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={saving}
            aria-busy={saving}
            onClick={() => void handleSave()}
            className="min-h-12 w-full rounded-2xl bg-ink text-base font-semibold text-cream disabled:opacity-70"
          >
            {saving ? <ButtonLoadingLabel label="Saving…" /> : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDiscard}
            className="min-h-12 w-full rounded-2xl bg-cream text-base font-semibold text-ink disabled:opacity-70"
          >
            Discard changes
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDismiss}
            className="min-h-12 w-full text-base font-semibold text-ink/70 disabled:opacity-70"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
