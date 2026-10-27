"use client";

import { useState } from "react";
import { ActionSheet } from "@/components/action-sheet";

const ADDRESS_UNDERLINE = "underline decoration-ink/25 decoration-1 underline-offset-2";

export type AddressPlace = {
  streetAddress: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export function fullAddress(place: AddressPlace): string {
  const { streetLine, cityLine } = jobAddressDisplay(place);
  return cityLine ? `${streetLine}, ${cityLine}` : streetLine;
}

/**
 * Street is meant to be just the street line; city/state/zip are separate fields.
 * When street already contains a formatted address (common if the full suggestion was pasted
 * into Street), avoid a second line that repeats a different city.
 */
export function jobAddressDisplay(place: AddressPlace): { streetLine: string; cityLine: string | null } {
  const unit = place.unit?.trim();
  const streetLine = [place.streetAddress.trim(), unit].filter(Boolean).join(", ");
  const city = place.city?.trim();
  const state = place.state?.trim();
  const zip = place.zip?.trim();
  const cityLine = city
    ? [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : [state, zip].filter(Boolean).join(" ") || null;

  const commaParts = place.streetAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const streetLooksFormatted =
    commaParts.length >= 2 &&
    Boolean(state) &&
    commaParts.some((part) => part === state || part.startsWith(`${state} `));

  if (streetLooksFormatted) {
    return { streetLine, cityLine: null };
  }
  if (city && streetLine.toLowerCase().includes(city.toLowerCase())) {
    return { streetLine, cityLine: null };
  }
  return { streetLine, cityLine: cityLine || null };
}

export function JobAddressText({ place }: { place: AddressPlace }) {
  const { streetLine, cityLine } = jobAddressDisplay(place);
  return (
    <>
      {streetLine}
      {cityLine ? (
        <>
          <br />
          {cityLine}
        </>
      ) : null}
    </>
  );
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
