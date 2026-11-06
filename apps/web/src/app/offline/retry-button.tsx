'use client';

import { buttonClasses } from '@/components/ui/button';

export function RetryButton({ label }: { label: string }) {
  return (
    <button type="button" className={buttonClasses('primary', 'lg')} onClick={() => window.location.replace('/')}>
      {label}
    </button>
  );
}
