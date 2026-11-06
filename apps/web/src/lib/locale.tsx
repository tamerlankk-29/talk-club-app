'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { api, call } from './api/client';
import { useAuth } from './auth';
import { isLocale, LOCALE_COOKIE, useI18n, type Locale } from './i18n';

function cookieLocale(): Locale | null {
  const value = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=(\\w+)`).exec(document.cookie)?.[1];
  return isLocale(value) ? value : null;
}

/**
 * Changes the language everywhere: this device, the account (so messages and
 * the Telegram bot follow it) and data that the API returns already translated.
 */
export function useChangeLocale(): (locale: Locale) => void {
  const { setLocale } = useI18n();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    (locale: Locale) => {
      setLocale(locale);
      if (status === 'authenticated') void call(api.PATCH('/api/me/locale', { body: { locale } })).catch(() => undefined);
      void queryClient.invalidateQueries();
    },
    [setLocale, status, queryClient],
  );
}

/**
 * After sign-in: a language picked on this device wins and is saved to the
 * account; on a device where nobody picked one, the account's language is used.
 */
export function LocaleSync() {
  const { user } = useAuth();
  const { locale, setLocale } = useI18n();
  const accountLocale = user?.locale;
  useEffect(() => {
    if (!accountLocale || accountLocale === locale) return;
    const picked = cookieLocale();
    if (picked) void call(api.PATCH('/api/me/locale', { body: { locale: picked } })).catch(() => undefined);
    else setLocale(accountLocale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLocale]);
  return null;
}
