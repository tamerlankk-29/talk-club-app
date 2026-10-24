'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { LogoMark } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/client-shell';

export function SplashScreen({ label }: { label?: string }) {
  const t = useT(shellMessages);
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <LogoMark className="h-16 w-16 animate-pulse" />
      <span className="sr-only">{label ?? t.loading}</span>
    </div>
  );
}

/** Shown when the session can't be restored because the API is unreachable. */
export function ConnectionProblem() {
  const { retry } = useAuth();
  const t = useT(shellMessages);
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center" role="alert">
      <WifiOff className="h-10 w-10 text-brand-700" />
      <div>
        <p className="font-display text-lg font-semibold">{t.cantConnect}</p>
        <p className="mt-1 text-sm text-muted">{t.cantConnectHint}</p>
      </div>
      <Button variant="outline" onClick={retry}>
        {t.tryAgain}
      </Button>
    </div>
  );
}

/** Client pages that need a signed-in member (redirects to login and back). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user, actingClientId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT(shellMessages);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === 'unavailable') return <ConnectionProblem />;
  if (status !== 'authenticated') return <SplashScreen />;
  if (!user?.client && !actingClientId && user?.managedClients.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-lg font-semibold">{t.membersOnly}</p>
        <p className="mt-2 text-sm text-muted">{t.staffAccount}</p>
        <div className="mt-6 flex justify-center gap-3">
          {user?.areas.admin && (
            <a href="/admin" className="font-semibold text-brand-700">
              {t.adminPanel}
            </a>
          )}
          {user?.areas.teacher && (
            <a href="/teacher" className="font-semibold text-brand-700">
              {t.teacherPanel}
            </a>
          )}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
