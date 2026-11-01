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

/** Essentials-tier only — never add Pro / Enterprise / Atmosphere fields here. */
export const PLACE_DETAILS_ESSENTIALS_FIELD_MASK = "addressComponents,formattedAddress";

/** Autocomplete response fields only — no place details. */
export const PLACE_AUTOCOMPLETE_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.text";

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

const PLACE_ADDRESS_CACHE = new Map<string, { at: number; address: ParsedAddress }>();
const PLACE_ADDRESS_CACHE_MAX = 500;
const PLACE_ADDRESS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readCachedPlaceAddress(placeId: string): ParsedAddress | null | undefined {
  const hit = PLACE_ADDRESS_CACHE.get(placeId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > PLACE_ADDRESS_CACHE_TTL_MS) {
    PLACE_ADDRESS_CACHE.delete(placeId);
    return undefined;
  }
  return hit.address;
}

function writeCachedPlaceAddress(placeId: string, address: ParsedAddress): void {
  if (PLACE_ADDRESS_CACHE.size >= PLACE_ADDRESS_CACHE_MAX) {
    const oldest = PLACE_ADDRESS_CACHE.keys().next().value;
    if (oldest) PLACE_ADDRESS_CACHE.delete(oldest);
  }
  PLACE_ADDRESS_CACHE.set(placeId, { at: Date.now(), address });
}

export async function fetchPlaceSuggestions(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const key = googlePlacesApiKey();
  if (!key || input.trim().length < 3) return [];

  const body: { input: string; includedRegionCodes: string[]; sessionToken?: string } = {
    input: input.trim(),
    includedRegionCodes: ["us"],
  };
  if (sessionToken?.trim()) body.sessionToken = sessionToken.trim();

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACE_AUTOCOMPLETE_FIELD_MASK,
    },
    body: JSON.stringify(body),
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

export async function fetchPlaceAddress(placeId: string, sessionToken?: string): Promise<ParsedAddress | null> {
  const key = googlePlacesApiKey();
  if (!key || !placeId.trim()) return null;

  const normalizedId = placeId.trim();
  const cached = readCachedPlaceAddress(normalizedId);
  if (cached !== undefined) return cached;

  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedId)}`);
  if (sessionToken?.trim()) url.searchParams.set("sessionToken", sessionToken.trim());

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": PLACE_DETAILS_ESSENTIALS_FIELD_MASK,
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
  const parsed = parsePlacesApiAddress(payload);
  if (parsed) writeCachedPlaceAddress(normalizedId, parsed);
  return parsed;
}

/** @internal test helper */
export function clearPlaceAddressCacheForTests(): void {
  PLACE_ADDRESS_CACHE.clear();
}
