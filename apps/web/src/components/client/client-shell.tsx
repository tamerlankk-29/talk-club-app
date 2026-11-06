'use client';

import { Bell, CalendarDays, CreditCard, House, Ticket, UserRound, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/icons';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/queries';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Home', icon: House, match: (p: string) => p === '/' },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays, match: (p: string) => p.startsWith('/schedule') || p.startsWith('/sessions') },
  { href: '/bookings', label: 'Bookings', icon: Ticket, match: (p: string) => p.startsWith('/bookings') || p.startsWith('/attendance') },
  { href: '/membership', label: 'Membership', icon: CreditCard, match: (p: string) => p.startsWith('/membership') || p.startsWith('/payments') },
  { href: '/profile', label: 'Profile', icon: UserRound, match: (p: string) => p.startsWith('/profile') },
];

export function BellLink({ className }: { className?: string }) {
  const { data } = useUnreadCount();
  const count = data?.unreadCount ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      className={cn('relative inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-ink shadow-sm ring-1 ring-line transition hover:ring-brand-200', className)}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1 text-[11px] font-bold text-white ring-2 ring-canvas">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

/** Shown while a parent is acting for a child profile. */
function ActingBanner() {
  const { user, actingClientId, setActingClient } = useAuth();
  if (!actingClientId || !user) return null;
  const child = user.managedClients.find((c) => c.id === actingClientId);
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-zest px-4 py-2 text-sm font-semibold text-brand-950">
      <span className="flex items-center gap-2">
        <Users className="h-4 w-4" /> Managing {child?.firstName ?? 'child'}&apos;s profile
      </span>
      <button type="button" onClick={() => setActingClient(null)} className="rounded-lg bg-white/70 px-2.5 py-1 text-xs hover:bg-white">
        Back to my profile
      </button>
    </div>
  );
}

/** Mobile-first app frame: centred column, bottom tab bar, safe areas. */
export function ClientShell({ children, hideNav }: { children: ReactNode; hideNav?: boolean }) {
  const pathname = usePathname();
  const { status } = useAuth();
  const showNav = !hideNav && status === 'authenticated';
  return (
    <div className="min-h-dvh bg-canvas md:bg-[radial-gradient(circle_at_top,_var(--color-brand-100),_var(--color-canvas)_45%)]">
      <div className="relative mx-auto min-h-dvh w-full max-w-[520px] bg-canvas md:shadow-[0_0_60px_-20px_rgb(76_29_149/0.25)]">
        <ActingBanner />
        <main className={cn('px-4 pt-safe', showNav ? 'pb-28' : 'pb-10')}>{children}</main>
        {showNav && (
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[520px] border-t border-line/80 bg-white/90 pb-safe backdrop-blur-xl"
          >
            <ul className="grid grid-cols-5 px-2 pt-1.5">
              {NAV.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-semibold transition',
                        active ? 'text-brand-700' : 'text-subtle hover:text-ink',
                      )}
                    >
                      <span className={cn('flex h-8 w-12 items-center justify-center rounded-full transition', active && 'bg-brand-100')}>
                        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

/** Compact top bar for inner client pages. */
export function ClientTopBar({ title, right }: { title?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <Link href="/" className="flex items-center gap-2" aria-label="Talk Club home">
        <LogoMark className="h-8 w-8" />
        {title && <span className="font-display text-base font-semibold">{title}</span>}
      </Link>
      {right ?? <BellLink />}
    </div>
  );
}
