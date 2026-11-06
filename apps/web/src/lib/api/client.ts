import createClient from 'openapi-fetch';
import type { paths } from './schema';
import type { AuthTokens } from './types';

/** Error raised for any failed API call; `message` is always safe to show to users. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// ─── Session state (memory only — never localStorage) ───

let accessToken: string | null = null;
let actingClientId: string | null = null;
let sessionListener: ((tokens: AuthTokens | null) => void) | null = null;

export const session = {
  token: () => accessToken,
  setToken(token: string | null) {
    accessToken = token;
  },
  actingClient: () => actingClientId,
  setActingClient(id: string | null) {
    actingClientId = id;
  },
  /** AuthProvider subscribes to learn about refreshed or lost sessions. */
  onChange(listener: ((tokens: AuthTokens | null) => void) | null) {
    sessionListener = listener;
  },
};

let refreshing: Promise<AuthTokens | null> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent
 * callers share one request. Resolves null when there is no valid session;
 * rejects with a NETWORK ApiError when the API can't be reached (offline,
 * restarting) so a hiccup never signs the user out.
 */
export function refreshSession(): Promise<AuthTokens | null> {
  // The API sets this readable hint next to the httpOnly refresh cookie.
  if (typeof document !== 'undefined' && !/(?:^|;\s*)tc_session=1/.test(document.cookie)) {
    accessToken = null;
    return Promise.resolve(null);
  }
  if (!refreshing) {
    refreshing = (async () => {
      const backoff = [500, 1500, 3000];
      for (let attempt = 0; ; attempt += 1) {
        let response: Response | null = null;
        try {
          response = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
            body: '{}',
          });
        } catch {
          response = null;
        }
        if (response?.ok) {
          const tokens = (await response.json()) as AuthTokens;
          accessToken = tokens.accessToken;
          sessionListener?.(tokens);
          return tokens;
        }
        if (response && response.status >= 400 && response.status < 500) {
          accessToken = null;
          return null;
        }
        if (attempt >= backoff.length) throw new ApiError(0, 'NETWORK', 'Cannot reach Talk Club right now. Check your connection.');
        await sleep(backoff[attempt]);
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function withAuth(request: Request): Request {
  const headers = new Headers(request.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (actingClientId) headers.set('X-Acting-Client', actingClientId);
  return new Request(request, { headers, credentials: 'same-origin' });
}

/** fetch with the access token; transparently refreshes once on 401. */
export async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const response = await fetch(withAuth(request));
  if (response.status !== 401 || !accessToken || new URL(request.url).pathname.startsWith('/api/auth/')) {
    return response;
  }
  const tokens = await refreshSession();
  if (!tokens) {
    sessionListener?.(null);
    return response;
  }
  return fetch(withAuth(retry));
}

export const api = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? (process.env.API_INTERNAL_URL ?? 'http://localhost:4000') : '',
  fetch: authFetch,
});

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; requestId?: string };
}

export function toApiError(status: number, body: unknown): ApiError {
  const e = (body as ErrorEnvelope | undefined)?.error;
  return new ApiError(status, e?.code ?? (status >= 500 ? 'INTERNAL' : 'UNKNOWN'), e?.message ?? GENERIC_ERROR, e?.details, e?.requestId);
}

/** Unwraps an openapi-fetch call: returns data or throws ApiError. */
export async function call<T>(promise: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, 'NETWORK', 'No connection. Check your internet and try again.');
  }
  if (!result.response.ok || result.error !== undefined) throw toApiError(result.response.status, result.error);
  return result.data as T;
}

/** Authenticated file download (calendar files, exports, data export). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await authFetch(new Request(path, { method: 'GET' }));
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      /* not JSON */
    }
    throw toApiError(response.status, body);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Multipart upload (photos, imports). */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await authFetch(new Request(path, { method: 'POST', body: form }));
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

/** Per-field messages from a VALIDATION_FAILED response ({ fieldPath: message }). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') return {};
  const fields = (error.details as { fields?: unknown } | undefined)?.fields;
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? (fields as Record<string, string>) : {};
}
