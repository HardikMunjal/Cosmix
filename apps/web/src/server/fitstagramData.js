import { resolveUsersByUsernames } from './authStore';

function wellnessBaseFromReq(req) {
  const host = String(req?.headers?.host || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const configured = String(process.env.WELLNESS_SERVICE_URL || '').trim();
  return configured || (isLocalHost ? 'http://127.0.0.1:3004' : 'http://wellness-service:3004');
}

function chatBaseFromReq(req) {
  const host = String(req?.headers?.host || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  return isLocalHost ? 'http://127.0.0.1:3002' : 'http://chat-service:3002';
}

export async function fetchWellnessEntries(req, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const base = wellnessBaseFromReq(req);
  try {
    const response = await fetch(`${base}/wellness/data/${encodeURIComponent(uid)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return Array.isArray(data.entries) ? data.entries : [];
  } catch (_) {
    return [];
  }
}

export async function fetchChatFriends(req, username) {
  const name = String(username || '').trim();
  if (!name) return [];
  const base = chatBaseFromReq(req);
  try {
    const response = await fetch(`${base}/chat/bootstrap?username=${encodeURIComponent(name)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return Array.isArray(data.friends) ? data.friends.map((f) => String(f || '').trim()).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

export async function loadFeedMembers(req, viewer) {
  const viewerId = String(viewer?.id || '').trim();
  const viewerName = String(viewer?.name || viewer?.username || 'You').trim();
  const username = String(viewer?.username || '').trim();

  const selfEntries = await fetchWellnessEntries(req, viewerId);
  const members = [{
    userId: viewerId,
    username,
    name: viewerName,
    entries: selfEntries,
    isSelf: true,
  }];

  const friends = await fetchChatFriends(req, username);
  if (!friends.length) return members;

  const resolved = await resolveUsersByUsernames(friends, viewerId);
  const buddyRows = await Promise.all(
    resolved.map(async (match) => {
      const buddyUserId = String(match?.id || match?.email || '').trim();
      const buddyName = String(match?.name || match?.username || 'Buddy').trim();
      if (!buddyUserId || buddyUserId === viewerId) return null;
      const entries = await fetchWellnessEntries(req, buddyUserId);
      return {
        userId: buddyUserId,
        username: String(match?.username || '').trim(),
        name: buddyName,
        entries,
        isSelf: false,
      };
    }),
  );

  buddyRows.filter(Boolean).forEach((row) => members.push(row));
  return members;
}
