"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export type SheetAction = { label: string; href: string; newTab?: boolean };

export function ActionSheet({
  title,
  detail,
  actions,
  onClose,
}: {
  title: string;
  detail?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-5 pb-28"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-3xl bg-white p-5 text-ink shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {detail ? <p className="mt-1 text-sm leading-5 text-ink/70">{detail}</p> : null}
        <div className="mt-4 space-y-2">
          {actions.map((action, index) => (
            <a
              key={action.label}
              href={action.href}
              target={action.newTab ? "_blank" : undefined}
              rel={action.newTab ? "noreferrer" : undefined}
              onClick={onClose}
              className={`flex min-h-12 w-full items-center justify-center rounded-2xl text-base font-semibold ${
                index === 0 ? "bg-ink text-cream" : "bg-cream text-ink"
              }`}
            >
              {action.label}
            </a>
          ))}
          <button type="button" onClick={onClose} className="min-h-12 w-full text-base font-semibold text-ink/70">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
