export function persistClientUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearClientUser() {
  localStorage.removeItem('user');
}

export async function restoreUserSession(router, setUser) {
  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.user) {
      throw new Error(data.error || 'Session expired.');
    }
    persistClientUser(data.user);
    setUser(data.user);
    return data.user;
  } catch (_) {
    clearClientUser();
    setUser(null);
    router.push('/');
    return null;
  }
}

export async function clearClientCaches() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.clear();
  } catch (_) {
    // Ignore storage clear failures.
  }

  try {
    window.sessionStorage.clear();
  } catch (_) {
    // Ignore storage clear failures.
  }

  try {
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
  } catch (_) {
    // Ignore cache API failures.
  }
}

export async function logoutClientSession(router) {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
    // Ignore logout cleanup failures.
  }
  await clearClientCaches();
  clearClientUser();
  router.push('/');
}