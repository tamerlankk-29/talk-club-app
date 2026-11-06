'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError, api, call } from '@/lib/api/client';
import { AuthProvider } from '@/lib/auth';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // Business errors (4xx) are final; retry network/server hiccups twice.
          if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** Applies brand colours configured in Settings → Branding. */
function BrandingSync() {
  const { data } = useQuery({
    queryKey: ['public', 'club'],
    queryFn: () => call(api.GET('/api/public/club')),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    const branding = data?.branding;
    if (!branding) return;
    const root = document.documentElement;
    root.style.setProperty('--color-brand-700', branding.primaryColor);
    root.style.setProperty('--color-zest', branding.accentColor);
  }, [data?.branding]);
  return null;
}

/** Registers the service worker (offline shell, caching, push notifications). */
function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrandingSync />
        <ServiceWorkerRegistrar />
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
