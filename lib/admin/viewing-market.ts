import {
  DEFAULT_MARKET_ID,
  isAdminMarketFilter,
  isMarketId,
  type AdminMarketFilter,
  type MarketId,
} from "../domain/markets.ts";

const FILTER_KEY = "ghh-admin-market-filter";
const VIEWING_KEY = "ghh-admin-viewing-market";

export function readStoredAdminMarketFilter(): AdminMarketFilter {
  if (typeof window === "undefined") return DEFAULT_MARKET_ID;
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    return isAdminMarketFilter(raw) ? raw : DEFAULT_MARKET_ID;
  } catch {
    return DEFAULT_MARKET_ID;
  }
}

export function readStoredAdminViewingMarket(): MarketId {
  if (typeof window === "undefined") return DEFAULT_MARKET_ID;
  try {
    const raw = sessionStorage.getItem(VIEWING_KEY);
    return isMarketId(raw) ? raw : DEFAULT_MARKET_ID;
  } catch {
    return DEFAULT_MARKET_ID;
  }
}

export function writeStoredAdminMarket(filter: AdminMarketFilter, viewingMarketId: MarketId): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FILTER_KEY, filter);
    sessionStorage.setItem(VIEWING_KEY, viewingMarketId);
  } catch {
    /* private mode */
  }
}
