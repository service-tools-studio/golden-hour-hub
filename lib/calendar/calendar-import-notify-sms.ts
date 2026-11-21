import {
  ADMIN_MARKET_FILTER_LABELS,
  MARKET_IDS,
  type MarketId,
} from "../domain/markets.ts";

/** Ops alert when Gmail calendar sync creates new Hub import rows (Jasmin via Twilio). */
export function formatNewCalendarImportMarketsLine(marketIds: MarketId[]): string | undefined {
  if (marketIds.length === 0) return undefined;
  const counts = new Map<MarketId, number>();
  for (const id of marketIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const multiJob = marketIds.length > 1;
  const parts = MARKET_IDS.filter((id) => counts.has(id)).map((id) => {
    const n = counts.get(id) ?? 0;
    const label = ADMIN_MARKET_FILTER_LABELS[id];
    return multiJob ? `${n} ${label}` : label;
  });
  if (marketIds.length === 1) {
    return `Market: ${parts[0]}.`;
  }
  return `Markets: ${parts.join(", ")}.`;
}

export function adminNewCalendarImportSms(input: {
  count: number;
  marketIds?: MarketId[];
  dashboardUrl?: string;
}): string {
  const noun = input.count === 1 ? "job" : "jobs";
  const lines = [
    `Golden Hour: ${input.count} new Gmail ${noun} to review on the dashboard.`,
  ];
  const marketLine = formatNewCalendarImportMarketsLine(input.marketIds ?? []);
  if (marketLine) lines.push(marketLine);
  const url = input.dashboardUrl?.trim();
  if (url) lines.push("", url);
  return lines.join("\n");
}