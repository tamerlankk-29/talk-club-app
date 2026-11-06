import * as Sentry from '@sentry/node';

/**
 * Error reporting to Sentry, on only when SENTRY_DSN is set. Loaded before anything
 * else in main.ts. Sends no request bodies, cookies or IP addresses.
 */
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION || undefined,
    // Members' phones, tokens and messages stay on our server.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
  });
}

/** Reports an unexpected error (5xx, failed job) when Sentry is on; a no-op otherwise. */
export function reportError(error: unknown, context?: Record<string, string | undefined>): void {
  if (!dsn) return;
  Sentry.captureException(error, context ? { tags: context } : undefined);
}
