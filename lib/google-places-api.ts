export type ParsedAddress = {
  streetAddress: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
};

type PlacesAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

/** Server-only — used from API routes, never imported in client components. */
export function googlePlacesApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? "";
}

export function googlePlacesConfigured(): boolean {
  return googlePlacesApiKey().length > 0;
}

function componentValue(
  components: PlacesAddressComponent[],
  type: string,
  name: "longText" | "shortText" = "longText",
): string {
  return components.find((item) => item.types?.includes(type))?.[name] ?? "";
}

export function parsePlacesApiAddress(place: {
  addressComponents?: PlacesAddressComponent[];
  formattedAddress?: string;
}): ParsedAddress | null {
  const components = place.addressComponents;
  if (!components?.length) return null;

  const streetNumber = componentValue(components, "street_number");
  const route = componentValue(components, "route");
  const streetAddress =
    [streetNumber, route].filter(Boolean).join(" ") ||
    (place.formattedAddress?.split(",")[0]?.trim() ?? "");

  const unit =
    componentValue(components, "subpremise") || componentValue(components, "premise", "shortText") || undefined;

  const city =
    componentValue(components, "locality") ||
    componentValue(components, "postal_town") ||
    componentValue(components, "sublocality") ||
    componentValue(components, "neighborhood");

  const state = componentValue(components, "administrative_area_level_1", "shortText").toUpperCase();
  const zip = componentValue(components, "postal_code", "shortText").replace(/\D/g, "").slice(0, 5);

  if (!streetAddress) return null;
  return { streetAddress, unit: unit?.trim() || undefined, city, state, zip };
}

export type PlaceSuggestion = {
  placeId: string;
  label: string;
};

export async function fetchPlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
  const key = googlePlacesApiKey();
  if (!key || input.trim().length < 3) return [];

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    },
    body: JSON.stringify({
      input: input.trim(),
      includedRegionCodes: ["us"],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[places-autocomplete]", response.status, detail);
    return [];
  }

  const payload = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
      };
    }>;
  };

  return (payload.suggestions ?? [])
    .map((item) => {
      const placeId = item.placePrediction?.placeId;
      const label = item.placePrediction?.text?.text;
      if (!placeId || !label) return null;
      return { placeId, label };
    })
    .filter((item): item is PlaceSuggestion => item !== null);
}

export async function fetchPlaceAddress(placeId: string): Promise<ParsedAddress | null> {
  const key = googlePlacesApiKey();
  if (!key) return null;

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "addressComponents,formattedAddress",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[places-details]", response.status, detail);
    return null;
  }

  const payload = (await response.json()) as {
    addressComponents?: PlacesAddressComponent[];
    formattedAddress?: string;
  };
  return parsePlacesApiAddress(payload);
}
