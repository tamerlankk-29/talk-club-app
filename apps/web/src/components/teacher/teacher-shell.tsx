'use client';

import { CalendarDays, CalendarRange, QrCode, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ConnectionProblem, SplashScreen } from '@/components/client/require-auth';
import { LogoMark } from '@/components/icons';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/teacher', label: 'Today', icon: CalendarDays, match: (p: string) => p === '/teacher' },
  { href: '/teacher/sessions', label: 'Sessions', icon: CalendarRange, match: (p: string) => p.startsWith('/teacher/sessions') },
  { href: '/teacher/scan', label: 'Check-in', icon: QrCode, match: (p: string) => p.startsWith('/teacher/scan') },
  { href: '/teacher/profile', label: 'Profile', icon: UserRound, match: (p: string) => p.startsWith('/teacher/profile') },
];

/** Phone-first frame for teachers: their sessions, attendance, check-in and feedback. */
export function TeacherShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === 'unavailable') return <ConnectionProblem />;
  if (status !== 'authenticated' || !user) return <SplashScreen />;
  if (!user.areas.teacher) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-xl font-semibold">This area is for Talk Club teachers</p>
        <p className="text-sm text-muted">Your account isn&apos;t linked to a teacher profile.</p>
        <div className="flex gap-4 text-sm font-semibold text-brand-700">
          {user.areas.admin && <Link href="/admin">Admin panel →</Link>}
          <Link href="/">Client app →</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-canvas md:bg-[radial-gradient(circle_at_top,_var(--color-brand-100),_var(--color-canvas)_45%)]">
      <div className="relative mx-auto min-h-dvh w-full max-w-[640px] bg-canvas md:shadow-[0_0_60px_-20px_rgb(76_29_149/0.25)]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/70 bg-white/90 px-4 py-3 pt-safe backdrop-blur-xl">
          <Link href="/teacher" className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="font-display text-base font-semibold">Teacher</span>
          </Link>
          <span className="truncate text-sm font-medium text-muted">{user.teacher?.name ?? user.displayName}</span>
        </header>
        <main className="px-4 pb-28 pt-4">{children}</main>
        <nav aria-label="Teacher" className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[640px] border-t border-line/80 bg-white/90 pb-safe backdrop-blur-xl">
          <ul className="grid grid-cols-4 px-2 pt-1.5">
            {NAV.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn('flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-semibold', active ? 'text-brand-700' : 'text-subtle hover:text-ink')}
                  >
                    <span className={cn('flex h-8 w-12 items-center justify-center rounded-full', active && 'bg-brand-100')}>
                      <Icon className="h-[22px] w-[22px]" />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
