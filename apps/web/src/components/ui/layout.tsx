'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { messagesFor } from '@/lib/i18n/active';
import { uiMessages } from '@/lib/i18n/messages/ui';
import { cn } from '@/lib/utils';
import { Skeleton } from './feedback';

export function Card({ className, children, as: Tag = 'div', padded = true }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article'; padded?: boolean }) {
  return <Tag className={cn('rounded-3xl border border-line/70 bg-white shadow-card', padded && 'p-5', className)}>{children}</Tag>;
}

export function Section({ title, action, children, className, description }: { title?: ReactNode; action?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-2">
        {back &&
          (typeof back === 'string' ? (
            <Link href={back} className="-ml-2 mt-0.5 rounded-xl p-2 text-ink hover:bg-brand-50" aria-label={messagesFor(uiMessages).back}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          ) : (
            <button type="button" onClick={() => router.back()} className="-ml-2 mt-0.5 rounded-xl p-2 text-ink hover:bg-brand-50" aria-label={messagesFor(uiMessages).back}>
              <ArrowLeft className="h-5 w-5" />
            </button>
          ))}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Tabs = RadixTabs.Root;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RadixTabs.List className={cn('flex gap-1 overflow-x-auto rounded-2xl bg-brand-50/70 p-1 scrollbar-none', className)}>{children}</RadixTabs.List>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        'flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-muted transition data-[state=active]:bg-white data-[state=active]:text-brand-800 data-[state=active]:shadow-sm',
        className,
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={cn('mt-4 outline-none', className)}>
      {children}
    </RadixTabs.Content>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-xl bg-brand-50/70 p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition',
            value === o.value ? 'bg-white text-brand-800 shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  loading,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'brand' | 'warning' | 'danger' | 'success';
  loading?: boolean;
  href?: string;
}) {
  const iconTone = {
    default: 'bg-brand-50 text-brand-700',
    brand: 'bg-brand-700 text-white',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    success: 'bg-success-50 text-success-700',
  }[tone];
  const content = (
    <Card className={cn('flex items-start justify-between gap-3', href && 'transition hover:border-brand-200 hover:shadow-md')}>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-1.5 font-display text-2xl font-semibold text-ink">{value}</p>}
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </div>
      {icon && <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', iconTone)}>{icon}</div>}
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on small screens */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
  className,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (!rows?.length) return <>{empty ?? <p className="py-10 text-center text-sm text-muted">{messagesFor(uiMessages).nothingYet}</p>}</>;
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-line bg-white', className)}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/70">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === 'Enter' ? onRowClick(row) : undefined) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn('border-b border-line/60 last:border-0', onRowClick && 'cursor-pointer transition hover:bg-brand-50/40 focus:bg-brand-50/60 focus:outline-none')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg p-2 hover:bg-brand-50 disabled:opacity-30" aria-label={messagesFor(uiMessages).previousPage}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 font-semibold text-ink">
          {page} / {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg p-2 hover:bg-brand-50 disabled:opacity-30" aria-label={messagesFor(uiMessages).nextPage}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function KeyValue({ items, className }: { items: Array<{ label: ReactNode; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn('divide-y divide-line/70', className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{item.label}</dt>
          <dd className="text-right font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
