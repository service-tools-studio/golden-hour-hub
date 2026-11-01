import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLACE_AUTOCOMPLETE_FIELD_MASK,
  PLACE_DETAILS_ESSENTIALS_FIELD_MASK,
  parsePlacesApiAddress,
} from "./google-places-api.ts";

describe("google places field masks", () => {
  it("requests Essentials-tier place detail fields only", () => {
    assert.equal(PLACE_DETAILS_ESSENTIALS_FIELD_MASK, "addressComponents,formattedAddress");
    assert.doesNotMatch(PLACE_DETAILS_ESSENTIALS_FIELD_MASK, /\*/);
    assert.doesNotMatch(PLACE_DETAILS_ESSENTIALS_FIELD_MASK, /rating|review|generativeSummary/i);
  });

  it("requests autocomplete prediction fields only", () => {
    assert.doesNotMatch(PLACE_AUTOCOMPLETE_FIELD_MASK, /\*/);
    assert.match(PLACE_AUTOCOMPLETE_FIELD_MASK, /placePrediction\.placeId/);
  });
});

describe("parsePlacesApiAddress", () => {
  it("maps address components to Hub fields", () => {
    const parsed = parsePlacesApiAddress({
      formattedAddress: "123 Main St, Portland, OR 97201, USA",
      addressComponents: [
        { longText: "123", shortText: "123", types: ["street_number"] },
        { longText: "Main Street", shortText: "Main St", types: ["route"] },
        { longText: "Portland", shortText: "Portland", types: ["locality"] },
        { longText: "Oregon", shortText: "OR", types: ["administrative_area_level_1"] },
        { longText: "97201", shortText: "97201", types: ["postal_code"] },
      ],
    });
    assert.deepEqual(parsed, {
      streetAddress: "123 Main Street",
      unit: undefined,
      city: "Portland",
      state: "OR",
      zip: "97201",
    });
  });
});
