export function persistClientUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearClientUser() {
  localStorage.removeItem('user');
}

export async function restoreUserSession(router, setUser) {
  try {
    const response = await fetch('/api/auth/session');
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

export async function logoutClientSession(router) {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
    // Ignore logout cleanup failures.
  }
  clearClientUser();
  router.push('/');
}