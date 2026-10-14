"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ParsedAddress } from "@/lib/google-places-api";

type PlaceSuggestion = {
  placeId: string;
  label: string;
};

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (address: ParsedAddress) => void;
  className?: string;
  "aria-invalid"?: boolean;
};

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  className,
  "aria-invalid": invalid,
}: AddressAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const requestId = useRef(0);
  const skipFetchForValue = useRef(false);

  useEffect(() => {
    if (skipFetchForValue.current) {
      skipFetchForValue.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(query)}`);
        if (id !== requestId.current) return;
        if (!response.ok) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const payload = (await response.json()) as { suggestions?: PlaceSuggestion[] };
        const next = payload.suggestions ?? [];
        setSuggestions(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  async function choose(suggestion: PlaceSuggestion) {
    requestId.current += 1;
    skipFetchForValue.current = true;
    setOpen(false);
    setSuggestions([]);
    setLoading(false);
    setActiveIndex(-1);
    const response = await fetch(`/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`);
    if (!response.ok) {
      onChange(suggestion.label.split(",")[0]?.trim() ?? suggestion.label);
      return;
    }
    const payload = (await response.json()) as { address?: ParsedAddress };
    if (payload.address) {
      onChange(payload.address.streetAddress);
      onSelect?.(payload.address);
      return;
    }
    onChange(suggestion.label.split(",")[0]?.trim() ?? suggestion.label);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0 && !skipFetchForValue.current) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            void choose(suggestions[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        autoComplete="off"
        role="combobox"
        placeholder="Start typing an address…"
      />
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-y-auto rounded-2xl border border-ink/12 bg-white py-1 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.placeId} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`block w-full px-3 py-3 text-left text-base leading-5 ${
                  index === activeIndex ? "bg-cream" : "hover:bg-cream"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(suggestion)}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? (
        <p className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink/40">…</p>
      ) : null}
    </div>
  );
}
