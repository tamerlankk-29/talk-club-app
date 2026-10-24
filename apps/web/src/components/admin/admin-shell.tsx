'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ExternalLink, LogOut, Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ConnectionProblem, SplashScreen } from '@/components/client/require-auth';
import { Logo } from '@/components/icons';
import { Avatar } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CommandSearch } from './command-search';
import { isActive, visibleNav } from './nav';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const groups = visibleNav(user?.permissions ?? []);
  return (
    <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      active ? 'bg-white text-brand-900 shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  if (!user) return null;
  const item = 'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-50';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-2xl py-1 pl-1 pr-3 hover:bg-brand-50" aria-label="Account menu">
        <Avatar name={user.displayName} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold leading-tight">{user.displayName}</span>
          <span className="block text-xs capitalize text-muted">{user.roles.map((r) => r.toLowerCase().replace(/_/g, ' ')).join(', ')}</span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-52 rounded-2xl border border-line bg-white p-1.5 shadow-float">
          {user.areas.teacher && (
            <DropdownMenu.Item className={item} onSelect={() => router.push('/teacher')}>
              Teacher panel
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={item} onSelect={() => window.open('/', '_blank', 'noopener')}>
            <ExternalLink className="h-4 w-4" /> Open client app
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item
            className={cn(item, 'text-danger-700')}
            onSelect={async () => {
              await logout();
              router.replace('/login?next=/admin');
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Admin frame: dark purple sidebar, sticky top bar with global search. Requires an admin-area account. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status === 'unavailable') return <ConnectionProblem />;
  if (status !== 'authenticated' || !user) return <SplashScreen />;
  if (!user.areas.admin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-xl font-semibold">No access to the admin panel</p>
        <p className="text-sm text-muted">Ask the club owner to give your account a staff role.</p>
        <div className="flex gap-4 text-sm font-semibold text-brand-700">
          {user.areas.teacher && <Link href="/teacher">Teacher panel →</Link>}
          <Link href="/">Client app →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[linear-gradient(180deg,var(--color-brand-950),var(--color-brand-900))] lg:flex">
        <Link href="/admin" className="flex h-16 items-center px-6">
          <Logo light />
        </Link>
        <Sidebar />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-brand-950/50" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[linear-gradient(180deg,var(--color-brand-950),var(--color-brand-900))] animate-fade-in">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo light />
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-xl p-2 text-white/80 hover:bg-white/10" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6">
        <button type="button" onClick={() => setMenuOpen(true)} className="rounded-xl p-2 hover:bg-brand-50 lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-sm text-subtle transition hover:border-brand-200"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search clients, leads, payments…</span>
          <kbd className="hidden rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted sm:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
