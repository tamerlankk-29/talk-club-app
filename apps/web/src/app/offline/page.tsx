import type { Metadata } from 'next';
import { LogoMark } from '@/components/icons';
import { RetryButton } from './retry-button';

export const metadata: Metadata = { title: 'Offline' };

/** Served by the service worker when there is no connection. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark className="h-16 w-16" />
      <div>
        <h1 className="font-display text-2xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 max-w-xs text-sm text-muted">Check your internet connection. Your recent bookings and membership are still available once you reconnect.</p>
      </div>
      <RetryButton />
    </main>
  );
}
