import { buildCustomerSearchKeys, findCustomerByCalendarEventName } from "./customers.ts";
import { DEFAULT_MARKET_ID, isMarketId, type MarketId } from "./markets.ts";
import type { CalendarImport, CalendarImportParsedHints, Customer, Job, ServiceType } from "./types.ts";
import type { HubData } from "../mock/seed.ts";
import { addDays, formatHm, formatYmd, isValidDate, minutesFromTime, todayInBusinessZone } from "./time.ts";
import { BUSINESS_TIME_ZONE } from "./types.ts";

export type GoogleCalendarAttendee = {
  email?: string;
  organizer?: boolean;
  self?: boolean;
  responseStatus?: string;
};

export type GoogleCalendarEventShape = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  iCalUID?: string;
  attendees?: GoogleCalendarAttendee[];
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

export const CALENDAR_IMPORT_HORIZON_DAYS = 60;
/** DynamoDB TTL: delete import rows ~1 year after last update (requires table TTL on attribute `ttl`). */
export const CALENDAR_IMPORT_TTL_SECONDS = 365 * 24 * 60 * 60;

export function calendarImportTtlEpoch(updatedAtIso: string, nowMs = Date.now()): number {
  const updatedMs = Date.parse(updatedAtIso);
  const baseMs = Number.isFinite(updatedMs) ? updatedMs : nowMs;
  return Math.floor((baseMs + CALENDAR_IMPORT_TTL_SECONDS * 1000) / 1000);
}

const US_PHONE = /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/;
const CALENDAR_IMPORT_EXCLUDED_TITLE = /kelsey\s+therapy/i;

/** Full event titles (after normalizeCalendarEventTitle) that must never become imports. */
const CALENDAR_IMPORT_EXCLUDED_EXACT_TITLES = new Set([
  "dentist",
  "narpm greater portland chapter meeting",
]);

function calendarEventSummaryIsExcluded(summary: string): boolean {
  const trimmed = summary.trim();
  if (!trimmed) return false;
  const title = normalizeCalendarEventTitle(trimmed) || trimmed;
  const lower = title.toLowerCase();
  if (CALENDAR_IMPORT_EXCLUDED_EXACT_TITLES.has(lower)) return true;
  if (/^water\s+plants$/.test(lower)) return true;
  if (/\bunavailable\b/i.test(title)) return true;
  if (/\bavailable\b/i.test(title)) return true;
  return false;
}

/** Personal blocks that should never become Gmail import rows. */
export function calendarEventIsExcludedFromImport(
  event: Pick<GoogleCalendarEventShape, "summary" | "description" | "location">,
): boolean {
  const summary = typeof event.summary === "string" ? event.summary.trim() : "";
  if (summary && calendarEventSummaryIsExcluded(summary)) return true;

  const haystack = [event.summary, event.description, event.location]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("\n");
  return CALENDAR_IMPORT_EXCLUDED_TITLE.test(haystack);
}

export function calendarImportStatusGsiKey(status: CalendarImport["status"]): string {
  return status === "PENDING_REVIEW" ? "CAL_IMPORT#PENDING" : `CAL_IMPORT#${status}`;
}

function zonedPartsFromInstant(iso: string, timeZone: string): { date: string; hour: number; minute: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = Number(pick("year"));
  const month = Number(pick("month"));
  const day = Number(pick("day"));
  let hour = Number(pick("hour"));
  const minute = Number(pick("minute"));
  if (hour === 24) hour = 0;
  return { date: formatYmd(year, month, day), hour, minute };
}

function marketFromCity(city: string): MarketId {
  const normalized = city.trim().toLowerCase();
  if (normalized.includes("phoenix") || normalized.includes("scottsdale") || normalized.includes("tempe")) {
    return "phoenix";
  }
  if (normalized.includes("portland") || normalized.includes("beaverton") || normalized.includes("hillsboro")) {
    return "portland";
  }
  return DEFAULT_MARKET_ID;
}

const KNOWN_CITY_SUFFIXES = [
  "portland",
  "beaverton",
  "hillsboro",
  "gresham",
  "lake oswego",
  "tigard",
  "phoenix",
  "scottsdale",
  "tempe",
  "mesa",
  "chandler",
  "glendale",
] as const;

function titleCaseCity(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(" ");
}

