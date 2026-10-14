"use client";

import { useState } from "react";
import { ActionSheet } from "@/components/action-sheet";

const ADDRESS_UNDERLINE = "underline decoration-ink/25 decoration-1 underline-offset-2";

export function fullAddress(place: { streetAddress: string; city?: string; state?: string; zip?: string }): string {
  const region = [place.state, place.zip].filter(Boolean).join(" ");
  return [place.streetAddress, place.city, region].filter(Boolean).join(", ");
}

export function AddressLink({
  address,
  children,
  className = "",
}: {
  address: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = encodeURIComponent(address);

  function show(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Open ${address} in maps`}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") show(event);
        }}
        className={`cursor-pointer ${ADDRESS_UNDERLINE} ${className}`}
      >
        {children}
      </span>
      {open ? (
        <ActionSheet
          title="Open address"
          detail={address}
          onClose={() => setOpen(false)}
          actions={[
            { label: "Google Maps", href: `https://www.google.com/maps/search/?api=1&query=${query}`, newTab: true },
            { label: "Apple Maps", href: `https://maps.apple.com/?q=${query}`, newTab: true },
          ]}
        />
      ) : null}
    </>
  );
}
