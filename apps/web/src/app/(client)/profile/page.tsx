'use client';

import {
  BarChart3,
  Bell,
  ChevronRight,
  CircleHelp,
  Gift,
  History,
  Info,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  NotebookText,
  QrCode,
  ShieldCheck,
  UserPen,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ClientTopBar } from '@/components/client/client-shell';
import { RequireAuth } from '@/components/client/require-auth';
import { Avatar, Badge, Skeleton } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { useClub, useProfile } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}

function Profile() {
  const router = useRouter();
  const { user, actingClientId, setActingClient, logout } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: club } = useClub();
  const acting = !!actingClientId;
  const profiles = user ? [...(user.client ? [{ ...user.client, self: true }] : []), ...user.managedClients.map((c) => ({ ...c, self: false }))] : [];

  return (
    <div className="space-y-6">
      <ClientTopBar title="Profile" />

      <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-card ring-1 ring-line/70">
        {isLoading || !profile ? (
          <>
            <Skeleton className="h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          </>
        ) : (
          <>
            <Avatar name={profile.fullName} src={profile.photoUrl} size="xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-semibold">{profile.fullName}</p>
              {profile.phone && <p className="text-sm text-muted">{fmt.phone(profile.phone)}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="brand">{profile.level?.name ?? 'Level not set'}</Badge>
                <Badge>Since {fmt.dateShort(profile.registeredAt)}</Badge>
              </div>
            </div>
          </>
        )}
      </div>

      {profiles.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Profiles</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
            {profiles.map((p) => {
              const active = p.self ? !actingClientId : actingClientId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActingClient(p.self ? null : p.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold ring-1 transition',
                    active ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white ring-line hover:ring-brand-200',
                  )}
                >
                  <Avatar name={`${p.firstName} ${p.lastName ?? ''}`} src={p.photoUrl} size="sm" />
                  {p.self ? 'Me' : p.firstName}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <MenuGroup>
        <MenuItem href="/profile/edit" icon={<UserPen />} label="Edit profile" />
        <MenuItem href="/profile/progress" icon={<BarChart3 />} label="My progress" hint="Teacher feedback and stats" />
        <MenuItem href="/attendance" icon={<History />} label="Attendance history" />
        {club?.policies.qrCheckinEnabled && <MenuItem href="/profile/check-in" icon={<QrCode />} label="Check-in QR code" />}
      </MenuGroup>

      {!acting && (
        <MenuGroup>
          <MenuItem href="/profile/family" icon={<Users />} label="Family" hint="Manage your children's profiles" />
          {club?.policies.referralsEnabled && <MenuItem href="/profile/referral" icon={<Gift />} label="Invite a friend" hint={club.policies.referralReward || undefined} />}
        </MenuGroup>
      )}

      <MenuGroup>
        <MenuItem href="/profile/notifications" icon={<Bell />} label="Notifications" />
        {!acting && <MenuItem href="/profile/privacy" icon={<ShieldCheck />} label="Privacy & data" />}
        {!acting && <MenuItem href="/profile/password" icon={<KeyRound />} label={user?.hasPassword ? 'Change password' : 'Set a password'} />}
      </MenuGroup>

      <MenuGroup>
        <MenuItem href="/about" icon={<Info />} label="About Talk Club" />
        <MenuItem href="/rules" icon={<NotebookText />} label="Club rules" />
        <MenuItem href="/faq" icon={<CircleHelp />} label="FAQ" />
        <MenuItem href="/location" icon={<MapPin />} label="Location" />
        <MenuItem href="/contact" icon={<MessageCircle />} label="Contact us" />
      </MenuGroup>

      {(user?.areas.admin || user?.areas.teacher) && (
        <MenuGroup>
          {user?.areas.admin && <MenuItem href="/admin" icon={<LayoutDashboard />} label="Admin panel" />}
          {user?.areas.teacher && <MenuItem href="/teacher" icon={<LayoutDashboard />} label="Teacher panel" />}
        </MenuGroup>
      )}

      <button
        type="button"
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-danger-700 hover:bg-danger-50"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
      <p className="text-center text-xs text-subtle">Talk Club · {club?.location?.address ?? 'Almaty'}</p>
    </div>
  );
}

function MenuGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line/70 overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line/70">{children}</div>;
}

function MenuItem({ href, icon, label, hint }: { href: string; icon: ReactNode; label: string; hint?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-brand-50/50">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      <ChevronRight className="h-5 w-5 text-subtle" />
    </Link>
  );
}