/** When Google omits a comma between street and city: "1948 SE 52nd Ave Portland". */
function peelCityFromStreetLine(line: string): { streetAddress: string; city: string } {
  const trimmed = line.trim();
  if (!trimmed) return { streetAddress: "", city: "" };
  const lower = trimmed.toLowerCase();
  for (const cityName of KNOWN_CITY_SUFFIXES) {
    const suffix = ` ${cityName}`;
    if (lower.endsWith(suffix)) {
      return {
        streetAddress: trimmed.slice(0, trimmed.length - suffix.length).trim(),
        city: titleCaseCity(cityName),
      };
    }
  }
  const words = trimmed.split(/\s+/);
  if (words.length >= 3) {
    const last = words[words.length - 1]!;
    if (!/\d/.test(last) && last.length >= 3 && /^[A-Za-z][A-Za-z'.-]*$/.test(last)) {
      return {
        streetAddress: words.slice(0, -1).join(" "),
        city: titleCaseCity(last),
      };
    }
  }
  return { streetAddress: trimmed, city: "" };
}

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function isCountrySegment(segment: string): boolean {
  const normalized = segment.trim().toLowerCase().replace(/\./g, "");
  return normalized === "united states" || normalized === "usa" || normalized === "us";
}

function isStateCode(segment: string): boolean {
  const code = segment.trim().toUpperCase();
  return code.length === 2 && US_STATE_CODES.has(code);
}

export function parseLocationHint(location: string): Pick<
  CalendarImportParsedHints,
  "streetAddress" | "city" | "state" | "zip" | "marketId"
> {
  const trimmed = location.trim();
  if (!trimmed) {
    return { marketId: DEFAULT_MARKET_ID };
  }
  const zipMatch = /\b(\d{5})(?:-\d{4})?\b/.exec(trimmed);
  const zip = zipMatch?.[1];

  let segments = trimmed
    .split(",")
    .map((part) => part.replace(/\b\d{5}(?:-\d{4})?\b/, "").trim())
    .filter(Boolean);

  while (segments.length > 0 && isCountrySegment(segments[segments.length - 1]!)) {
    segments.pop();
  }

  let state: string | undefined;
  if (segments.length > 0 && isStateCode(segments[segments.length - 1]!)) {
    state = segments.pop()!.trim().toUpperCase();
  }

  if (segments.length === 0) {
    return { streetAddress: trimmed, city: "", state, zip, marketId: DEFAULT_MARKET_ID };
  }

  let streetAddress: string;
  let city: string;
  if (segments.length === 1) {
    const peeled = peelCityFromStreetLine(segments[0]!);
    streetAddress = peeled.streetAddress;
    city = peeled.city;
  } else {
    city = segments[segments.length - 1]!;
    streetAddress = segments.slice(0, -1).join(", ");
  }

  return {
    streetAddress,
    city,
    state,
    zip,
    marketId: marketFromCity(city || trimmed),
  };
}

const CALENDLY_GOLDEN_HOUR_SUFFIX = /\s+and\s+golden\s+hour\s+cleaning\s+co\.?$/i;

/** Calendly titles are often "{customer} and Golden Hour Cleaning Co". */
export function normalizeCalendarEventTitle(title: string): string {
  return title.trim().replace(CALENDLY_GOLDEN_HOUR_SUFFIX, "").trim();
}

/** True for Calendly bookings mirrored onto the Hub Google Calendar — not manual Gmail events. */
export function calendarEventIsCalendlyBooking(
  event: Pick<GoogleCalendarEventShape, "summary" | "description" | "htmlLink">,
): boolean {
  const summary = event.summary?.trim() ?? "";
  if (CALENDLY_GOLDEN_HOUR_SUFFIX.test(summary)) return true;
  const rawDesc = event.description?.trim() ?? "";
  const htmlLink = event.htmlLink?.trim() ?? "";
  if (/calendly\.com/i.test(rawDesc) || /calendly\.com/i.test(htmlLink)) return true;
  const desc = stripEventDetailText(rawDesc);
  if (/address\s+of\s+service\s*:/i.test(desc)) return true;
  return false;
}

const CALENDLY_SPECIAL_REQUESTS_LABEL =
  /share\s+(?:any\s+)?(?:and\s+)?preferences,?\s*priorities,?\s*or\s+special\s+requests\s*:\s*/i;

const CALENDLY_SPECIAL_REQUESTS_STOP =
  /\n\s*(?:need\s+to\s+make\s+changes\b|cancellation\s+policy\b|powered\s+by\s+calendly\b|invite[e]?\s+e-?mail\s*:|phone\s*:|scheduled\s+by\b)/i;

function normalizeCalendlyEventText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\uFF1A/g, ":");
}

function calendlySpecialRequestsSource(row: Pick<CalendarImport, "raw">): string {
  return row.raw.descriptionHtml?.trim() || row.raw.description.trim();
}

function calendarImportRowLooksCalendly(row: Pick<CalendarImport, "raw">): boolean {
  if (row.raw.bookingSource === "calendly") return true;
  if (calendarEventIsCalendlyBooking({
    summary: row.raw.title,
    description: row.raw.description,
    htmlLink: row.raw.htmlLink,
  })) {
    return true;
  }
  return Boolean(parseAddressOfServiceFromEventText(row.raw.description));
}

/** Calendly Q&A — text after "Share and preferences, priorities, or special requests:". */
export function parseCalendlySpecialRequestsFromEventText(text: string): string | undefined {
  const normalized = stripEventDetailText(normalizeCalendlyEventText(text.replace(/\r\n/g, "\n")));
  if (!normalized) return undefined;
  const labelAt = CALENDLY_SPECIAL_REQUESTS_LABEL.exec(normalized);
  if (!labelAt) return undefined;
  let body = normalized.slice(labelAt.index + labelAt[0].length);
  const stop = CALENDLY_SPECIAL_REQUESTS_STOP.exec(body);
  if (stop) body = body.slice(0, stop.index);
  const trimmed = body
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return trimmed || undefined;
}

/** Special instructions for the import review form (saved value or Calendly parse fallback). */
export function resolvedCalendarImportSpecialInstructions(
  row: Pick<CalendarImport, "specialInstructions" | "raw">,
): string {
  const unitLabel = calendarImportApartmentOrUnitFromSources(
    parseAddressOfServiceFromEventText(row.raw.description),
    row.raw.description,
    row.raw.title,
    row.raw.location,
  );
  const saved = calendarImportAdminInstructions(row);
  if (saved) return appendApartmentOrUnitToSpecialInstructions(saved, unitLabel);
  if (!calendarImportRowLooksCalendly(row)) {
    return appendApartmentOrUnitToSpecialInstructions("", unitLabel);
  }
  const source = calendlySpecialRequestsSource(row);
  const calendly =
    (parseCalendlySpecialRequestsFromEventText(source) ??
      (row.specialInstructions.trim() || undefined)) ??
    "";
  return appendApartmentOrUnitToSpecialInstructions(calendly, unitLabel);
}

export function calendarEventTitleHasTbd(title: string): boolean {
  return /\bTBD\b/i.test(title.trim());
}

