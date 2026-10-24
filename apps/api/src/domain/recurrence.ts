import { DateTime } from 'luxon';
import { parseClock } from '../common/utils/time';

export interface RecurrenceRule {
  /** ISO weekdays 1 (Mon) … 7 (Sun) */
  daysOfWeek: number[];
  /** Club-local "HH:mm" */
  startTime: string;
  durationMinutes: number;
  /** Local calendar dates (inclusive), yyyy-MM-dd */
  validFrom: string;
  validUntil: string | null;
}

export interface Occurrence {
  localDate: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Expands a weekly rule into concrete occurrences within [fromDate, toDate]
 * (local calendar dates, inclusive). Times are anchored in the club timezone.
 */
export function generateOccurrences(rule: RecurrenceRule, fromDate: string, toDate: string, tz: string): Occurrence[] {
  const { hour, minute } = parseClock(rule.startTime);
  const days = new Set(rule.daysOfWeek);
  let cursor = DateTime.fromISO(maxDate(fromDate, rule.validFrom), { zone: tz }).startOf('day');
  const end = DateTime.fromISO(rule.validUntil ? minDate(toDate, rule.validUntil) : toDate, { zone: tz }).startOf('day');
  const result: Occurrence[] = [];
  while (cursor <= end) {
    if (days.has(cursor.weekday)) {
      const start = cursor.set({ hour, minute, second: 0, millisecond: 0 });
      result.push({
        localDate: cursor.toISODate() as string,
        startsAt: start.toJSDate(),
        endsAt: start.plus({ minutes: rule.durationMinutes }).toJSDate(),
      });
    }
    cursor = cursor.plus({ days: 1 });
  }
  return result;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
