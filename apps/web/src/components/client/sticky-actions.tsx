'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** Floating action bar at the bottom of a detail page (above the tab bar when it is shown). */
export function StickyActions({ children, className }: { children: ReactNode; className?: string }) {
  const { status } = useAuth();
  return (
    <div className={cn('sticky z-30 mt-6', status === 'authenticated' ? 'bottom-above-nav' : 'bottom-4', className)}>
      <div className="flex gap-2 rounded-3xl bg-white/95 p-2.5 shadow-float ring-1 ring-line backdrop-blur">{children}</div>
    </div>
  );
}
