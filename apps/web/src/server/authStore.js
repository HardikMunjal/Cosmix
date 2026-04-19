import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';
import { assignOrphanStrategiesToOwner } from './strategyStore';
import { ensureWebStorage, getWebPool, hasPostgresStorage } from './postgres';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_DB_FILE = path.join(DATA_DIR, 'users.db');
const SESSIONS_DB_FILE = path.join(DATA_DIR, 'sessions.db');
const SESSION_COOKIE_NAME = 'cosmix_session';
const SESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SEEDED_USER = {
  id: 'usr-hardi',
  username: 'Hardi',
  email: 'hardik.munjaal@gmail.com',
  password: '123',
  quote: 'Building better decisions, one signal at a time.',
  avatar: '',
};

let dbBundlePromise = null;
let seededUserPromise = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('Username is required.');
  if (trimmed.length < 3) throw new Error('Username must be at least 3 characters.');
  if (trimmed.length > 40) throw new Error('Username must be 40 characters or less.');
  return trimmed;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 3) throw new Error('Password must be at least 3 characters.');
  return password;
}

function validateGmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return '';
  if (!/^[^\s@]+@gmail\.com$/i.test(normalizedEmail)) {
    throw new Error('Use a valid Gmail address.');
  }
  return normalizedEmail;
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || '').split(':');
  if (!salt || !expectedHash) return false;
  const actualHash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  return header.split(';').reduce((cookies, chunk) => {
    const [rawName, ...rest] = chunk.trim().split('=');
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rest.join('='));
    return cookies;
  }, {});
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieValue);
    return;
  }
  const current = Array.isArray(existing) ? existing : [existing];
  res.setHeader('Set-Cookie', [...current, cookieValue]);
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function buildClientUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    authMethod: user.email ? 'gmail-or-password' : 'password',
    quote: user.quote || 'Building better decisions, one signal at a time.',
    avatar: user.avatar || '',
  };
}

function mapPgUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    usernameKey: row.username_key,
    email: row.email || '',
    emailKey: row.email_key || undefined,
    passwordHash: row.password_hash || '',
    quote: row.quote || '',
    avatar: row.avatar || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function initStores() {
  ensureDataDir();

  const users = new Datastore({ filename: USERS_DB_FILE, autoload: true, timestampData: false });
  const sessions = new Datastore({ filename: SESSIONS_DB_FILE, autoload: true, timestampData: false });

  if (users.autoloadPromise) await users.autoloadPromise;
  if (sessions.autoloadPromise) await sessions.autoloadPromise;

  await users.ensureIndexAsync({ fieldName: 'id', unique: true });
  await users.ensureIndexAsync({ fieldName: 'usernameKey', unique: true });
  await users.ensureIndexAsync({ fieldName: 'emailKey', unique: true, sparse: true });
  await sessions.ensureIndexAsync({ fieldName: 'id', unique: true });
  await sessions.ensureIndexAsync({ fieldName: 'tokenHash', unique: true });
  await sessions.ensureIndexAsync({ fieldName: 'userId' });

  await sessions.removeAsync({ expiresAt: { $lt: new Date().toISOString() } }, { multi: true });

  const seededUser = await upsertSeededUser(users);
  await assignOrphanStrategiesToOwner(seededUser.id);

  return { users, sessions };
}

