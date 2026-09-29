/**
 * Standalone port of the internal quote calculator's pricing + time math,
 * for reuse in other apps. No imports — copy this file as-is.
 *
 * Must stay in sync with InternalQuoteCalculator.jsx and startingAtPricing.js.
 * Excludes add-ons (fridge, oven, second kitchen) and promo codes.
 */

export type CleanType = "standard" | "deep" | "move_out";
export type Condition = "light" | "moderate" | "heavy";

export type QuoteEstimateInput = {
  bedrooms: number;
  /** Snapped to 0.5 increments (2.5 = two full + one half). */
  bathrooms: number;
  /** 0 / omitted → estimated from bedrooms (700 + 200 × beds). */
  sqft?: number;
  cleanType: CleanType;
};

export type PriceRange = { low: number; high: number };

export type QuoteEstimate = {
  /** Published "Starting at" price for this home size; null when beyond the tiers. */
  startingAt: number | null;
  /** Square-footage cap for the startingAt tier, such as 1500. */
  startingAtMaxSqft: number | null;
  /** Typical upper price quoted alongside startingAt (phone script). */
  typicalHigh: number | null;
  /** Full estimate range across all conditions. */
  estimate: PriceRange;
  /** Light, moderate, and heavy bands of the full estimate. */
  ranges: Record<Condition, PriceRange>;
  time: {
    cleaners: number;
    /** On-site hours, rounded to 0.5. */
    hoursLow: number;
    hoursHigh: number;
    displayText: string;
  };
  /** Over 16 person-hours — calculator asks the customer to call instead. */
  isLargeJob: boolean;
  /** Square footage the estimate used (entered or bedroom-estimated). */
  sqftUsed: number;
};

const RATE_PER_SQFT: Record<CleanType, PriceRange> = {
  standard: { low: 0.14, high: 0.2 },
  deep: { low: 0.26, high: 0.4 },
  move_out: { low: 0.4, high: 0.5 },
};

const BATH_RATE_PER_SQFT: Record<CleanType, PriceRange> = {
  standard: { low: 0.22, high: 0.4 },
  deep: { low: 0.52, high: 0.8 },
  move_out: { low: 0.8, high: 1.0 },
};

const SQFT_PER_HOUR: Record<CleanType, { fast: number; slow: number }> = {
  standard: { fast: 290 / 0.8, slow: 290 / 0.8 },
  deep: { fast: 90 / 0.26, slow: 225 },
  move_out: { fast: 225, slow: 180 },
};

const MIN_CHARGE: Record<CleanType, number> = {
  standard: 150,
  deep: 250,
  move_out: 350,
};

/** Published tiers plus internal-only 3,000 sq ft tiers for deep / move-out. */
const STARTING_AT_TIERS: Record<CleanType, { maxSqft: number; startingAt: number }[]> = {
  standard: [
    { maxSqft: 1500, startingAt: 150 },
    { maxSqft: 2000, startingAt: 222 },
    { maxSqft: 3000, startingAt: 292 },
  ],
  deep: [
    { maxSqft: 1000, startingAt: 250 },
    { maxSqft: 1500, startingAt: 300 },
    { maxSqft: 2000, startingAt: 429 },
    { maxSqft: 3000, startingAt: 559 },
  ],
  move_out: [
    { maxSqft: 1000, startingAt: 350 },
    { maxSqft: 1500, startingAt: 460 },
    { maxSqft: 2000, startingAt: 660 },
    { maxSqft: 3000, startingAt: 860 },
  ],
};

const FULL_BATH_SQFT = 150;
const BATH_TIME_MULTIPLIER = 1.5;
const MIN_VISIT_HOURS_ONE_CLEANER = 2;
const MAX_ON_SITE_HOURS = 4;
const MAX_TOTAL_PERSON_HOURS = 16;

const toMoney = (n: number) => Math.max(0, Math.round(n));
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const trimHours = (h: number) => {
  const s = h.toFixed(1);
  return s.endsWith(".0") ? String(Math.round(h)) : s;
};
const hoursUnit = (h: number) => (Math.abs(h - 1) < 1e-9 ? "hour" : "hours");

