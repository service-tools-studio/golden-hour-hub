import type { Metadata } from "next";

function siteOrigin(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw.replace(/\/$/, ""));
    } catch {
      /* fall through */
    }
  }
  return new URL("http://localhost:3000");
}

const title = "Golden Hour Hub";
const description =
  "Scheduling for Golden Hour Cleaning Co. — view jobs, respond to invitations, and update availability.";

/** Shared site + Open Graph defaults for link previews (SMS, iMessage, etc.). */
export function hubSiteMetadata(overrides?: Partial<Metadata>): Metadata {
  const metadataBase = siteOrigin();
  return {
    metadataBase,
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Golden Hour Cleaning Co.",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    ...overrides,
  };
}

/** Public URL for automated SMS — crawlers can read `/open` without signing in. */
export function cleanerHubSmsLink(destination = "/cleaner"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const path = destination.startsWith("/") ? destination : `/${destination}`;
  const query = new URLSearchParams({ from: path }).toString();
  const openPath = `/open?${query}`;
  if (!base) return openPath;
  return `${base}${openPath}`;
}