async function upsertSeededUser(users) {
  const usernameKey = normalizeUsername(SEEDED_USER.username);
  const emailKey = normalizeEmail(SEEDED_USER.email);
  const existing = await users.findOneAsync({ $or: [{ id: SEEDED_USER.id }, { usernameKey }, { emailKey }] }).execAsync();
  const nextUser = {
    ...existing,
    id: existing?.id || SEEDED_USER.id,
    username: existing?.username || SEEDED_USER.username,
    usernameKey,
    email: SEEDED_USER.email,
    emailKey,
    passwordHash: hashPassword(SEEDED_USER.password),
    quote: existing?.quote || SEEDED_USER.quote,
    avatar: existing?.avatar || SEEDED_USER.avatar,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await users.updateAsync({ id: nextUser.id }, nextUser, { upsert: true });
  return nextUser;
}

async function getStores() {
  if (!dbBundlePromise) {
    dbBundlePromise = initStores();
  }
  return dbBundlePromise;
}

async function ensureSeededUser() {
  if (!hasPostgresStorage()) return null;
  if (!seededUserPromise) {
    seededUserPromise = (async () => {
      const pool = await ensureWebStorage();
      const usernameKey = normalizeUsername(SEEDED_USER.username);
      const emailKey = normalizeEmail(SEEDED_USER.email);
      await pool.query(
        `INSERT INTO app_users (
           id, username, username_key, email, email_key, password_hash, quote, avatar, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE
         SET username = COALESCE(app_users.username, EXCLUDED.username),
             username_key = EXCLUDED.username_key,
             email = EXCLUDED.email,
             email_key = EXCLUDED.email_key,
             password_hash = EXCLUDED.password_hash,
             quote = COALESCE(NULLIF(app_users.quote, ''), EXCLUDED.quote),
             avatar = COALESCE(app_users.avatar, EXCLUDED.avatar),
             updated_at = NOW()`,
        [
          SEEDED_USER.id,
          SEEDED_USER.username,
          usernameKey,
          SEEDED_USER.email,
          emailKey,
          hashPassword(SEEDED_USER.password),
          SEEDED_USER.quote,
          SEEDED_USER.avatar,
        ],
      );
      await assignOrphanStrategiesToOwner(SEEDED_USER.id);
      const seeded = await pool.query('SELECT * FROM app_users WHERE id = $1', [SEEDED_USER.id]);
      return mapPgUser(seeded.rows[0]);
    })();
  }
  return seededUserPromise;
}

function setSessionCookie(res, token, expiresAt) {
  const expiryDate = new Date(expiresAt);
  appendSetCookie(res, serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_WINDOW_MS / 1000,
    expires: expiryDate,
  }));
}

function clearSessionCookie(res) {
  appendSetCookie(res, serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  }));
}

