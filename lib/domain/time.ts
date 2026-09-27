import { BUSINESS_TIME_ZONE, type DayOfWeek } from "./types.ts";

const DAY_NAMES: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseYmd(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { year, month, day } = parseYmd(date);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function isValidLocalTime(time: string): boolean {
  if (time === "24:00") return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function minutesFromTime(time: string): number {
  if (time === "24:00") return 24 * 60;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(minutes: number): string {
  if (minutes === 24 * 60) return "24:00";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return formatHm(hour, minute);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parseYmd(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function daysBetween(start: string, end: string): number {
  const a = parseYmd(start);
  const b = parseYmd(end);
  const startUtc = Date.UTC(a.year, a.month - 1, a.day);
  const endUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function compareDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function dayOfWeek(date: string): DayOfWeek {
  const { year, month, day } = parseYmd(date);
  return DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function mondayOf(date: string): string {
  const { year, month, day } = parseYmd(date);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const delta = utcDay === 0 ? -6 : 1 - utcDay;
  return addDays(date, delta);
}

/**
 * The Monday–Sunday week cleaners still need to submit.
 * Deadline is the Sunday before that Monday.
 * On Saturday Sep 26, 2026 this is Sep 28–Oct 4.
 */
export function nextAvailabilityWeek(today: string): { weekStart: string; weekEnd: string } {
  const weekStart = addDays(mondayOf(today), 7);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

export function todayInBusinessZone(now = new Date()): string {
  const parts = zonedParts(now);
  return formatYmd(parts.year, parts.month, parts.day);
}

export function zonedParts(instant: Date): ZonedParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: string) => formatted.find((part) => part.type === type)?.value ?? "0";
  let hour = Number(value("hour"));
  const minute = Number(value("minute"));
  let year = Number(value("year"));
  let month = Number(value("month"));
  let day = Number(value("day"));
  if (hour === 24) {
    hour = 0;
    const next = addDays(formatYmd(year, month, day), 1);
    const rolled = parseYmd(next);
    year = rolled.year;
    month = rolled.month;
    day = rolled.day;
  }
  return { year, month, day, hour, minute };
}

function civilStamp(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

/** Convert a Portland local date and time to a UTC instant. */
export function zonedToUtc(date: string, time: string): Date {
  const minuteOfDay = minutesFromTime(time);
  const normalizedDate = time === "24:00" ? addDays(date, 1) : date;
  const hour = time === "24:00" ? 0 : Math.floor(minuteOfDay / 60);
  const minute = time === "24:00" ? 0 : minuteOfDay % 60;
  const { year, month, day } = parseYmd(normalizedDate);
  let utc = civilStamp(year, month, day, hour, minute);
  const target = utc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc));
    const actual = civilStamp(parts.year, parts.month, parts.day, parts.hour, parts.minute);
    const delta = target - actual;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

export function addMinutesToZoned(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const next = new Date(zonedToUtc(date, time).getTime() + minutes * 60_000);
  const parts = zonedParts(next);
  return {
    date: formatYmd(parts.year, parts.month, parts.day),
    time: formatHm(parts.hour, parts.minute),
  };
}

export type MinuteSpan = {
  date: string;
  startMin: number;
  endMin: number;
};

/** Split a UTC range into Portland calendar-day minute spans. */
export function splitUtcRange(start: Date, end: Date): MinuteSpan[] {
  if (end.getTime() <= start.getTime()) return [];
  const spans: MinuteSpan[] = [];
  let cursor = start.getTime();
  const endMs = end.getTime();
  for (let guard = 0; guard < 8 && cursor < endMs; guard += 1) {
    const parts = zonedParts(new Date(cursor));
    const date = formatYmd(parts.year, parts.month, parts.day);
    const startMin = parts.hour * 60 + parts.minute;
    const midnight = zonedToUtc(addDays(date, 1), "00:00").getTime();
    const segmentEnd = Math.min(midnight, endMs);
    if (segmentEnd <= cursor) break;
    const endMin =
      segmentEnd === midnight
        ? 24 * 60
        : (() => {
            const endParts = zonedParts(new Date(segmentEnd));
            return endParts.hour * 60 + endParts.minute;
          })();
    if (endMin > startMin) spans.push({ date, startMin, endMin });
    cursor = segmentEnd;
  }
  return spans;
}

export function formatTimeLabel(time: string): string {
  if (time === "24:00") return "12:00 AM";
  const [hourValue, minuteValue] = time.split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 === 0 ? 12 : hourValue % 12;
  return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

export function formatWeekRange(start: string, end: string): string {
  const startDate = utcNoon(start);
  const endDate = utcNoon(end);
  const startText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(startDate);
  const endText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(endDate);
  return `${startText} – ${endText}`;
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(date));
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(date));
}

export function formatMonthDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcNoon(date));
}

function utcNoon(date: string): Date {
  const { year, month, day } = parseYmd(date);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}
