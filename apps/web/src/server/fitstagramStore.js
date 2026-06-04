import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'fitstagram-store.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ views: {}, likes: {}, notifications: {}, pushed: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (_) {
    return { views: {}, likes: {}, notifications: {}, pushed: {} };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function userViews(store, userId) {
  if (!store.views[userId]) store.views[userId] = [];
  return store.views[userId];
}

function userNotifications(store, userId) {
  if (!store.notifications[userId]) store.notifications[userId] = [];
  return store.notifications[userId];
}

function normalizeLikeEntry(raw) {
  if (raw && Array.isArray(raw.voters)) {
    return { voters: raw.voters.map((id) => String(id)).filter(Boolean) };
  }
  if (typeof raw === 'number' && raw > 0) {
    return { voters: [] };
  }
  return { voters: [] };
}

export function getViewedPostIds(userId) {
  const store = readStore();
  return new Set(userViews(store, userId));
}

export function markPostViewed(userId, postId) {
  if (!userId || !postId) return false;
  const store = readStore();
  const views = userViews(store, userId);
  if (!views.includes(postId)) {
    views.push(postId);
    writeStore(store);
  }
  return true;
}

export function getPostLikeCount(postId) {
  const store = readStore();
  return normalizeLikeEntry(store.likes[postId]).voters.length;
}

export function hasUserLikedPost(postId, userId) {
  if (!postId || !userId) return false;
  const store = readStore();
  const entry = normalizeLikeEntry(store.likes[postId]);
  return entry.voters.includes(String(userId));
}

export function addPostLike(postId, userId) {
  if (!postId || !userId) return { likes: 0, likedByMe: false, added: false };
  const store = readStore();
  const entry = normalizeLikeEntry(store.likes[postId]);
  const uid = String(userId);
  if (entry.voters.includes(uid)) {
    return { likes: entry.voters.length, likedByMe: true, added: false };
  }
  entry.voters.push(uid);
  store.likes[postId] = entry;
  writeStore(store);
  return { likes: entry.voters.length, likedByMe: true, added: true };
}

export function resolvePostLikes(post, viewerId) {
  const postId = String(post?.id || '');
  return {
    likes: getPostLikeCount(postId),
    likedByMe: hasUserLikedPost(postId, viewerId),
  };
}

export function listFitstagramNotifications(userId) {
  const store = readStore();
  return [...userNotifications(store, userId)]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 20);
}

export function markNotificationViewed(userId, notificationId) {
  const store = readStore();
  const list = userNotifications(store, userId);
  const item = list.find((n) => n.id === notificationId);
  if (!item) return false;
  item.viewed = true;
  writeStore(store);
  return true;
}

export function ensureNotificationsForPosts(viewerId, posts = []) {
  if (!viewerId || !posts.length) return [];
  const store = readStore();
  if (!store.pushed[viewerId]) store.pushed[viewerId] = {};
  const pushed = store.pushed[viewerId];
  const created = [];

  posts
    .filter((post) => post.notifiable && String(post.authorId) !== String(viewerId))
    .slice(0, 8)
    .forEach((post) => {
      if (pushed[post.id]) return;
      const notification = {
        id: `fit-notif-${post.id}`,
        userId: viewerId,
        type: 'fitstagram',
        title: post.title,
        description: post.body,
        postId: post.id,
        authorName: post.authorName,
        linkTab: 'posts',
        viewed: false,
        createdAt: post.createdAt || new Date().toISOString(),
      };
      userNotifications(store, viewerId).unshift(notification);
      pushed[post.id] = true;
      created.push(notification);
    });

  if (created.length) writeStore(store);
  return created;
}
