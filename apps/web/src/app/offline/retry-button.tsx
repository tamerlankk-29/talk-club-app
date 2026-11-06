'use client';

import { buttonClasses } from '@/components/ui/button';

export function RetryButton() {
  return (
    <button type="button" className={buttonClasses('primary', 'lg')} onClick={() => window.location.replace('/')}>
      Try again
    </button>
  );
}
