'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { LogoMark } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export function SplashScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <LogoMark className="h-16 w-16 animate-pulse" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Shown when the session can't be restored because the API is unreachable. */
export function ConnectionProblem() {
  const { retry } = useAuth();
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
      <WifiOff className="h-10 w-10 text-brand-700" />
      <div>
        <p className="font-display text-lg font-semibold">Can&apos;t connect to Talk Club</p>
        <p className="mt-1 text-sm text-muted">Check your internet connection. We&apos;ll keep trying.</p>
      </div>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

/** Client pages that need a signed-in member (redirects to login and back). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user, actingClientId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === 'unavailable') return <ConnectionProblem />;
  if (status !== 'authenticated') return <SplashScreen />;
  if (!user?.client && !actingClientId && user?.managedClients.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-lg font-semibold">This area is for Talk Club members</p>
        <p className="mt-2 text-sm text-muted">Your account is a staff account. Open the admin or teacher panel instead.</p>
        <div className="mt-6 flex justify-center gap-3">
          {user?.areas.admin && (
            <a href="/admin" className="font-semibold text-brand-700">
              Admin panel →
            </a>
          )}
          {user?.areas.teacher && (
            <a href="/teacher" className="font-semibold text-brand-700">
              Teacher panel →
            </a>
          )}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
