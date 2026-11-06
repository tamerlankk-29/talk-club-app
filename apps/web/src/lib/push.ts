'use client';

import { api, call } from './api/client';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'enabled' | 'available';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Current push capability of this device/browser for the signed-in user. */
export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  // iOS only delivers web push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'enabled' : 'available';
}

/** Asks permission, subscribes with the server's VAPID key and registers the device. */
export async function enablePush(): Promise<PushState> {
  const state = await getPushState();
  if (state === 'unsupported' || state === 'needs-install' || state === 'denied') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'available';
  const { publicKey } = await call(api.GET('/api/notifications/push/public-key'));
  if (!publicKey) throw new Error('Push notifications are not configured on the server.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  const json = subscription.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  await call(
    api.POST('/api/notifications/push/subscribe', {
      body: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } },
    }),
  );
  return 'enabled';
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await call(api.POST('/api/notifications/push/unsubscribe', { body: { endpoint: subscription.endpoint } })).catch(() => undefined);
  await subscription.unsubscribe();
}
