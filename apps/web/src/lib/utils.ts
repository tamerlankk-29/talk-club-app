import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  // First letter of the first two words that start with a letter ("Aida (Owner)" → "A").
  const letters = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .map((w) => w[0]);
  return ((letters[0] ?? '') + (letters[1] ?? '')).toUpperCase() || '?';
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const TIME_OF_DAY_LABELS: Record<string, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
};

export const CATEGORY_LABELS: Record<string, string> = {
  ADULT: 'Adult',
  TEEN: 'Teen',
  CHILD: 'Child',
  BUSINESS: 'Business Club',
  INDIVIDUAL: 'Individual',
};

export const FORMAT_LABELS: Record<string, string> = {
  OFFLINE: 'At the club',
  ONLINE: 'Online',
  ANY: 'Both',
};
