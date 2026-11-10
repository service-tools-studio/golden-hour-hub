export const MARKET_IDS = ["portland", "phoenix"] as const;

export type MarketId = (typeof MARKET_IDS)[number];

export const MARKET_TIME_ZONES = {
  portland: "America/Los_Angeles",
  phoenix: "America/Phoenix",
} as const satisfies Record<MarketId, string>;

export const DEFAULT_MARKET_ID: MarketId = "portland";

export const ADMIN_MARKET_FILTERS = ["portland", "phoenix", "all"] as const;

export type AdminMarketFilter = (typeof ADMIN_MARKET_FILTERS)[number];

export const ADMIN_MARKET_FILTER_LABELS: Record<AdminMarketFilter, string> = {
  portland: "Portland",
  phoenix: "Phoenix",
  all: "All",
};

export function isMarketId(value: unknown): value is MarketId {
  return value === "portland" || value === "phoenix";
}

export function isAdminMarketFilter(value: unknown): value is AdminMarketFilter {
  return value === "portland" || value === "phoenix" || value === "all";
}

export function timeZoneForMarket(marketId: MarketId): string {
  return MARKET_TIME_ZONES[marketId];
}

export function readMarketId(value: unknown, fallback: MarketId = DEFAULT_MARKET_ID): MarketId {
  return isMarketId(value) ? value : fallback;
}

export function jobMatchesAdminMarket(
  job: { snapshot: { marketId?: unknown } },
  filter: AdminMarketFilter,
): boolean {
  if (filter === "all") return true;
  return readMarketId(job.snapshot.marketId) === filter;
}

export function cleanerMatchesAdminMarket(
  cleaner: { homeMarketId?: unknown },
  filter: AdminMarketFilter,
): boolean {
  if (filter === "all") return true;
  return readMarketId(cleaner.homeMarketId) === filter;
}

export function cleanerMatchesJobMarket(
  cleaner: { homeMarketId?: unknown },
  jobMarketId: unknown,
): boolean {
  return readMarketId(cleaner.homeMarketId) === readMarketId(jobMarketId);
}

export const CROSS_MARKET_STAFFING_MESSAGE =
  "This cleaner works in a different market than this cleaning.";

export function customerMatchesAdminMarket(
  customerId: string,
  properties: Array<{ customerId: string; marketId?: unknown }>,
  filter: AdminMarketFilter,
): boolean {
  if (filter === "all") return true;
  return properties.some(
    (property) => property.customerId === customerId && readMarketId(property.marketId) === filter,
  );
}
