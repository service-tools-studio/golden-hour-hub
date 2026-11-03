"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_PADDING_PX = 20;
const GAP_PX = 8;

function clampTooltipPosition(anchor: HTMLElement, tooltip: HTMLElement): { top: number; left: number } {
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
  left = Math.max(VIEWPORT_PADDING_PX, Math.min(left, vw - tooltipRect.width - VIEWPORT_PADDING_PX));

  let top = anchorRect.bottom + GAP_PX;
  if (top + tooltipRect.height > vh - VIEWPORT_PADDING_PX) {
    top = anchorRect.top - tooltipRect.height - GAP_PX;
  }
  top = Math.max(VIEWPORT_PADDING_PX, Math.min(top, vh - tooltipRect.height - VIEWPORT_PADDING_PX));

  return { top, left };
}

export function InfoTooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const anchor = rootRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    function updatePosition() {
      if (!rootRef.current || !tooltipRef.current) return;
      setPosition(clampTooltipPosition(rootRef.current, tooltipRef.current));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !tooltipRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex align-middle">
      <button
        type="button"
        className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-ink/55 ring-1 ring-ink/15 hover:text-ink"
        aria-expanded={open}
        aria-controls={id}
        aria-label="More information"
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      {open ? (
        <span
          ref={tooltipRef}
          id={id}
          role="tooltip"
          className={`fixed z-50 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl bg-mint px-3 py-2 text-left text-sm font-normal leading-snug text-ink shadow-[0_8px_30px_rgba(51,51,51,0.12)] ring-1 ring-ink/10 ${
            position ? "visible" : "invisible"
          }`}
          style={
            position
              ? { top: position.top, left: position.left }
              : { top: VIEWPORT_PADDING_PX, left: VIEWPORT_PADDING_PX }
          }
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function FieldLabelWithTooltip({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-0.5 text-sm font-medium text-ink/80">
      {label}
      {tooltip ? <InfoTooltip text={tooltip} /> : null}
    </span>
  );
}