function splitConditionBands(low: number, high: number): Record<Condition, PriceRange> {
  const lo = Math.round(low);
  const hi = Math.round(high);
  if (hi <= lo) {
    const flat = { low: lo, high: hi };
    return { light: flat, moderate: flat, heavy: flat };
  }
  const third = Math.max(1, Math.floor((hi - lo) / 3));
  const lightHigh = Math.min(lo + third - 1, hi - 2);
  const modLow = lightHigh + 1;
  const modHigh = Math.min(modLow + third - 1, hi - 1);
  return {
    light: { low: lo, high: lightHigh },
    moderate: { low: modLow, high: modHigh },
    heavy: { low: modHigh + 1, high: hi },
  };
}

export function calculateQuoteEstimate(input: QuoteEstimateInput): QuoteEstimate {
  const { cleanType } = input;
  const bedrooms = Math.max(0, Math.floor(Number(input.bedrooms) || 0));
  const baths = Math.max(0, Math.round((Number(input.bathrooms) || 0) * 2) / 2);
  const sqftInput = Math.max(0, Number(input.sqft) || 0);
  const sqft = sqftInput > 0 ? sqftInput : bedrooms > 0 ? 700 + bedrooms * 200 : 0;

  const rate = RATE_PER_SQFT[cleanType];
  const bathRate = BATH_RATE_PER_SQFT[cleanType];
  const productivity = SQFT_PER_HOUR[cleanType];

  const bathSqft = Math.round(baths * FULL_BATH_SQFT);
  const bathsDominate = bathSqft > 0 && bathSqft >= Math.max(sqft, 1);

  // --- Time (scheduling only; does not affect price) ---
  const bathTimeMult = bathsDominate ? BATH_TIME_MULTIPLIER : 1;
  const personHoursLow = Math.max(
    MIN_VISIT_HOURS_ONE_CLEANER,
    sqft / productivity.fast + baths * (FULL_BATH_SQFT / productivity.fast) * bathTimeMult,
  );
  const personHoursHigh = Math.max(
    MIN_VISIT_HOURS_ONE_CLEANER,
    sqft / productivity.slow + baths * (FULL_BATH_SQFT / productivity.slow) * bathTimeMult,
  );
  const cleaners = Math.max(1, Math.ceil(personHoursHigh / MAX_ON_SITE_HOURS));
  const hoursLow = roundTo(personHoursLow / cleaners, 0.5);
  const hoursHigh = roundTo(personHoursHigh / cleaners, 0.5);
  const hasTimeRange =
    Math.abs(hoursHigh - hoursLow) >= 0.26 ||
    Math.abs(hoursHigh * cleaners - hoursLow * cleaners) >= 0.26;
  const displayText = hasTimeRange
    ? `${trimHours(hoursLow)}–${trimHours(hoursHigh)} ${hoursUnit(hoursHigh)}`
    : `~${trimHours(hoursHigh)} ${hoursUnit(hoursHigh)}`;

  // --- Price ---
  let priceLow: number;
  let priceHigh: number;
  if (bathsDominate) {
    priceLow = toMoney(bathSqft * bathRate.low);
    priceHigh = toMoney(bathSqft * bathRate.high);
  } else if (cleanType === "standard") {
    const livingSqft = bathSqft > 0 && bathSqft < Math.max(sqft, 1) ? sqft - bathSqft : sqft;
    priceLow = toMoney(livingSqft * rate.low) + toMoney(bathSqft * bathRate.low);
    priceHigh = toMoney(livingSqft * rate.high) + toMoney(bathSqft * bathRate.high);
  } else {
    const billableSqft = Math.round(sqft + bathSqft);
    priceLow = billableSqft * rate.low;
    priceHigh = billableSqft * rate.high;
  }
  const minCharge = MIN_CHARGE[cleanType];
  const estimate = {
    low: toMoney(Math.max(priceLow, minCharge)),
    high: toMoney(Math.max(priceHigh, minCharge)),
  };
  const ranges = splitConditionBands(estimate.low, estimate.high);

  const tier = sqft > 0 ? STARTING_AT_TIERS[cleanType].find((t) => sqft <= t.maxSqft) : undefined;
  const startingAt = tier?.startingAt ?? null;

  return {
    startingAt,
    startingAtMaxSqft: tier?.maxSqft ?? null,
    typicalHigh: startingAt != null ? Math.ceil((startingAt + 150) / 50) * 50 : null,
    estimate,
    ranges,
    time: { cleaners, hoursLow, hoursHigh, displayText },
    isLargeJob: hoursHigh * cleaners > MAX_TOTAL_PERSON_HOURS,
    sqftUsed: Math.round(sqft),
  };
}
