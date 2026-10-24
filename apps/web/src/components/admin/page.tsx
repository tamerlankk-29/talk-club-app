'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Standard admin page header with title, description and actions. */
export function AdminPage({
  title,
  description,
  actions,
  back,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Link for the back arrow next to the title */
  back?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {back && (
              <Link href={back} className="-ml-2 rounded-xl p-2 text-ink hover:bg-brand-50" aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          </div>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Row of filters above a table. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/** Compact select used in toolbars. */
export function FilterSelect({
  value,
  onChange,
  children,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn('h-10 rounded-xl border border-line bg-white px-3 pr-8 text-sm font-medium text-ink focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100', className)}
    >
      {children}
    </select>
  );
}

export const CHART_COLORS = ['#6d28d9', '#a78bfa', '#c6f432', '#0ea5e9', '#f59e0b', '#ec4899', '#16a34a', '#64748b'];
