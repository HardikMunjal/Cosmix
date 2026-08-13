const INSTALL_DISMISS_KEY = 'cosmix-pwa-install-dismissed-at';
const INSTALL_DONE_KEY = 'cosmix-pwa-was-installed';
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

let deferredInstallPrompt = null;
const installListeners = new Set();

function emitInstallEvent(event) {
  installListeners.forEach((handler) => {
    try {
      handler(event);
    } catch (_) { /* ignore */ }
  });
}

function markInstalled() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INSTALL_DONE_KEY, '1');
    localStorage.removeItem(INSTALL_DISMISS_KEY);
  } catch (_) { /* ignore */ }
}

function wasInstalledBefore() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(INSTALL_DONE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    emitInstallEvent({ type: 'ready', platform: 'chromium' });
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    markInstalled();
    emitInstallEvent({ type: 'installed' });
  });
}

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

if (typeof window !== 'undefined' && isStandaloneApp()) {
  markInstalled();
}

export function isIosDevice() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}

export function hasNativeInstallPrompt() {
  return Boolean(deferredInstallPrompt);
}

export function canShowInstallPrompt() {
  if (typeof window === 'undefined') return false;
  if (isStandaloneApp()) return false;
  if (wasInstalledBefore()) return true;
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
  if (dismissedAt && Date.now() - dismissedAt < INSTALL_DISMISS_MS) return false;
  return true;
}

export function dismissInstallPrompt() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
}

export function bindInstallPrompt(handler) {
  if (typeof window === 'undefined') return () => {};

  installListeners.add(handler);

  if (deferredInstallPrompt) {
    handler({ type: 'ready', platform: 'chromium' });
  } else if (isIosDevice() && canShowInstallPrompt()) {
    handler({ type: 'ready', platform: 'ios' });
  } else if (canShowInstallPrompt() && !isStandaloneApp()) {
    handler({ type: 'ready', platform: isIosDevice() ? 'ios' : 'manual' });
  }

  return () => {
    installListeners.delete(handler);
  };
}

export async function promptInstallApp() {
  if (!deferredInstallPrompt) return { ok: false, reason: 'unavailable' };
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice?.outcome === 'accepted') {
    deferredInstallPrompt = null;
    markInstalled();
    return { ok: true, reason: 'accepted' };
  }
  return { ok: false, reason: 'dismissed' };
}

export function getManualInstallHint() {
  if (typeof window === 'undefined') return '';
  if (isIosDevice()) {
    return 'Tap Share, then Add to Home Screen.';
  }
  const ua = String(window.navigator.userAgent || '');
  if (/android/i.test(ua)) {
    return 'Open the Chrome menu (⋮) and tap Install app or Add to Home screen.';
  }
  return 'Open the browser menu and choose Install Cosmix / Install app.';
}

export async function registerPwaServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing?.active?.scriptURL?.includes('/sw.js')) {
      return { ok: true, reason: 'already-registered', registration: existing };
    }

    if (existing) {
      await existing.unregister();
    }

    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return { ok: true, reason: 'registered', registration };
  } catch (error) {
    return { ok: false, reason: 'error', detail: String(error?.message || error) };
  }
}

export async function getPwaServiceWorkerRegistration() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (registration) return registration;
  const result = await registerPwaServiceWorker();
  return result.registration || null;
}
