import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import type { MessageSet, Widen } from './define';

/** The language picked in this browser, for server components and metadata. */
export async function serverLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Texts of a message group in the request's language. */
export async function serverMessages<T>(set: MessageSet<T>): Promise<Widen<T>> {
  return set[await serverLocale()];
}
