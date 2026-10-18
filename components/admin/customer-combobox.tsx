"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useHub } from "@/components/hub-provider";
import { Field, fieldClass } from "@/components/ui";
import type { Customer, Property } from "@/lib/domain/types";
import {
  findCustomerByExactName,
  newCustomerHrefWithName,
  parseTypedCustomerName,
} from "@/lib/domain/customers";

function ClearSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CustomerCombobox({
  query,
  onQueryChange,
  matches,
  propertyLine,
  newCustomerHref,
  onChoose,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matches: Customer[];
  propertyLine: (home: Property) => string;
  newCustomerHref: string;
  onChoose: (customerId: string) => void;
}) {
  const hub = useHub();
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();
  const parsed = parseTypedCustomerName(query);
  const exactMatch =
    parsed.firstName && parsed.lastName
      ? findCustomerByExactName(hub.customers, parsed.firstName, parsed.lastName)
      : undefined;
  const createHref =
    trimmed && parsed.firstName && matches.length === 0 && !exactMatch
      ? newCustomerHrefWithName(newCustomerHref, query)
      : null;
  const addCustomerLabel = parsed.lastName
    ? `Add ${parsed.firstName} ${parsed.lastName} as new customer`
    : `Add ${parsed.firstName} as new customer`;
  const showList = open && trimmed.length > 0 && (matches.length > 0 || createHref);
  const optionCount = matches.length + (createHref ? 1 : 0);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function selectMatch(customerId: string) {
    onChoose(customerId);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || optionCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % optionCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? optionCount - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      if (activeIndex < matches.length) {
        selectMatch(matches[activeIndex].customerId);
      } else if (createHref) {
        router.push(createHref);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <Field label="Customer">
      <div ref={rootRef} className="relative">
        <input
          ref={inputRef}
          className={`${fieldClass} pr-11`}
          placeholder="Customer name"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => trimmed && setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Customer name"
          aria-autocomplete="list"
          aria-controls={showList ? listId : undefined}
          aria-expanded={showList ? true : false}
          role="combobox"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear customer search"
            onClick={() => {
              onQueryChange("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-ink/55"
          >
            <ClearSearchIcon />
          </button>
        ) : null}
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-2xl border border-ink/12 bg-white py-1 shadow-[0_8px_30px_rgba(51,51,51,0.16)]"
          >
            {matches.map((item, index) => {
              const homes = hub.properties.filter(
                (home) => home.customerId === item.customerId && home.status === "ACTIVE",
              );
              return (
                <li key={item.customerId} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={`block w-full px-3 py-3 text-left ${index === activeIndex ? "bg-cream" : "hover:bg-cream"}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMatch(item.customerId)}
                  >
                    <span className="block font-semibold">
                      {item.firstName} {item.lastName}
                    </span>
                    {homes.map((home) => (
                      <span key={home.propertyId} className="block text-sm text-ink/70">
                        {propertyLine(home)}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
            {createHref ? (
              <li role="option" aria-selected={activeIndex === matches.length} className="p-1 pt-2">
                <Link
                  href={createHref}
                  className={`block rounded-2xl bg-gold px-3 py-3 text-left ${
                    activeIndex === matches.length ? "ring-2 ring-ink/25" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <span className="block text-base font-semibold text-ink">{addCustomerLabel}</span>
                  <span className="mt-0.5 block text-sm text-ink/70">Opens profile form, then returns here</span>
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
