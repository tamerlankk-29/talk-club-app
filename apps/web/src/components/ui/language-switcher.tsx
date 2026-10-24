'use client';

import { LOCALE_NAMES, LOCALES, useI18n, type Locale } from '@/lib/i18n';
import { useChangeLocale } from '@/lib/locale';
import { cn } from '@/lib/utils';

const SHORT: Record<Locale, string> = { en: 'EN', ru: 'RU', kk: 'KZ' };

/** EN · RU · KZ switch. `full` shows the language names (profile settings). */
export function LanguageSwitcher({ full = false, className }: { full?: boolean; className?: string }) {
  const { locale } = useI18n();
  const change = useChangeLocale();
  return (
    <div role="radiogroup" aria-label="Language / Язык / Тіл" className={cn('inline-flex rounded-xl bg-brand-50 p-1', full && 'flex w-full', className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === locale}
          lang={l}
          onClick={() => l !== locale && change(l)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            full && 'flex-1 py-2.5 text-sm',
            l === locale ? 'bg-white text-brand-800 shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {full ? LOCALE_NAMES[l] : SHORT[l]}
        </button>
      ))}
    </div>
  );
}
