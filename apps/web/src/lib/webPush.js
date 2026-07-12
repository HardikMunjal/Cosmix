import { getPwaServiceWorkerRegistration } from './pwa';

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

function chatApiBase() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  return isLocalHost ? `http://${host}:3002/chat` : `${window.location.origin}/chat-api/chat`;
}

const subscribedUsers = new Set();

/**
 * Register this browser for Web Push (chat DMs, groups, friend requests).
 * Safe to call multiple times; runs once per username per page load.
 */
export async function subscribeToWebPush(username, { force = false } = {}) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  const actor = String(username || '').trim();
  if (!actor) return { ok: false, reason: 'no-user' };
  if (force) subscribedUsers.delete(actor);
  if (!force && subscribedUsers.has(actor)) return { ok: true, reason: 'already-subscribed' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const permission = window.Notification.permission === 'default'
      ? await window.Notification.requestPermission()
      : window.Notification.permission;
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

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

    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });

    const subscribeResponse = await fetch(`${apiBase}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsername: actor, subscription }),
    });
    if (!subscribeResponse.ok) {
      return { ok: false, reason: 'subscribe-failed' };
    }

    subscribedUsers.add(actor);
    return { ok: true, reason: 'subscribed' };
  } catch (error) {
    return { ok: false, reason: 'error', detail: String(error?.message || error) };
  }
}
