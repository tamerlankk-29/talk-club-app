import type { Metadata } from 'next';
import { LogoMark } from '@/components/icons';
import { metaMessages, systemMessages } from '@/lib/i18n/messages/system';
import { serverMessages } from '@/lib/i18n/server';
import { RetryButton } from './retry-button';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await serverMessages(metaMessages)).offline };
}

/** Served by the service worker when there is no connection. */
export default async function OfflinePage() {
  const t = await serverMessages(systemMessages);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark className="h-16 w-16" />
      <div>
        <h1 className="font-display text-2xl font-semibold">{t.offlineTitle}</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">{t.offlineText}</p>
      </div>
      <RetryButton label={t.retry} />
    </main>
  );
}
