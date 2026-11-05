import type { CleanerProfile } from "@/lib/domain/types";

export function searchCleaners(cleaners: CleanerProfile[], query: string): CleanerProfile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return cleaners;
  const digits = needle.replace(/\D/g, "");
  return cleaners.filter((cleaner) => {
    const name = `${cleaner.firstName} ${cleaner.lastName}`.toLowerCase();
    if (name.includes(needle) || cleaner.firstName.toLowerCase().includes(needle)) return true;
    if (cleaner.email.toLowerCase().includes(needle)) return true;
    if (digits.length > 0 && cleaner.mobilePhone.replace(/\D/g, "").includes(digits)) return true;
    return false;
  });
}

export function CleanerSearchField({ query, onQuery }: { query: string; onQuery: (value: string) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-full bg-white px-3 text-ink ring-1 ring-ink/10">
      <CleanerSearchIcon />
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search cleaners"
        aria-label="Search cleaners"
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-ink/40"
      />
      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onQuery("")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink/55 hover:bg-cream hover:text-ink"
        >
          <CleanerClearSearchIcon />
        </button>
      ) : null}
    </label>
  );
}

function CleanerSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-ink/45">
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16.5L20 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CleanerClearSearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
