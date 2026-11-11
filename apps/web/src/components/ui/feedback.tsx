import { CircleAlert, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api/client';
import { messagesFor } from '@/lib/i18n/active';
import { uiMessages } from '@/lib/i18n/messages/ui';
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

/** Badge colour per status; the label comes from the translations. */
const STATUS_TONE: Record<string, Tone> = {
  // Bookings
  BOOKED: 'brand',
  ATTENDED: 'success',
  NO_SHOW: 'danger',
  CANCELLED: 'neutral',
  LATE_CANCELLED: 'warning',
  WAITLISTED: 'info',
  // Sessions
  SCHEDULED: 'neutral',
  OPEN: 'success',
  ALMOST_FULL: 'warning',
  FULL: 'danger',
  STARTED: 'info',
  COMPLETED: 'neutral',
  // Memberships
  ACTIVE: 'success',
  USED_UP: 'warning',
  EXPIRED: 'neutral',
  NOT_STARTED: 'info',
  // Gift certificates
  REDEEMED: 'brand',
  // Payments
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'danger',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'neutral',
  // Attendance
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  // Waitlist
  WAITING: 'info',
  OFFERED: 'zest',
  // Trials
  REQUESTED: 'info',
  // Tasks
  IN_PROGRESS: 'info',
  DONE: 'success',
  DRAFT: 'neutral',
  SENDING: 'info',
  SENT: 'success',
  SKIPPED: 'neutral',
};

export function statusLabel(status: string): string {
  return messagesFor(uiMessages).status[status] ?? status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} className={className} dot>
      {label ?? statusLabel(status)}
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-brand-100/50', className)} aria-hidden="true" />;
}

export function SkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label={messagesFor(uiMessages).loading}>
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
          {messagesFor(uiMessages).tryAgain}
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
