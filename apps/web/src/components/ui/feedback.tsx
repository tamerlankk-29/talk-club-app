import { CircleAlert, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api/client';
import { cn, initials } from '@/lib/utils';
import { Button } from './button';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'zest' | 'dark';

const tones: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted ring-line',
  brand: 'bg-brand-50 text-brand-800 ring-brand-100',
  success: 'bg-success-50 text-success-700 ring-success-600/15',
  warning: 'bg-warning-50 text-warning-700 ring-warning-600/15',
  danger: 'bg-danger-50 text-danger-700 ring-danger-600/15',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  zest: 'bg-zest/40 text-zest-dark ring-zest-dark/10',
  dark: 'bg-ink text-white ring-ink',
};

export function Badge({ tone = 'neutral', className, children, dot }: { tone?: Tone; className?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // Bookings
  BOOKED: { label: 'Booked', tone: 'brand' },
  ATTENDED: { label: 'Attended', tone: 'success' },
  NO_SHOW: { label: 'No-show', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  LATE_CANCELLED: { label: 'Late cancelled', tone: 'warning' },
  WAITLISTED: { label: 'Waitlisted', tone: 'info' },
  // Sessions
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'success' },
  ALMOST_FULL: { label: 'Almost full', tone: 'warning' },
  FULL: { label: 'Full', tone: 'danger' },
  STARTED: { label: 'In progress', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  // Memberships
  ACTIVE: { label: 'Active', tone: 'success' },
  USED_UP: { label: 'No visits left', tone: 'warning' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  NOT_STARTED: { label: 'Not started', tone: 'info' },
  // Payments
  PENDING: { label: 'Pending', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', tone: 'neutral' },
  // Attendance
  PRESENT: { label: 'Present', tone: 'success' },
  LATE: { label: 'Late', tone: 'warning' },
  ABSENT: { label: 'Absent', tone: 'danger' },
  // Waitlist
  WAITING: { label: 'Waiting', tone: 'info' },
  OFFERED: { label: 'Place reserved', tone: 'zest' },
  // Trials
  REQUESTED: { label: 'Requested', tone: 'info' },
  // Tasks
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  DONE: { label: 'Done', tone: 'success' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SENDING: { label: 'Sending', tone: 'info' },
  SENT: { label: 'Sent', tone: 'success' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const s = STATUS[status] ?? { label: statusLabel(status), tone: 'neutral' as Tone };
  return (
    <Badge tone={s.tone} className={className} dot>
      {label ?? s.label}
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-brand-100/50', className)} aria-hidden="true" />;
}

export function SkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-3xl border border-dashed border-brand-200 bg-white/60 px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">{icon}</div>}
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center rounded-3xl border border-danger-600/15 bg-danger-50 px-6 py-8 text-center', className)} role="alert">
      <CircleAlert className="mb-2 h-7 w-7 text-danger-600" />
      <p className="text-sm font-medium text-danger-700">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = 'brand',
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: 'brand' | 'zest' | 'white' | 'warning';
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bar = { brand: 'bg-brand-600', zest: 'bg-zest', white: 'bg-white', warning: 'bg-warning-600' }[tone];
  const track = tone === 'white' || tone === 'zest' ? 'bg-white/20' : 'bg-brand-100';
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full', track, className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const avatarColors = ['bg-brand-100 text-brand-800', 'bg-zest/50 text-zest-dark', 'bg-sky-100 text-sky-800', 'bg-orange-100 text-orange-800', 'bg-emerald-100 text-emerald-800', 'bg-pink-100 text-pink-800'];

export function Avatar({ name, src, size = 'md', className }: { name: string | null | undefined; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const dims = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-20 w-20 text-2xl' }[size];
  const color = avatarColors[(name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ''} className={cn('shrink-0 rounded-full object-cover', dims, className)} />;
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', dims, color, className)} aria-hidden={!name}>
      {initials(name)}
    </span>
  );
}

export function InlineAlert({ tone = 'info', title, children, icon, className, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div className={cn('flex gap-3 rounded-2xl p-4 ring-1 ring-inset', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