async function createSessionForUser(userId, res) {
  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_WINDOW_MS).toISOString();
    const session = {
      id: `sess-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      userId: String(userId),
      tokenHash: hashSessionToken(token),
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      expiresAt,
    };
    await pool.query(
      `INSERT INTO app_sessions (id, user_id, token_hash, created_at, last_activity_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.id, session.userId, session.tokenHash, session.createdAt, session.lastActivityAt, session.expiresAt],
    );
    setSessionCookie(res, token, expiresAt);
    return session;
  }

  const { sessions } = await getStores();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_WINDOW_MS).toISOString();
  const session = {
    id: `sess-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    userId: String(userId),
    tokenHash: hashSessionToken(token),
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    expiresAt,
  };
  await sessions.insertAsync(session);
  setSessionCookie(res, token, expiresAt);
  return session;
}

async function extendSession(session, token, res) {
  if (hasPostgresStorage()) {
    const pool = getWebPool();
    const expiresAt = new Date(Date.now() + SESSION_WINDOW_MS).toISOString();
    await pool.query(
      'UPDATE app_sessions SET expires_at = $2, last_activity_at = $3 WHERE id = $1',
      [session.id, expiresAt, new Date().toISOString()],
    );
    setSessionCookie(res, token, expiresAt);
    return;
  }

  const { sessions } = await getStores();
  const expiresAt = new Date(Date.now() + SESSION_WINDOW_MS).toISOString();
  await sessions.updateAsync(
    { id: session.id },
    { $set: { expiresAt, lastActivityAt: new Date().toISOString() } },
    {},
  );
  setSessionCookie(res, token, expiresAt);
}

export async function signUpUser(payload) {
  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const username = validateUsername(payload.username);
    const usernameKey = normalizeUsername(username);
    const email = payload.email ? validateGmail(payload.email) : '';
    const emailKey = email || null;
    const password = validatePassword(payload.password);

    const existingUsername = await pool.query('SELECT id FROM app_users WHERE username_key = $1', [usernameKey]);
    if (existingUsername.rows[0]) throw new Error('Username already exists.');
    if (emailKey) {
      const existingEmail = await pool.query('SELECT id FROM app_users WHERE email_key = $1', [emailKey]);
      if (existingEmail.rows[0]) throw new Error('Email already exists.');
    }

    const user = {
      id: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      username,
      usernameKey,
      email,
      emailKey,
      passwordHash: hashPassword(password),
      quote: 'Building better decisions, one signal at a time.',
      avatar: '',
    };

    await pool.query(
      `INSERT INTO app_users (
         id, username, username_key, email, email_key, password_hash, quote, avatar, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [user.id, user.username, user.usernameKey, user.email || null, user.emailKey, user.passwordHash, user.quote, user.avatar],
    );
    return buildClientUser(user);
  }

  const { users } = await getStores();
  const username = validateUsername(payload.username);
  const usernameKey = normalizeUsername(username);
  const email = payload.email ? validateGmail(payload.email) : '';
  const emailKey = email || undefined;
  const password = validatePassword(payload.password);

  const existingUsername = await users.findOneAsync({ usernameKey }).execAsync();
  if (existingUsername) throw new Error('Username already exists.');

  if (emailKey) {
    const existingEmail = await users.findOneAsync({ emailKey }).execAsync();
    if (existingEmail) throw new Error('Email already exists.');
  }

  const user = {
    id: `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    username,
    usernameKey,
    ...(email ? { email, emailKey } : {}),
    passwordHash: hashPassword(password),
    quote: 'Building better decisions, one signal at a time.',
    avatar: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await users.insertAsync(user);
  return buildClientUser(user);
}

export async function loginWithUsernamePassword(payload) {
  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const identifier = String(payload.identifier || '').trim();
    const password = String(payload.password || '');
    if (!identifier) throw new Error('Username is required.');
    if (!password) throw new Error('Password is required.');

    const normalizedIdentifier = normalizeUsername(identifier);
    const normalizedEmail = normalizeEmail(identifier);
    const result = await pool.query(
      'SELECT * FROM app_users WHERE username_key = $1 OR email_key = $2 LIMIT 1',
      [normalizedIdentifier, normalizedEmail],
    );
    const user = mapPgUser(result.rows[0]);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid username or password.');
    }
    return buildClientUser(user);
  }

  const { users } = await getStores();
  const identifier = String(payload.identifier || '').trim();
  const password = String(payload.password || '');
  if (!identifier) throw new Error('Username is required.');
  if (!password) throw new Error('Password is required.');

  const normalizedIdentifier = normalizeUsername(identifier);
  const normalizedEmail = normalizeEmail(identifier);
  const user = await users.findOneAsync({ $or: [{ usernameKey: normalizedIdentifier }, { emailKey: normalizedEmail }] }).execAsync();
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid username or password.');
  }
  return buildClientUser(user);
}

export async function loginWithGmail(payload) {
  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const email = validateGmail(payload.email);
    if (!email) throw new Error('Gmail address is required.');
    const result = await pool.query('SELECT * FROM app_users WHERE email_key = $1 LIMIT 1', [email]);
    const user = mapPgUser(result.rows[0]);
    if (!user) {
      throw new Error('No account found for that Gmail. Sign up first.');
    }
    return buildClientUser(user);
  }

  const { users } = await getStores();
  const email = validateGmail(payload.email);
  if (!email) throw new Error('Gmail address is required.');
  const user = await users.findOneAsync({ emailKey: email }).execAsync();
  if (!user) {
    throw new Error('No account found for that Gmail. Sign up first.');
  }
  return buildClientUser(user);
}

export async function createAuthenticatedSession(userId, res) {
  return createSessionForUser(userId, res);
}

export async function findUserById(userId) {
  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const result = await pool.query('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [String(userId)]);
    const user = mapPgUser(result.rows[0]);
    return user ? buildClientUser(user) : null;
  }

  const { users } = await getStores();
  const user = await users.findOneAsync({ id: String(userId) }).execAsync();
  return user ? buildClientUser(user) : null;
}

export async function getAuthenticatedUser(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const tokenHash = hashSessionToken(token);
    const sessionResult = await pool.query('SELECT * FROM app_sessions WHERE token_hash = $1 LIMIT 1', [tokenHash]);
    const session = sessionResult.rows[0];
    if (!session) {
      clearSessionCookie(res);
      return null;
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await pool.query('DELETE FROM app_sessions WHERE id = $1', [session.id]);
      clearSessionCookie(res);
      return null;
    }

    const userResult = await pool.query('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [String(session.user_id)]);
    const user = mapPgUser(userResult.rows[0]);
    if (!user) {
      await pool.query('DELETE FROM app_sessions WHERE id = $1', [session.id]);
      clearSessionCookie(res);
      return null;
    }

    await extendSession({ id: session.id }, token, res);
    return buildClientUser(user);
  }

  const { users, sessions } = await getStores();
  const tokenHash = hashSessionToken(token);
  const session = await sessions.findOneAsync({ tokenHash }).execAsync();
  if (!session) {
    clearSessionCookie(res);
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await sessions.removeAsync({ id: session.id }, {});
    clearSessionCookie(res);
    return null;
  }

  const user = await users.findOneAsync({ id: String(session.userId) }).execAsync();
  if (!user) {
    await sessions.removeAsync({ id: session.id }, {});
    clearSessionCookie(res);
    return null;
  }

  await extendSession(session, token, res);
  return buildClientUser(user);
}

export async function logoutAuthenticatedUser(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    if (hasPostgresStorage()) {
      const pool = getWebPool();
      await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
    } else {
    const { sessions } = await getStores();
    await sessions.removeAsync({ tokenHash: hashSessionToken(token) }, {});
    }
  }
  clearSessionCookie(res);
}

export async function updateAuthenticatedProfile(userId, payload) {
  if (hasPostgresStorage()) {
    await ensureSeededUser();
    const pool = getWebPool();
    const existingResult = await pool.query('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [String(userId)]);
    const existing = mapPgUser(existingResult.rows[0]);
    if (!existing) throw new Error('User not found.');

    const username = validateUsername(payload.username ?? existing.username);
    const usernameKey = normalizeUsername(username);
    const email = payload.email === undefined
      ? (existing.email || '')
      : (payload.email ? validateGmail(payload.email) : '');
    const emailKey = email || null;

    const usernameOwner = await pool.query('SELECT id FROM app_users WHERE username_key = $1 LIMIT 1', [usernameKey]);
    if (usernameOwner.rows[0] && usernameOwner.rows[0].id !== existing.id) throw new Error('Username already exists.');
    if (emailKey) {
      const emailOwner = await pool.query('SELECT id FROM app_users WHERE email_key = $1 LIMIT 1', [emailKey]);
      if (emailOwner.rows[0] && emailOwner.rows[0].id !== existing.id) throw new Error('Email already exists.');
    }

    const nextUser = {
      ...existing,
      username,
      usernameKey,
      email,
      emailKey,
      quote: String(payload.quote ?? existing.quote ?? '').trim() || 'Building better decisions, one signal at a time.',
      avatar: payload.avatar ?? existing.avatar ?? '',
      updatedAt: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE app_users
       SET username = $2,
           username_key = $3,
           email = $4,
           email_key = $5,
           quote = $6,
           avatar = $7,
           updated_at = $8
       WHERE id = $1`,
      [existing.id, nextUser.username, nextUser.usernameKey, nextUser.email || null, nextUser.emailKey, nextUser.quote, nextUser.avatar, nextUser.updatedAt],
    );
    return buildClientUser(nextUser);
  }

  const { users } = await getStores();
  const existing = await users.findOneAsync({ id: String(userId) }).execAsync();
  if (!existing) throw new Error('User not found.');

  const username = validateUsername(payload.username ?? existing.username);
  const usernameKey = normalizeUsername(username);
  const email = payload.email === undefined
    ? (existing.email || '')
    : (payload.email ? validateGmail(payload.email) : '');
  const emailKey = email || undefined;

  const usernameOwner = await users.findOneAsync({ usernameKey }).execAsync();
  if (usernameOwner && usernameOwner.id !== existing.id) throw new Error('Username already exists.');
  if (emailKey) {
    const emailOwner = await users.findOneAsync({ emailKey }).execAsync();
    if (emailOwner && emailOwner.id !== existing.id) throw new Error('Email already exists.');
  }

  const nextUser = {
    ...existing,
    username,
    usernameKey,
    quote: String(payload.quote ?? existing.quote ?? '').trim() || 'Building better decisions, one signal at a time.',
    avatar: payload.avatar ?? existing.avatar ?? '',
    updatedAt: new Date().toISOString(),
  };

  if (emailKey) {
    nextUser.email = email;
    nextUser.emailKey = emailKey;
  } else {
    delete nextUser.email;
    delete nextUser.emailKey;
  }

  await users.updateAsync({ id: existing.id }, nextUser, {});
  return buildClientUser(nextUser);
}

export { SESSION_COOKIE_NAME, USERS_DB_FILE, SESSIONS_DB_FILE };