export function parseCustomerNameFromTitle(title: string): { firstName: string; lastName: string } | null {
  const trimmed = normalizeCalendarEventTitle(title);
  if (!trimmed) return null;
  const withoutNoise = trimmed.replace(/\s*[-–—|]\s*.*$/, "").trim();
  const parts = withoutNoise.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

export function extractPhoneFromText(text: string): string {
  const match = US_PHONE.exec(text);
  if (!match) return "";
  return `${match[1]}${match[2]}${match[3]}`;
}

const EVENT_EMAIL =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function isOrganizerCalendarEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return (
    lower.endsWith("@resource.calendar.google.com") ||
    lower.endsWith("@group.calendar.google.com") ||
    lower.includes("@calendly.com") ||
    lower.includes("goldenhour")
  );
}

/** First invitee email on a Google Calendar event (not the organizer). */
export function extractInviteeEmailFromGoogleAttendees(
  attendees: GoogleCalendarAttendee[] | undefined,
): string | undefined {
  if (!attendees?.length) return undefined;
  for (const attendee of attendees) {
    const email = attendee.email?.trim().toLowerCase();
    if (!email || attendee.organizer || attendee.self) continue;
    if (isOrganizerCalendarEmail(email)) continue;
    return email;
  }
  for (const attendee of attendees) {
    const email = attendee.email?.trim().toLowerCase();
    if (!email || isOrganizerCalendarEmail(email)) continue;
    return email;
  }
  return undefined;
}

/** First invitee email in event details; skips obvious organizer / calendar system addresses. */
export function extractFirstEmailFromEventText(text: string): string | undefined {
  const normalized = stripEventDetailText(text.replace(/\r\n/g, "\n"));
  if (!normalized) return undefined;

  const labeled =
    /invitee\s+e-?mail\s*:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(normalized) ??
    /guest\s+e-?mail\s*:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(normalized) ??
    /invitee\s+e-?mail\s*:[\s\S]*?\n\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.exec(normalized);
  if (labeled) return labeled[1]!.toLowerCase();

  const emails = [...normalized.matchAll(EVENT_EMAIL)].map((match) => match[0]!.toLowerCase());
  if (emails.length === 0) return undefined;
  const invitee = emails.find((email) => !isOrganizerCalendarEmail(email));
  return invitee ?? emails[0];
}

