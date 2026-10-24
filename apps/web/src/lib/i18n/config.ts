/** Languages of the app. English is the default until a person picks another one. */
export const LOCALES = ['en', 'ru', 'kk'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Set only when the person picks a language, so a new device can adopt the account's choice. */
export const LOCALE_COOKIE = 'tc_locale';

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ru: 'Русский', kk: 'Қазақша' };

/** BCP 47 tags for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ru: 'ru-RU', kk: 'kk-KZ' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the plural form. Russian has three (1 сессия, 2 сессии, 5 сессий);
 * Kazakh nouns don't change after numbers; English has two.
 */
export function plural(locale: Locale, n: number, forms: { one: string; few?: string; many?: string; other: string }): string {
  if (locale === 'ru') {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms.one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few ?? forms.other;
    return forms.many ?? forms.other;
  }
  if (locale === 'kk') return forms.other;
  return n === 1 ? forms.one : forms.other;
}
