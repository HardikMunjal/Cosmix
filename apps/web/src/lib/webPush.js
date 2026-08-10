import { getPwaServiceWorkerRegistration, registerPwaServiceWorker } from './pwa';

function base64UrlToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function uint8ToBase64Url(bytes) {
  let binary = '';
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes || []);
  arr.forEach((b) => { binary += String.fromCharCode(b); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function chatApiBase() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  return isLocalHost ? `http://${host}:3002/chat` : `${window.location.origin}/chat-api/chat`;
}

const subscribedUsers = new Set();

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

/**
 * Register this browser for Web Push (chat DMs, groups, friend requests).
 * Must be called after the user grants notification permission (tap "Enable alerts").
 */
export async function subscribeToWebPush(username, { force = false, requestPermission = true } = {}) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  const actor = String(username || '').trim();
  if (!actor) return { ok: false, reason: 'no-user' };
  if (force) subscribedUsers.delete(actor);
  if (!force && subscribedUsers.has(actor)) return { ok: true, reason: 'already-subscribed' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    let permission = window.Notification.permission;
    if (permission === 'default' && requestPermission) {
      permission = await window.Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-denied', permission };
    }

    await registerPwaServiceWorker();
    const apiBase = chatApiBase();
    const registration = await getPwaServiceWorkerRegistration();
    if (!registration) {
      return { ok: false, reason: 'no-service-worker' };
    }

    const keyResponse = await fetch(`${apiBase}/push/public-key`);
    const keyPayload = await keyResponse.json().catch(() => ({}));
    const publicKey = String(keyPayload?.publicKey || '').trim();
    if (!publicKey) {
      return { ok: false, reason: 'no-vapid-key' };
    }

    let subscription = await registration.pushManager.getSubscription();
    const existingKey = subscription?.options?.applicationServerKey
      ? uint8ToBase64Url(subscription.options.applicationServerKey)
      : '';
    const keyMismatch = Boolean(subscription && existingKey && existingKey !== publicKey);

    if (!subscription || force || keyMismatch) {
      if (subscription) {
        try { await subscription.unsubscribe(); } catch (_) { /* ignore */ }
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
    }

    const subscribeResponse = await fetch(`${apiBase}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsername: actor, subscription }),
    });
    if (!subscribeResponse.ok) {
      return { ok: false, reason: 'subscribe-failed' };
    }

    subscribedUsers.add(actor);
    return { ok: true, reason: keyMismatch ? 'resubscribed' : 'subscribed' };
  } catch (error) {
    return { ok: false, reason: 'error', detail: String(error?.message || error) };
  }
}
