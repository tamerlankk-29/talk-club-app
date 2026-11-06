import { CalendarClock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/feedback';
import type { Membership } from '@/lib/api/types';
import { fmt } from '@/lib/format';
import { cn, plural } from '@/lib/utils';

/** The hero membership card: remaining visits, usage and expiry at a glance. */
export function MembershipCard({ membership, action, className }: { membership: Membership; action?: 'book' | 'details' | 'none'; className?: string }) {
  const credited = Math.max(membership.visitsCredited, membership.visitsUsed + membership.visitsRemaining);
  const expiringSoon = membership.daysLeft <= 7 && membership.status === 'ACTIVE';
  const usedUp = membership.status === 'USED_UP';
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] p-5 text-white shadow-float',
        'bg-[linear-gradient(135deg,var(--color-brand-800)_0%,var(--color-brand-700)_55%,var(--color-brand-500)_100%)]',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-16 right-16 h-36 w-36 rounded-full bg-zest/20 blur-2xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Your membership</span>
          {expiringSoon && <span className="rounded-full bg-zest px-2.5 py-0.5 text-[11px] font-bold text-brand-950">Expires soon</span>}
          {usedUp && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold">No visits left</span>}
        </div>
        <p className="mt-2 font-display text-2xl font-semibold tracking-wide">{membership.planName}</p>
        <div className="mt-4 flex items-end gap-2">
          <span className="font-display text-5xl font-semibold leading-none">{membership.visitsRemaining}</span>
          <span className="pb-1 text-sm text-white/80">/ {credited} visits remaining</span>
        </div>
        <ProgressBar value={membership.visitsUsed} max={credited} tone="zest" className="mt-4 h-2.5" label="Visits used" />
        <div className="mt-2 flex justify-between text-xs text-white/75">
          <span>{plural(membership.visitsUsed, 'visit')} used</span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> Expires {fmt.date(membership.expiresAt)}
          </span>
        </div>
        {action !== 'none' && (
          <div className="mt-5 flex gap-2">
            {usedUp ? (
              <Link href="/membership/buy" className={buttonClasses('accent', 'md', 'flex-1')}>
                <Sparkles className="h-4 w-4" /> Buy new membership
              </Link>
            ) : action === 'details' ? (
              <Link href={`/membership/${membership.id}`} className={buttonClasses('white', 'md', 'flex-1')}>
                Visit history
              </Link>
            ) : (
              <Link href="/schedule" className={buttonClasses('accent', 'md', 'flex-1 text-[15px]')}>
                Book a session
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NoMembershipCard({ trialAvailable, trialPrice }: { trialAvailable?: boolean; trialPrice?: number }) {
  return (
    <div className="rounded-[28px] border border-brand-200 bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Your membership</p>
      <p className="mt-2 font-display text-xl font-semibold">No active membership</p>
      <p className="mt-1 text-sm text-muted">Choose a membership to start booking speaking sessions.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/membership/buy" className={buttonClasses('primary', 'md')}>
          View memberships
        </Link>
        {trialAvailable && (
          <Link href="/schedule" className={buttonClasses('accent', 'md')}>
            Try a session · {fmt.money(trialPrice)}
          </Link>
        )}
      </div>
    </div>
  );
}
