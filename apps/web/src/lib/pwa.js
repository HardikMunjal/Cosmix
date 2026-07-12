const INSTALL_DISMISS_KEY = 'cosmix-pwa-install-dismissed-at';
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

let deferredInstallPrompt = null;

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function isIosDevice() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
}

export function canShowInstallPrompt() {
  if (typeof window === 'undefined') return false;
  if (isStandaloneApp()) return false;
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

  function onBeforeInstallPrompt(event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    handler({ type: 'ready', platform: 'chromium' });
  }

  function onAppInstalled() {
    deferredInstallPrompt = null;
    handler({ type: 'installed' });
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);

  if (isIosDevice() && canShowInstallPrompt()) {
    handler({ type: 'ready', platform: 'ios' });
  }

  return () => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
  };
}

export async function promptInstallApp() {
  if (!deferredInstallPrompt) return { ok: false, reason: 'unavailable' };
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice?.outcome === 'accepted') {
    deferredInstallPrompt = null;
    return { ok: true, reason: 'accepted' };
  }
  return { ok: false, reason: 'dismissed' };
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
