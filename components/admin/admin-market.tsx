"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ADMIN_MARKET_FILTER_LABELS,
  ADMIN_MARKET_FILTERS,
  DEFAULT_MARKET_ID,
  timeZoneForMarket,
  type AdminMarketFilter,
  type MarketId,
} from "@/lib/domain/markets";
import { todayInTimeZone } from "@/lib/domain/time";
import {
  readStoredAdminMarketFilter,
  readStoredAdminViewingMarket,
  writeStoredAdminMarket,
} from "@/lib/admin/viewing-market";
import { useNow } from "@/components/use-now";

type AdminMarketContextValue = {
  marketFilter: AdminMarketFilter;
  setMarketFilter: (filter: AdminMarketFilter) => void;
  viewingMarketId: MarketId;
  viewingTimeZone: string;
  viewingToday: string;
};

const AdminMarketContext = createContext<AdminMarketContextValue | null>(null);

export function AdminMarketProvider({ children }: { children: React.ReactNode }) {
  const now = useNow();
  const [marketFilter, setMarketFilterState] = useState<AdminMarketFilter>(DEFAULT_MARKET_ID);
  const [viewingMarketId, setViewingMarketId] = useState<MarketId>(DEFAULT_MARKET_ID);

  useEffect(() => {
    const storedFilter = readStoredAdminMarketFilter();
    const storedViewing = readStoredAdminViewingMarket();
    setMarketFilterState(storedFilter);
    setViewingMarketId(storedFilter === "all" ? storedViewing : storedFilter);
  }, []);

  const setMarketFilter = useCallback((filter: AdminMarketFilter) => {
    const nextViewing = filter === "all" ? viewingMarketId : filter;
    setMarketFilterState(filter);
    setViewingMarketId(nextViewing);
    writeStoredAdminMarket(filter, nextViewing);
  }, [viewingMarketId]);

  const viewingTimeZone = timeZoneForMarket(viewingMarketId);
  const viewingToday = todayInTimeZone(viewingTimeZone, new Date(now));

  const value = useMemo(
    () => ({
      marketFilter,
      setMarketFilter,
      viewingMarketId,
      viewingTimeZone,
      viewingToday,
    }),
    [marketFilter, setMarketFilter, viewingMarketId, viewingTimeZone, viewingToday],
  );

  return <AdminMarketContext.Provider value={value}>{children}</AdminMarketContext.Provider>;
}

export function useAdminMarket(): AdminMarketContextValue {
  const value = useContext(AdminMarketContext);
  if (!value) throw new Error("useAdminMarket must be used inside AdminMarketProvider");
  return value;
}

export function AdminMarketTabs() {
  const { marketFilter, setMarketFilter } = useAdminMarket();
  return (
    <div className="flex border-b border-ink/12" role="tablist" aria-label="Market">
      {ADMIN_MARKET_FILTERS.map((filter) => {
        const selected = marketFilter === filter;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setMarketFilter(filter)}
            className={`-mb-px flex-1 border-b-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
              selected ? "border-gold text-ink" : "border-transparent text-ink/45"
            }`}
          >
            {ADMIN_MARKET_FILTER_LABELS[filter]}
          </button>
        );
      })}
    </div>
  );
}
