import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';
import { normalizePhoneE164 } from '../lib/buddySafetyLinks';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'buddy-safety-profiles.db');

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

function sanitizePlace(place) {
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
    return null;
  }
  return {
    lat: Number(place.lat),
    lng: Number(place.lng),
    label: String(place.label || '').trim() || 'Saved place',
  };
}

function sanitizeProfile(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

const DEFAULT_PROFILE = {
  home: null,
  work: null,
  phone: '',
  notifySms: true,
  notifyWhatsApp: true,
  preferCurrentLocation: true,
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
    ...existing,
    userId: String(userId),
    home: payload.home !== undefined ? sanitizePlace(payload.home) : existing.home,
    work: payload.work !== undefined ? sanitizePlace(payload.work) : existing.work,
    phone: payload.phone !== undefined ? normalizePhoneE164(payload.phone) : existing.phone,
    notifySms: payload.notifySms !== undefined ? Boolean(payload.notifySms) : existing.notifySms,
    notifyWhatsApp: payload.notifyWhatsApp !== undefined ? Boolean(payload.notifyWhatsApp) : existing.notifyWhatsApp,
    preferCurrentLocation: payload.preferCurrentLocation !== undefined
      ? Boolean(payload.preferCurrentLocation)
      : existing.preferCurrentLocation !== false,
    updatedAt: Date.now(),
  };
  await db.updateAsync({ userId: String(userId) }, next, { upsert: true });
  return sanitizeProfile(next);
}

export async function getSafetyProfileByUserId(userId) {
  return getSafetyProfile(userId);
}
