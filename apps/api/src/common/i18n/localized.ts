import { LOCALES, type Locale } from '../utils/locale';

/** One text in every language of the app, e.g. a date or "tomorrow" inside a notification. */
export type LocalizedText = { readonly [L in Locale]: string };

/** Builds a text for every language from a function of the language. */
export function localized(fn: (locale: Locale) => string): LocalizedText {
  return Object.fromEntries(LOCALES.map((l) => [l, fn(l)])) as LocalizedText;
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  return typeof value === 'object' && value !== null && LOCALES.every((l) => typeof (value as Record<string, unknown>)[l] === 'string');
}

/** BCP 47 tags for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ru: 'ru-RU', kk: 'kk-KZ' };

/** Digit grouping: "26 000" in Russian and Kazakh, "26,000" in English. */
export function formatNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU');
}

/** Russian plural form (1 день, 2 дня, 5 дней). */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
