'use client';

import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; theme?: 'auto' | 'light' | 'dark' }) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the captcha'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Cloudflare Turnstile check, shown only when the API asks for it (AUTH_CAPTCHA_REQUIRED). */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, theme: 'light', callback: (token) => onTokenRef.current(token) });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (failed) {
    return <p className="text-center text-sm text-danger-600">The check could not load. Check your connection and try again.</p>;
  }
  return <div ref={ref} className="flex min-h-[65px] justify-center" />;
}
