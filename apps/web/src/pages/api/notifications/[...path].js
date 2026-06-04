import { getAuthenticatedUser } from '../../../server/authStore';
import {
  ensureNotificationsForPosts,
  getViewedPostIds,
  listFitstagramNotifications,
  markNotificationViewed,
} from '../../../server/fitstagramStore';
import { loadFeedMembers } from '../../../server/fitstagramData';
import { buildPostsForUser, rankPostsForViewer } from '../../../lib/fitstagramFeed';

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || '';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function fetchLegacyNotifications(req, userId) {
  const segments = userId;
  const host = String(req.headers.host || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  const serviceBase = isLocalHost ? 'http://127.0.0.1:3006' : (NOTIFICATION_SERVICE_URL || 'http://notification-service:3006');
  const target = `${serviceBase}/notifications/${segments}`;

  try {
    const upstream = await fetch(target, { method: 'GET', headers: { 'content-type': 'application/json' } });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !Array.isArray(data.notifications)) return [];
    return data.notifications;
  } catch (_) {
    return [];
  }
}

export default async function handler(req, res) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) {
    return res.status(401).json({ error: 'Session expired.' });
  }

  const viewerId = String(user.id || '').trim();
  const segments = Array.isArray(req.query.path) ? req.query.path : [String(req.query.path || '')];

  if (req.method === 'GET' && segments.length === 1) {
    const targetUserId = String(segments[0] || '').trim();
    if (targetUserId !== viewerId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      const members = await loadFeedMembers(req, user);
      const viewedIds = getViewedPostIds(viewerId);
      const rawPosts = members.flatMap((member) => buildPostsForUser(member.userId, member.name, member.entries));
      const ranked = rankPostsForViewer(rawPosts, viewerId, viewedIds);
      ensureNotificationsForPosts(viewerId, ranked.filter((p) => !p.seen));

      const fitNotifs = listFitstagramNotifications(viewerId)
        .filter((item) => !item.viewed)
        .map((item) => ({
          id: item.id,
          type: item.type || 'fitstagram',
          title: item.title,
          description: item.description,
          postId: item.postId,
          linkTab: item.linkTab || 'posts',
          createdAt: item.createdAt,
          viewed: item.viewed,
        }));

      const legacy = await fetchLegacyNotifications(req, viewerId);
      const legacyMapped = legacy.map((item) => ({
        id: item.id,
        type: 'notification',
        title: item.title,
        description: item.description,
        createdAt: item.createdAt,
        viewed: item.viewed,
        linkTab: 'home',
      }));

      const merged = [...fitNotifs, ...legacyMapped]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 15);

      return res.status(200).json({ notifications: merged });
    } catch (error) {
      console.error('notifications feed failed:', error);
      return res.status(200).json({ notifications: [] });
    }
  }

  if (req.method === 'PUT' && segments.length === 3 && segments[1] === 'viewed') {
    const targetUserId = String(segments[0] || '').trim();
    const notificationId = String(segments[2] || '').trim();
    if (targetUserId !== viewerId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    markNotificationViewed(viewerId, notificationId);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed.' });
}
