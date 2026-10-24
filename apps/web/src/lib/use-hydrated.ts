'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False during server rendering and hydration, true afterwards. Use it for
 * output that depends on data the server can't know yet (cached queries, the
 * device), so the first client render matches the HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
