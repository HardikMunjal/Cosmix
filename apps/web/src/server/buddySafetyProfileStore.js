import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';
import { normalizePhoneE164 } from '../lib/buddySafetyLinks';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'buddy-safety-profiles.db');
const MAX_DESTINATIONS = 12;

let dbPromise = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function initDb() {
  ensureDataDir();
  const db = new Datastore({
    filename: DB_FILE,
    autoload: true,
    timestampData: false,
  });
  if (db.autoloadPromise) await db.autoloadPromise;
  await db.ensureIndexAsync({ fieldName: 'userId', unique: true });
  return db;
}

async function getDb() {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

function sanitizeDestination(place) {
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
    return null;
  }
  const label = String(place.label || '').trim() || 'Saved destination';
  return {
    id: String(place.id || `dest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    lat: Number(place.lat),
    lng: Number(place.lng),
    label,
    name: String(place.name || label.split(',')[0] || 'Saved destination').trim().slice(0, 60),
  };
}

function sanitizeDestinations(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const next = [];
  for (const item of list) {
    const dest = sanitizeDestination(item);
    if (!dest) continue;
    const key = `${dest.lat.toFixed(5)}:${dest.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(dest);
    if (next.length >= MAX_DESTINATIONS) break;
  }
  return next;
}

function migrateLegacyDestinations(row = {}) {
  const existing = sanitizeDestinations(row.destinations);
  if (existing.length) return existing;

  const legacy = [];
  if (row.home) {
    legacy.push(sanitizeDestination({
      ...row.home,
      id: `legacy-home-${row.userId || 'user'}`,
      name: row.home.label?.split(',')[0] || 'Saved destination',
    }));
  }
  if (row.work) {
    legacy.push(sanitizeDestination({
      ...row.work,
      id: `legacy-work-${row.userId || 'user'}`,
      name: row.work.label?.split(',')[0] || 'Saved destination',
    }));
  }
  return sanitizeDestinations(legacy);
}

function sanitizeProfile(doc) {
  if (!doc) return null;
  const { _id, home, work, preferCurrentLocation, ...rest } = doc;
  return {
    ...rest,
    destinations: migrateLegacyDestinations(doc),
  };
}

const DEFAULT_PROFILE = {
  destinations: [],
  phone: '',
  notifySms: true,
  notifyWhatsApp: true,
};

export async function getSafetyProfile(userId) {
  const db = await getDb();
  const row = await db.findOneAsync({ userId: String(userId) }).execAsync();
  if (!row) return { userId: String(userId), ...DEFAULT_PROFILE };
  return sanitizeProfile(row);
}

export async function saveSafetyProfile(userId, payload = {}) {
  const db = await getDb();
  const existing = await getSafetyProfile(userId);
  const next = {
    userId: String(userId),
    destinations: payload.destinations !== undefined
      ? sanitizeDestinations(payload.destinations)
      : existing.destinations,
    phone: payload.phone !== undefined ? normalizePhoneE164(payload.phone) : existing.phone,
    notifySms: payload.notifySms !== undefined ? Boolean(payload.notifySms) : existing.notifySms,
    notifyWhatsApp: payload.notifyWhatsApp !== undefined ? Boolean(payload.notifyWhatsApp) : existing.notifyWhatsApp,
    updatedAt: Date.now(),
  };
  await db.updateAsync({ userId: String(userId) }, next, { upsert: true });
  return sanitizeProfile(next);
}

export async function getSafetyProfileByUserId(userId) {
  return getSafetyProfile(userId);
}
