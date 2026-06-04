import { getAuthenticatedUser } from '../../../server/authStore';
import { loadFeedMembers } from '../../../server/fitstagramData';
import {
  addPostLike,
  ensureNotificationsForPosts,
  getViewedPostIds,
  markPostViewed,
  resolvePostLikes,
} from '../../../server/fitstagramStore';
import { assignDistinctPostImages } from '../../../lib/sportImages';
import { buildPostsForUser, rankPostsForViewer } from '../../../lib/fitstagramFeed';

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
      const rawPosts = members.flatMap((member) => buildPostsForUser(
        member.userId,
        member.name,
        member.entries,
      ));
      const ranked = assignDistinctPostImages(rankPostsForViewer(rawPosts, viewerId, viewedIds)).map((post) => {
        const likeState = resolvePostLikes(post, viewerId);
        return {
          ...post,
          likes: likeState.likes,
          likedByMe: likeState.likedByMe,
          viewedBy: post.seen ? [viewerId] : [],
        };
      });

      ensureNotificationsForPosts(viewerId, ranked.filter((p) => !p.seen));

      return res.status(200).json({ posts: ranked.slice(0, 40) });
    } catch (error) {
      console.error('fitstagram feed failed:', error);
      return res.status(200).json({ posts: [] });
    }
  }

  if (req.method === 'PUT' && segments.length === 3 && segments[1] === 'viewed') {
    const targetUserId = String(segments[0] || '').trim();
    const postId = String(segments[2] || '').trim();
    if (targetUserId !== viewerId) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    markPostViewed(viewerId, postId);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT' && segments.length === 2 && segments[1] === 'like') {
    const postId = String(segments[0] || '').trim();
    const result = addPostLike(postId, viewerId);
    return res.status(200).json({ ok: true, likes: result.likes, likedByMe: result.likedByMe, added: result.added });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed.' });
}
