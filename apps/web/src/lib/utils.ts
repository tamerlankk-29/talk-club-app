import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { messagesFor } from './i18n/active';
import { labelMessages } from './i18n/messages/labels';

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

/**
 * A constant whose contents follow the current language: reads go to the
 * current translation, so `WEEKDAYS[1]` or `FORMAT_LABELS.ONLINE` stay simple.
 */
function localized<T extends object>(read: () => T, empty: T): T {
  return new Proxy(empty, {
    get(_, prop) {
      const target = read();
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    has: (_, prop) => Reflect.has(read(), prop),
    ownKeys: () => Reflect.ownKeys(read()),
    getOwnPropertyDescriptor: (_, prop) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(read(), prop);
      // Keep the target's own non-configurable properties (an array's length) as they are.
      return descriptor ? { ...descriptor, configurable: Reflect.getOwnPropertyDescriptor(empty, prop)?.configurable ?? true } : undefined;
    },
  });
}

const labels = () => messagesFor(labelMessages);

export const WEEKDAYS: readonly string[] = localized(() => labels().weekdays, []);
export const WEEKDAYS_SHORT: readonly string[] = localized(() => labels().weekdaysShort, []);
export const TIME_OF_DAY_LABELS: Record<string, string> = localized(() => labels().timeOfDay, {});
export const CATEGORY_LABELS: Record<string, string> = localized(() => labels().category, {});
export const FORMAT_LABELS: Record<string, string> = localized(() => labels().format, {});