/** Google Calendar often returns HTML in the description field. */
export function stripEventDetailText(htmlOrText: string): string {
  return htmlOrText
    .replace(
      /<a\b[^>]*\bhref\s*=\s*["']mailto:([^"'?#]+)["'][^>]*>[\s\S]*?<\/a>/gi,
      " $1 ",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function boundedCount(value: number, min: number, max: number): number | undefined {
  if (!Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

/** Pull beds, baths, and sq ft from Gmail/Calendar event description or title. */
/** Calendly embeds "Address of Service:" in the event description (value may be an HTML link). */
export function parseAddressOfServiceFromEventText(text: string): string | undefined {
  const normalized = stripEventDetailText(text.replace(/\r\n/g, "\n"));
  if (!normalized) return undefined;
  const label = /address\s+of\s+service\s*:\s*(.+)/i.exec(normalized);
  if (!label) return undefined;
  const value = label[1]!
    .split(/\n/)[0]!
    .replace(/\s+/g, " ")
    .trim();
  return value || undefined;
}

/** Requires a space before the label so "United States" does not become Unit + ed. */
const APARTMENT_KEYWORD =
  /\b(unit|apt|apartment|ste|suite)\.?\s+(?:#\s*)?([A-Za-z0-9-]+)\b/i;
const APARTMENT_HASH = /(?:^|[\s,])(#\s*[A-Za-z0-9-]+)\b/;

function formatApartmentOrUnitLabel(keyword: string, value: string): string {
  const kind = keyword.toLowerCase().replace(/\./g, "");
  if (kind === "unit") return `Unit ${value}`;
  if (kind.startsWith("apt")) return `Apt ${value}`;
  if (kind === "apartment") return `Apt ${value}`;
  if (kind.startsWith("ste") || kind === "suite") return `Suite ${value}`;
  return `${keyword} ${value}`.trim();
}

/** Apt / unit / suite / # labels from calendar location or event text (e.g. "Unit 1", "Apt B", "#236"). */
export function parseApartmentOrUnitLabel(text: string): string | undefined {
  const normalized = stripEventDetailText(text.replace(/\r\n/g, "\n")).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;

  const keywordMatch = APARTMENT_KEYWORD.exec(normalized);
  if (keywordMatch) {
    return formatApartmentOrUnitLabel(keywordMatch[1]!, keywordMatch[2]!);
  }

  const hashMatch = APARTMENT_HASH.exec(normalized);
  if (hashMatch) return hashMatch[1]!.replace(/\s+/g, "");

  return undefined;
}

export function calendarImportApartmentOrUnitFromSources(...sources: Array<string | undefined>): string | undefined {
  for (const source of sources) {
    const trimmed = source?.trim();
    if (!trimmed) continue;
    const label = parseApartmentOrUnitLabel(trimmed);
    if (label) return label;
  }
  return undefined;
}

/** Legacy parser matched "United" + "ed" in addresses. */
function calendarImportSpecialInstructionsWithoutBogusUnit(base: string): string {
  const trimmed = base.trim();
  if (/^unit\s+ed$/i.test(trimmed)) return "";
  return trimmed;
}

function appendApartmentOrUnitToSpecialInstructions(base: string, unitLabel: string | undefined): string {
  const trimmed = calendarImportSpecialInstructionsWithoutBogusUnit(base);
  if (!unitLabel) return trimmed;
  if (trimmed.toLowerCase().includes(unitLabel.toLowerCase())) return trimmed;
  return trimmed ? `${trimmed}\n${unitLabel}` : unitLabel;
}

function mergeCalendarImportLocationHints(
  ...layers: Array<Pick<CalendarImportParsedHints, "streetAddress" | "city" | "state" | "zip" | "marketId">>
): Pick<CalendarImportParsedHints, "streetAddress" | "city" | "state" | "zip" | "marketId"> {
  const merged: Pick<CalendarImportParsedHints, "streetAddress" | "city" | "state" | "zip" | "marketId"> = {
    marketId: DEFAULT_MARKET_ID,
  };
  for (const layer of layers) {
    if (!merged.streetAddress && layer.streetAddress?.trim()) merged.streetAddress = layer.streetAddress.trim();
    if (!merged.city && layer.city?.trim()) merged.city = layer.city.trim();
    if (!merged.state && layer.state?.trim()) merged.state = layer.state.trim();
    if (!merged.zip && layer.zip?.trim()) merged.zip = layer.zip.trim();
    if (layer.marketId && merged.marketId === DEFAULT_MARKET_ID) merged.marketId = layer.marketId;
  }
  return merged;
}

export function formatCalendarImportAddress(hints: CalendarImportParsedHints): string | undefined {
  const street = hints.streetAddress?.trim();
  const city = hints.city?.trim();
  const state = hints.state?.trim();
  const zip = hints.zip?.trim();
  if (!street && !city && !zip) return undefined;
  const cityLine = [city, state].filter(Boolean).join(", ");
  const tail = [cityLine, zip].filter(Boolean).join(cityLine && state ? " " : cityLine ? " " : "");
  if (street && tail) return `${street}, ${tail}`;
  if (street) return street;
  return tail || undefined;
}

const MOVE_OUT_FROM_EVENT_TEXT = /\bmove[\s-]*out\b/i;

export function parseServiceTypeFromEventText(text: string): ServiceType {
  const normalized = stripEventDetailText(text.replace(/\r\n/g, "\n"));
  if (MOVE_OUT_FROM_EVENT_TEXT.test(normalized)) return "MOVE_OUT";
  return "DEEP_CLEAN";
}

export function customerHasPriorCleanings(
  customerId: string,
  jobs: Array<Pick<Job, "customerId" | "status">>,
): boolean {
  return jobs.some((job) => job.customerId === customerId && job.status !== "CANCELED");
}

/** Existing customer with prior visits → recurring; first visit on hub → deep clean (unless the event says move-out, etc.). */
export function calendarImportDefaultServiceType(
  serviceType: ServiceType,
  suggestedCustomerId: string | undefined,
  customers: Array<Pick<Customer, "customerId" | "status">>,
  jobs: Array<Pick<Job, "customerId" | "status">> = [],
): ServiceType {
  if (!suggestedCustomerId) return serviceType;
  const known = customers.some(
    (customer) => customer.customerId === suggestedCustomerId && customer.status === "ACTIVE",
  );
  if (!known) return serviceType;
  if (serviceType !== "DEEP_CLEAN") return serviceType;
  if (!customerHasPriorCleanings(suggestedCustomerId, jobs)) return "DEEP_CLEAN";
  return "RECURRING";
}

export function parsePropertySizeFromEventText(text: string): Pick<
  CalendarImportParsedHints,
  "bedrooms" | "bathrooms" | "squareFeet"
> {
  const normalized = stripEventDetailText(text.replace(/\r\n/g, "\n"));
  const hints: Pick<CalendarImportParsedHints, "bedrooms" | "bathrooms" | "squareFeet"> = {};

  /** "4 bed 2 bath 1500 sq ft" on one line or with line breaks (or blank lines) between parts. */
  const kelseyLine = /\b(\d+)\s*beds?\s+(\d+(?:\.\d+)?)\s*baths?\s+(\d[\d,]*)\s*sq\s*ft\b/i.exec(normalized);
  if (kelseyLine) {
    const beds = boundedCount(Number(kelseyLine[1]), 0, 20);
    const baths = boundedCount(Number(kelseyLine[2]), 0, 20);
    const sq = boundedCount(Number(kelseyLine[3]!.replace(/,/g, "")), 100, 50_000);
    if (beds !== undefined) hints.bedrooms = beds;
    if (baths !== undefined) hints.bathrooms = baths;
    if (sq !== undefined) hints.squareFeet = sq;
    return hints;
  }

  const sqftMatch =
    /(?:square\s*(?:feet|footage|foot)|sq\.?\s*ft\.?|sqft|\bsf\b)\s*[:=\-]\s*(\d[\d,]*)/i.exec(normalized) ??
    /square\s*footage\s*:[^\d]*(\d[\d,]*)/i.exec(normalized) ??
    /(\d[\d,]*)\s*(?:sq\.?\s*ft\.?|sqft|square\s*(?:feet|footage|foot))\b/i.exec(normalized) ??
    /\b(\d{3,5})\s*sf\b/i.exec(normalized);
  if (sqftMatch) {
    const sq = boundedCount(Number(sqftMatch[1]!.replace(/,/g, "")), 100, 50_000);
    if (sq !== undefined) hints.squareFeet = sq;
  }

  const comboMatch =
    /(\d+)\s*(?:bed(?:room)?s?|br|bd|beds)\b\s*[·•\/,&\s]+\s*(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba|baths)\b/i.exec(
      normalized,
    ) ??
    /(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:br|ba|bed|bath)?/i.exec(normalized);
  if (comboMatch) {
    const beds = boundedCount(Number(comboMatch[1]), 0, 20);
    const baths = boundedCount(Number(comboMatch[2]), 0, 20);
    if (beds !== undefined) hints.bedrooms = beds;
    if (baths !== undefined) hints.bathrooms = baths;
  } else {
    const bedMatch =
      /(?:bed(?:room)?s?|br|bd|beds)\s*[:=\-]\s*(\d+)/i.exec(normalized) ??
      /\b(\d+)\s*(?:bed(?:room)?s?|br|bd|beds)\b/i.exec(normalized);
    if (bedMatch) {
      const beds = boundedCount(Number(bedMatch[1]), 0, 20);
      if (beds !== undefined) hints.bedrooms = beds;
    }
    const bathMatch =
      /(?:bath(?:room)?s?|ba|baths)\s*[:=\-]\s*(\d+(?:\.\d+)?)/i.exec(normalized) ??
      /\b(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba|baths)\b/i.exec(normalized);
    if (bathMatch) {
      const baths = boundedCount(Number(bathMatch[1]), 0, 20);
      if (baths !== undefined) hints.bathrooms = baths;
    }
  }

  return hints;
}

export function calendarImportDetailText(
  raw: CalendarImport["raw"],
  specialInstructions: string,
): string {
  return [raw.description, raw.title, raw.location, raw.inviteeEmail, specialInstructions].filter(Boolean).join("\n");
}

/** Read-only Google event description for the import review screen. */
export function calendarImportRawEventDetailsText(raw: CalendarImport["raw"]): string {
  const descriptionSource = raw.descriptionHtml?.trim() || raw.description.trim();
  if (!descriptionSource) return "";
  return stripEventDetailText(descriptionSource);
}

/** Cleaner-facing instructions on the review form — never auto-filled from Google event text. */
export function calendarImportAdminInstructions(
  row: Pick<CalendarImport, "specialInstructions" | "raw">,
): string {
  const text = row.specialInstructions.trim();
  if (!text) return "";
  const fromEvent = row.raw.description.trim();
  if (fromEvent && text === fromEvent) return "";
  return text;
}

export function syncedCalendarImportSpecialInstructions(
  existing: CalendarImport,
  parsedSpecialInstructions: string,
  event: Pick<GoogleCalendarEventShape, "summary" | "description" | "htmlLink">,
): string {
  if (!calendarEventIsCalendlyBooking(event)) {
    return calendarImportAdminInstructions(existing);
  }
  const admin = calendarImportAdminInstructions(existing);
  let fresh = parsedSpecialInstructions.trim();
  if (!fresh) {
    fresh = parseCalendlySpecialRequestsFromEventText(event.description?.trim() ?? "") ?? "";
  }
  if (!admin) return fresh;
  const priorSource = calendlySpecialRequestsSource(existing);
  const priorAuto = parseCalendlySpecialRequestsFromEventText(priorSource)?.trim() ?? "";
  if (priorAuto && admin === priorAuto) return fresh;
  return admin;
}

export function mergeCalendarImportCustomerHints(
  parsed: CalendarImportParsedHints,
  detailText: string,
  extraUnitSources: Array<string | undefined> = [],
): CalendarImportParsedHints {
  const addressLine = parseAddressOfServiceFromEventText(detailText);
  const fromDetails = addressLine ? parseLocationHint(addressLine) : {};
  const location = mergeCalendarImportLocationHints(parsed, fromDetails);
  const email = extractFirstEmailFromEventText(detailText);
  const unit =
    parsed.unit?.trim() ||
    calendarImportApartmentOrUnitFromSources(
      addressLine,
      parsed.streetAddress,
      detailText,
      ...extraUnitSources,
    );
  const merged: CalendarImportParsedHints = {
    ...parsed,
    ...location,
    ...parsePropertySizeFromEventText(detailText),
    suggestedEmail: email || parsed.suggestedEmail,
    unit: unit || undefined,
  };
  return merged;
}

/** Minutes between event start/end (Calendly hold length). Not used as on-site cleaning estimate. */
export function googleCalendarEventBlockMinutes(event: GoogleCalendarEventShape): number | undefined {
  if (!event.start?.dateTime || !event.end?.dateTime) return undefined;
  const timeZone = event.start.timeZone ?? BUSINESS_TIME_ZONE;
  const startParts = zonedPartsFromInstant(event.start.dateTime, timeZone);
  const endParts = zonedPartsFromInstant(event.end.dateTime, timeZone);
  const startMin = minutesFromTime(formatHm(startParts.hour, startParts.minute));
  const endMin = minutesFromTime(formatHm(endParts.hour, endParts.minute));
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return undefined;
  return endMin - startMin;
}

export function calendarImportPreservedDurationMinutes(
  existing: Pick<CalendarImport, "expectedDurationMinutes">,
  event: GoogleCalendarEventShape,
): number | undefined {
  const saved = existing.expectedDurationMinutes;
  if (saved === undefined) return undefined;
  const block = googleCalendarEventBlockMinutes(event);
  if (block !== undefined && saved === block) return undefined;
  return saved;
}

const CALENDAR_EVENT_CANCELLED_TITLE = /^\s*(?:canceled|cancelled)\s*:/i;

/** Customer canceled on Calendly/Gmail but Google may still return status `confirmed`. */
export function calendarEventIndicatesHubCancel(
  event: Pick<GoogleCalendarEventShape, "status" | "summary">,
): boolean {
  if (event.status === "cancelled") return true;
  const summary = typeof event.summary === "string" ? event.summary.trim() : "";
  if (!summary) return false;
  const title = normalizeCalendarEventTitle(summary) || summary;
  return CALENDAR_EVENT_CANCELLED_TITLE.test(title) || CALENDAR_EVENT_CANCELLED_TITLE.test(summary);
}

export function parseGoogleCalendarEvent(event: GoogleCalendarEventShape): {
  ok: true;
  fields: Omit<CalendarImport, "importId" | "status" | "createdAt" | "updatedAt" | "lastSyncedAt">;
} | { ok: false; reason: string } {
  if (!event.id) return { ok: false, reason: "missing id" };
  if (calendarEventIndicatesHubCancel(event)) return { ok: false, reason: "cancelled" };
  if (calendarEventIsExcludedFromImport(event)) return { ok: false, reason: "excluded" };
  const timeZone = event.start?.timeZone ?? BUSINESS_TIME_ZONE;
  let serviceDate: string;
  let arrivalWindowStart: string | undefined;
  let arrivalWindowEnd: string | undefined;
  if (event.start?.date && !event.start.dateTime) {
    return { ok: false, reason: "all-day" };
  }
  if (!event.start?.dateTime || !event.end?.dateTime) {
    return { ok: false, reason: "missing start/end" };
  }

  const startParts = zonedPartsFromInstant(event.start.dateTime, timeZone);
  const endParts = zonedPartsFromInstant(event.end.dateTime, timeZone);
  serviceDate = startParts.date;
  if (!isValidDate(serviceDate)) return { ok: false, reason: "invalid date" };

  const summary = event.summary?.trim() ?? "";
  const title = normalizeCalendarEventTitle(summary) || "Calendar event";
  const startTimeTbd = calendarEventTitleHasTbd(summary) || calendarEventTitleHasTbd(title);
  if (startTimeTbd) {
    arrivalWindowStart = undefined;
    arrivalWindowEnd = undefined;
  } else {
    arrivalWindowStart = formatHm(startParts.hour, startParts.minute);
    arrivalWindowEnd = arrivalWindowStart;
  }
  const description = stripEventDetailText(event.description?.trim() ?? "");
  const location = event.location?.trim() ?? "";
  const name = parseCustomerNameFromTitle(title);
  const addressOfService = parseAddressOfServiceFromEventText(description);
  const locationHints = mergeCalendarImportLocationHints(
    parseLocationHint(location),
    addressOfService ? parseLocationHint(addressOfService) : {},
  );
  const attendeeEmail = extractInviteeEmailFromGoogleAttendees(event.attendees);
  const detailText = [description, title, location, attendeeEmail].filter(Boolean).join("\n");
  const phone = extractPhoneFromText([detailText, location].filter(Boolean).join("\n"));
  const email = extractFirstEmailFromEventText(detailText) || attendeeEmail;
  const sizeHints = parsePropertySizeFromEventText(detailText);
  const isCalendly = calendarEventIsCalendlyBooking({
    summary: event.summary,
    description: event.description,
    htmlLink: event.htmlLink,
  });
  const unitLabel = calendarImportApartmentOrUnitFromSources(addressOfService, description, title, location);
  let specialInstructions = isCalendly
    ? parseCalendlySpecialRequestsFromEventText(event.description?.trim() ?? description) ?? ""
    : "";
  specialInstructions = appendApartmentOrUnitToSpecialInstructions(specialInstructions, unitLabel);

  const parsed: CalendarImportParsedHints = {
    suggestedFirstName: name?.firstName,
    suggestedLastName: name?.lastName,
    suggestedPhone: phone || undefined,
    suggestedEmail: email,
    ...locationHints,
    ...sizeHints,
    unit: unitLabel,
  };

  return {
    ok: true,
    fields: {
      googleCalendarEventId: event.id,
      googleCalendarIcalUid: event.iCalUID,
      serviceDate,
      arrivalWindowStart,
      arrivalWindowEnd,
      expectedDurationMinutes: undefined,
      serviceType: parseServiceTypeFromEventText(detailText),
      headcountNeeded: 1,
      specialInstructions,
      marketId: locationHints.marketId ?? DEFAULT_MARKET_ID,
      raw: {
        title,
        description,
        location,
        htmlLink: event.htmlLink,
        inviteeEmail: attendeeEmail,
        bookingSource: isCalendly ? "calendly" : undefined,
        descriptionHtml:
          isCalendly && event.description?.trim() ? event.description.trim() : undefined,
      },
      parsed,
      suggestedCustomerId: undefined,
      suggestedPropertyId: undefined,
      matchedJobId: undefined,
      approvedJobId: undefined,
      rejectedReason: undefined,
    },
  };
}

type CalendarImportJobMatchInput = {
  googleCalendarEventId: string;
  serviceDate: string;
  suggestedCustomerId?: string;
  suggestedPropertyId?: string;
  parsed: CalendarImportParsedHints;
};

/** A cleaning already on the schedule for this calendar event or customer/date. */
export function findExistingJobForCalendarImport(
  jobs: Job[],
  customers: Customer[],
  properties: Array<{ propertyId: string; customerId: string; streetAddress: string; marketId?: unknown }>,
  input: CalendarImportJobMatchInput,
): Job | undefined {
  const active = jobs.filter((job) => job.status !== "CANCELED");

  const byEvent = active.find((job) => job.googleCalendarEventId === input.googleCalendarEventId);
  if (byEvent) return byEvent;

  let customerId = input.suggestedCustomerId;
  let propertyId = input.suggestedPropertyId;
  if (!customerId) {
    const suggestions = suggestCustomerForCalendarImport(customers, input.parsed, properties);
    customerId = suggestions.customerId;
    propertyId = propertyId ?? suggestions.propertyId;
  }
  if (!customerId) return undefined;

  const onDate = active.filter((job) => job.customerId === customerId && job.date === input.serviceDate);
  if (onDate.length === 0) return undefined;

  if (propertyId) {
    const byProperty = onDate.find((job) => job.propertyId === propertyId);
    if (byProperty) return byProperty;
  }
  return onDate[0];
}

function normalizeCalendarImportArrival(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/** True when Google event date/arrival differs from the import row and/or the linked hub job. */
export function calendarImportScheduleMovedFromGoogle(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
  serviceDate: string,
  arrivalWindowStart: string | undefined,
  arrivalWindowEnd: string | undefined,
): boolean {
  const importMoved =
    row.serviceDate !== serviceDate ||
    normalizeCalendarImportArrival(row.arrivalWindowStart) !== normalizeCalendarImportArrival(arrivalWindowStart) ||
    normalizeCalendarImportArrival(row.arrivalWindowEnd) !== normalizeCalendarImportArrival(arrivalWindowEnd);
  const jobId = calendarImportLinkedJobId(hub, row);
  if (!jobId) return importMoved;
  const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
  if (!job) return importMoved;
  return (
    importMoved ||
    job.date !== serviceDate ||
    normalizeCalendarImportArrival(job.arrivalWindowStart) !== normalizeCalendarImportArrival(arrivalWindowStart) ||
    normalizeCalendarImportArrival(job.arrivalWindowEnd) !== normalizeCalendarImportArrival(arrivalWindowEnd)
  );
}

/** Active hub job tied to this import (approved, matched, or same Google event id). */
export function calendarImportLinkedJobId(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
): string | undefined {
  const approvedId = row.approvedJobId?.trim();
  if (approvedId) {
    const approved = hub.jobs.find((job) => job.jobId === approvedId && job.status !== "CANCELED");
    if (approved) return approved.jobId;
  }
  const matchedId = row.matchedJobId?.trim();
  if (matchedId) {
    const linked = hub.jobs.find((job) => job.jobId === matchedId && job.status !== "CANCELED");
    if (linked) return linked.jobId;
  }
  const resolved = resolveCalendarImportMatchedJobId(hub.jobs, hub.customers, hub.properties, row);
  if (resolved) return resolved;
  const byEvent = hub.jobs.find(
    (job) => job.googleCalendarEventId === row.googleCalendarEventId && job.status !== "CANCELED",
  );
  return byEvent?.jobId;
}

export function calendarImportCanceledJobId(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
): string | undefined {
  const active = calendarImportActiveJobForCancelRow(hub, row);
  if (active) return active.jobId;
  if (row.approvedJobId && hub.jobs.some((job) => job.jobId === row.approvedJobId)) {
    return row.approvedJobId;
  }
  if (row.matchedJobId && hub.jobs.some((job) => job.jobId === row.matchedJobId)) {
    return row.matchedJobId;
  }
  return hub.jobs.find((job) => job.googleCalendarEventId === row.googleCalendarEventId)?.jobId;
}

/** Active hub job this cancel import row is about (reschedule may split event ids / dates). */
export function calendarImportActiveJobForCancelRow(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
): Job | undefined {
  for (const jobId of [row.approvedJobId?.trim(), row.matchedJobId?.trim()].filter(Boolean)) {
    const job = hub.jobs.find((item) => item.jobId === jobId && item.status !== "CANCELED");
    if (job) return job;
  }
  const eventId = row.googleCalendarEventId?.trim();
  if (eventId) {
    const byEvent = hub.jobs.find((item) => item.googleCalendarEventId === eventId && item.status !== "CANCELED");
    if (byEvent) return byEvent;
  }
  const matched = findExistingJobForCalendarImport(hub.jobs, hub.customers, hub.properties, {
    googleCalendarEventId: row.googleCalendarEventId,
    serviceDate: row.serviceDate,
    suggestedCustomerId: row.suggestedCustomerId,
    suggestedPropertyId: row.suggestedPropertyId,
    parsed: row.parsed,
  });
  if (matched && matched.status !== "CANCELED") return matched;
  const first = row.parsed.suggestedFirstName?.trim() ?? "";
  const last = row.parsed.suggestedLastName?.trim() ?? "";
  if (!first && !last) return undefined;
  const customer = findCustomerByCalendarEventName(hub.customers, first, last);
  if (!customer) return undefined;
  const activeForCustomer = hub.jobs.filter(
    (item) => item.customerId === customer.customerId && item.status !== "CANCELED",
  );
  if (activeForCustomer.length === 0) return undefined;
  if (eventId) {
    const withEvent = activeForCustomer.find((item) => item.googleCalendarEventId === eventId);
    if (withEvent) return withEvent;
  }
  const moved = activeForCustomer.find((item) => item.date !== row.serviceDate);
  return moved ?? activeForCustomer[0];
}

/**
 * Gmail reschedule sometimes leaves a staging row on the old service date (or CALENDAR_CANCELED)
 * while the linked hub job already moved — not a real cancel for admins.
 */
export function calendarImportRescheduleStaleImportRow(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
): boolean {
  const job = calendarImportActiveJobForCancelRow(hub, row);
  if (!job) return false;
  return job.date !== row.serviceDate;
}

/** Whether a CALENDAR_CANCELED card belongs on the dashboard (job truly canceled on hub). */
export function calendarImportCanceledCardRelevant(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
): boolean {
  if (row.status !== "CALENDAR_CANCELED") return true;
  return !calendarImportRescheduleStaleImportRow(hub, row);
}

export function resolveCalendarImportMatchedJobId(
  jobs: Job[],
  customers: Customer[],
  properties: Array<{ propertyId: string; customerId: string; streetAddress: string; marketId?: unknown }>,
  row: CalendarImport,
): string | undefined {
  if (row.matchedJobId) {
    const linked = jobs.find((job) => job.jobId === row.matchedJobId && job.status !== "CANCELED");
    if (linked) return linked.jobId;
  }
  return findExistingJobForCalendarImport(jobs, customers, properties, {
    googleCalendarEventId: row.googleCalendarEventId,
    serviceDate: row.serviceDate,
    suggestedCustomerId: row.suggestedCustomerId,
    suggestedPropertyId: row.suggestedPropertyId,
    parsed: row.parsed,
  })?.jobId;
}

export function suggestCustomerForCalendarImport(
  customers: Customer[],
  parsed: CalendarImportParsedHints,
  properties: Array<{ propertyId: string; customerId: string; streetAddress: string; marketId?: unknown }>,
): { customerId?: string; propertyId?: string } {
  const first = parsed.suggestedFirstName?.trim() ?? "";
  const last = parsed.suggestedLastName?.trim() ?? "";
  if (first && last) {
    const byName = findCustomerByCalendarEventName(customers, first, last);
    if (byName) {
      const property = matchPropertyForHints(byName.customerId, properties, parsed);
      return { customerId: byName.customerId, propertyId: property?.propertyId };
    }
  }
  const phone = parsed.suggestedPhone?.replace(/\D/g, "") ?? "";
  if (phone.length >= 10) {
    const last7 = phone.slice(-7);
    for (const customer of customers) {
      if (customer.status !== "ACTIVE") continue;
      const keys = buildCustomerSearchKeys(customer);
      if (keys.phoneKey.endsWith(last7) || keys.phoneLast7 === last7) {
        const property = matchPropertyForHints(customer.customerId, properties, parsed);
        return { customerId: customer.customerId, propertyId: property?.propertyId };
      }
    }
  }
  return {};
}

function matchPropertyForHints(
  customerId: string,
  properties: Array<{ propertyId: string; customerId: string; streetAddress: string; marketId?: unknown }>,
  parsed: CalendarImportParsedHints,
) {
  const mine = properties.filter((property) => property.customerId === customerId);
  if (mine.length === 0) return undefined;
  const street = parsed.streetAddress?.trim().toLowerCase();
  if (street) {
    const match = mine.find((property) => property.streetAddress.trim().toLowerCase() === street);
    if (match) return match;
  }
  const market = parsed.marketId && isMarketId(parsed.marketId) ? parsed.marketId : undefined;
  if (market) {
    const match = mine.find((property) => String(property.marketId) === market);
    if (match) return match;
  }
  return mine[0];
}

export function calendarImportMatchesAdminMarket(
  item: Pick<CalendarImport, "marketId">,
  filter: import("./markets.ts").AdminMarketFilter,
): boolean {
  if (filter === "all") return true;
  return item.marketId === filter;
}

export function calendarImportReviewHorizonEnd(today: string): string {
  return addDays(today, CALENDAR_IMPORT_HORIZON_DAYS);
}

export function isCalendarImportInReviewWindow(item: CalendarImport, today: string): boolean {
  const end = calendarImportReviewHorizonEnd(today);
  return item.serviceDate >= today && item.serviceDate <= end;
}

export function calendarImportShowsOnAdminDashboard(item: Pick<CalendarImport, "status">): boolean {
  return item.status === "PENDING_REVIEW" || item.status === "CALENDAR_CANCELED";
}

/** Pending Gmail imports shown on the admin dashboard (by market tab). */
export function visibleDashboardCalendarImports(
  imports: CalendarImport[],
  today: string,
  filter: import("./markets.ts").AdminMarketFilter,
  hub?: Pick<HubData, "jobs" | "customers" | "properties">,
): CalendarImport[] {
  return imports
    .filter((item) => calendarImportShowsOnAdminDashboard(item))
    .filter((item) => (hub ? calendarImportCanceledCardRelevant(hub, item) : true))
    .filter((item) => isCalendarImportInReviewWindow(item, today))
    .filter((item) => calendarImportMatchesAdminMarket(item, filter))
    .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
}

function withdrawRescheduleGhostImportRow(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  row: CalendarImport,
  now: string,
): CalendarImport {
  if (row.status !== "CALENDAR_CANCELED" && row.status !== "PENDING_REVIEW") return row;
  if (!calendarImportRescheduleStaleImportRow(hub, row)) return row;
  return {
    ...row,
    status: "WITHDRAWN",
    updatedAt: now,
    lastSyncedAt: now,
  };
}

/** Withdraw ghost rows in an import list (e.g. after loading the full sync range from Dynamo). */
export function withdrawRescheduleGhostCalendarImportList(
  hub: Pick<HubData, "jobs" | "customers" | "properties">,
  imports: CalendarImport[],
  now: string,
): { imports: CalendarImport[]; withdrawn: number } {
  let withdrawn = 0;
  const next = imports.map((row) => {
    const swept = withdrawRescheduleGhostImportRow(hub, row, now);
    if (swept.status !== row.status) withdrawn += 1;
    return swept;
  });
  return { imports: next, withdrawn };
}

/** Withdraw CALENDAR_CANCELED / pending rows that only reflect an old date after a Gmail reschedule. */
export function withdrawRescheduleGhostCalendarImports(
  hub: HubData,
  now: string,
): { hub: HubData; withdrawn: number } {
  const { imports, withdrawn } = withdrawRescheduleGhostCalendarImportList(hub, hub.calendarImports, now);
  if (withdrawn === 0) return { hub, withdrawn: 0 };
  return { hub: { ...hub, calendarImports: imports }, withdrawn };
}

export function calendarImportIdFromReturnTo(returnTo: string | undefined): string | undefined {
  if (!returnTo) return undefined;
  const match = returnTo.match(/\/admin\/calendar-imports\/([^/?#]+)/);
  return match?.[1];
}

/** Link to new customer; import rows are loaded server-side via `calendarImportId`. */
export function buildCalendarImportNewCustomerHref(importId: string, parsed: CalendarImportParsedHints): string {
  const params = new URLSearchParams();
  params.set("returnTo", `/admin/calendar-imports/${importId}`);
  params.set("calendarImportId", importId);
  if (parsed.suggestedFirstName?.trim()) params.set("firstName", parsed.suggestedFirstName.trim());
  if (parsed.suggestedLastName?.trim()) params.set("lastName", parsed.suggestedLastName.trim());
  return `/admin/customers/new?${params.toString()}`;
}

export function calendarImportCustomerPrefillFromRow(
  row: Pick<CalendarImport, "parsed" | "raw" | "specialInstructions">,
): CalendarImportParsedHints {
  const detailText = calendarImportDetailText(row.raw, "");
  const merged = mergeCalendarImportCustomerHints(row.parsed, detailText, [
    row.raw.description,
    row.raw.title,
    row.raw.location,
    row.specialInstructions,
  ]);
  const suggestedNotes = calendarImportRawEventDetailsText(row.raw);
  return suggestedNotes ? { ...merged, suggestedNotes } : merged;
}

export function calendarImportNewCustomerHref(
  row: Pick<CalendarImport, "importId" | "parsed" | "raw" | "specialInstructions">,
): string {
  const merged = calendarImportCustomerPrefillFromRow(row);
  return buildCalendarImportNewCustomerHref(row.importId, merged);
}