export type CleaningOrigin = "schedule" | "dashboard";

export function cleaningOrigin(value: unknown): CleaningOrigin | undefined {
  return value === "schedule" || value === "dashboard" ? value : undefined;
}

export function withOrigin(path: string, from: CleaningOrigin | undefined, params: Record<string, string> = {}): string {
  const search = new URLSearchParams(params);
  if (from) search.set("from", from);
  const query = search.toString();
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}
