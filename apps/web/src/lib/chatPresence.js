const CONTACTS_PREFIX = 'cosmix-chat-contacts-';

function contactStorageKey(userId) {
  return `${CONTACTS_PREFIX}${userId || 'guest'}`;
}

export function readKnownChatContacts(userId) {
  if (typeof window === 'undefined' || !userId) return [];

  const raw = localStorage.getItem(contactStorageKey(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

export function rememberChatContacts(userId, names = [], currentUsername = '') {
  if (typeof window === 'undefined' || !userId) return [];

  const existing = readKnownChatContacts(userId);
  const merged = Array.from(new Set([...existing, ...(names || [])].filter((name) => name && name !== currentUsername)));
  localStorage.setItem(contactStorageKey(userId), JSON.stringify(merged));
  return merged;
}