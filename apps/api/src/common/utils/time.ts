import { DateTime } from 'luxon';

/**
 * Club-local time helpers. The database stores UTC instants; every rule that
 * speaks in local terms ("20:00 on the previous day", "valid until 29 October",
 * "every Monday 18:30") is evaluated in the location's IANA timezone.
 */
export const DEFAULT_TIMEZONE = 'Asia/Almaty';

export function zoned(date: Date, tz: string = DEFAULT_TIMEZONE): DateTime {
  return DateTime.fromJSDate(date, { zone: tz });
}

/** Parses "HH:mm" → { hour, minute }. Throws on malformed input. */
export function parseClock(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid time "${value}", expected HH:mm`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isValidClock(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/** Builds a UTC instant from a local calendar date ("2026-10-07") and clock time ("18:30"). */
export function localToUtc(isoDate: string, clock: string, tz: string = DEFAULT_TIMEZONE): Date {
  const { hour, minute } = parseClock(clock);
  const dt = DateTime.fromISO(isoDate, { zone: tz }).set({ hour, minute, second: 0, millisecond: 0 });
  if (!dt.isValid) throw new Error(`Invalid local date "${isoDate}"`);
  return dt.toJSDate();
}

/** Local calendar date (yyyy-MM-dd) of an instant. */
export function localDate(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  return zoned(date, tz).toISODate() as string;
}

/** Local clock time (HH:mm) of an instant. */
export function localClock(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  return zoned(date, tz).toFormat('HH:mm');
}

/** ISO weekday (1 = Monday … 7 = Sunday) in club time. */
export function localWeekday(date: Date, tz: string = DEFAULT_TIMEZONE): number {
  return zoned(date, tz).weekday;
}

export function startOfLocalDay(date: Date, tz: string = DEFAULT_TIMEZONE): Date {
  return zoned(date, tz).startOf('day').toJSDate();
}

export function endOfLocalDay(date: Date, tz: string = DEFAULT_TIMEZONE): Date {
  return zoned(date, tz).endOf('day').toJSDate();
}

export function addDays(date: Date, days: number, tz: string = DEFAULT_TIMEZONE): Date {
  return zoned(date, tz).plus({ days }).toJSDate();
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function daysBetweenLocal(a: Date, b: Date, tz: string = DEFAULT_TIMEZONE): number {
  const start = zoned(a, tz).startOf('day');
  const end = zoned(b, tz).startOf('day');
  return Math.round(end.diff(start, 'days').days);
}

/** Human label for notifications, e.g. "Wed, 7 Oct, 18:30". */
export function formatSessionTime(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  return zoned(date, tz).setLocale('en-GB').toFormat('ccc, d LLL, HH:mm');
}

export function formatLocalDate(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  return zoned(date, tz).setLocale('en-GB').toFormat('d LLLL yyyy');
}

export function formatClock(date: Date, tz: string = DEFAULT_TIMEZONE): string {
  return zoned(date, tz).toFormat('HH:mm');
}
