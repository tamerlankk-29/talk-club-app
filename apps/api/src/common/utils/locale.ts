/** Languages of the app, its messages and the Telegram bot. English is the default. */
export const LOCALES = ['en', 'ru', 'kk'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Picks the first supported language from an Accept-Language header ("ru-RU,ru;q=0.9,en;q=0.8"). */
export function localeFromHeader(header: string | null | undefined): Locale {
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}
