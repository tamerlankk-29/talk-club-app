import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type Locale, localeFromHeader } from './utils/locale';

export interface RequestContextData {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  /** Language of the screen the request came from (Accept-Language). */
  locale: Locale;
}

const storage = new AsyncLocalStorage<RequestContextData>();

/** Per-request metadata (request id, IP, user agent) available anywhere via AsyncLocalStorage. */
export const RequestContext = {
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
};

/** Language of the current request; English outside a request (jobs, events). */
export function requestLocale(): Locale {
  return storage.getStore()?.locale ?? 'en';
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const data: RequestContextData = {
    requestId,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
    locale: localeFromHeader(req.header('accept-language')),
  };
  storage.run(data, () => next());
}
