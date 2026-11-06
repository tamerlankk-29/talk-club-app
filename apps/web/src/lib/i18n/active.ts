import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from './config';
import type { MessageSet, Widen } from './define';

// Module-level copy of the current language for code outside React (date formatting,
// API requests). I18nProvider keeps it in sync and remounts the app when it changes.
let active: Locale = DEFAULT_LOCALE;

export function setActiveLocale(locale: Locale): void {
  active = locale;
}

export function activeLocale(): Locale {
  return active;
}

export function intlLocale(): string {
  return INTL_LOCALE[active];
}

/** Texts of a message group in the current language, for code outside components. */
export function messagesFor<T>(set: MessageSet<T>): Widen<T> {
  return set[active];
}
