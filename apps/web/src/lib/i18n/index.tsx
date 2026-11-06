'use client';

import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { setActiveLocale } from './active';
import { LOCALE_COOKIE, type Locale } from './config';
import type { MessageSet, Widen } from './define';

export * from './active';
export * from './config';
export { defineMessages } from './define';

interface I18nContextValue {
  locale: Locale;
  /** Switches the language; saves it on this device and, through `onChange`, on the account. */
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function writeCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  setActiveLocale(locale);

  const setLocale = useCallback((next: Locale) => {
    writeCookie(next);
    setActiveLocale(next);
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  // Remounting on a language change re-renders everything, including dates formatted outside hooks.
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Texts of a message group in the current language: `const t = useT(authMessages)`. */
export function useT<T>(set: MessageSet<T>): Widen<T> {
  return set[useI18n().locale];
}

type TagRenderer = (chunk: ReactNode) => ReactNode;

/**
 * Renders a translated text with simple tags, e.g. "Tap <b>Start</b>" with
 * `tags={{ b: (c) => <strong>{c}</strong> }}`. Everything else stays plain text.
 */
export function Rich({ text, tags }: { text: string; tags: Record<string, TagRenderer> }): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/gs;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const render = tags[match[1]];
    parts.push(<Fragment key={i++}>{render ? render(match[2]) : match[2]}</Fragment>);
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
