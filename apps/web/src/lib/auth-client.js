export function persistClientUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearClientUser() {
  localStorage.removeItem('user');
}

export function getCachedClientUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.username) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export async function restoreUserSession(router, setUser) {
  const cached = getCachedClientUser();
  if (cached) {
    setUser(cached);
  }

  try {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.user) {
      clearClientUser();
      setUser(null);
      router.push('/');
      return null;
    }
    persistClientUser(data.user);
    setUser(data.user);
    return data.user;
  } catch (_) {
    if (!cached) {
      clearClientUser();
      setUser(null);
      router.push('/');
      return null;
    }
    return cached;
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