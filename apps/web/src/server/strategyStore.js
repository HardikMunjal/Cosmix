import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'saved-options-strategies.json');
const DB_FILE = path.join(DATA_DIR, 'saved-options-strategies.db');

let dbPromise = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readLegacyStrategies() {
  if (!fs.existsSync(LEGACY_JSON_FILE)) return [];
  const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  return Array.isArray(parsed) ? parsed : [];
}

async function initDb() {
  ensureDataDir();

  const db = new Datastore({
    filename: DB_FILE,
    autoload: true,
    timestampData: false,
  });

  if (db.autoloadPromise) {
    await db.autoloadPromise;
  }

  await db.ensureIndexAsync({ fieldName: 'ownerId' });
  await db.ensureIndexAsync({ fieldName: 'id', unique: true });

  const existingCount = await db.countAsync({}).execAsync();
  if (existingCount === 0) {
    const legacyStrategies = readLegacyStrategies();
    if (legacyStrategies.length) {
      await db.insertAsync(legacyStrategies);
    }
  }

  return db;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

export async function listStrategies(ownerId) {
  const db = await getDb();
  return db.findAsync({ ownerId: String(ownerId) }).sort({ updatedAt: -1, createdAt: -1 }).execAsync();
}

export async function getStrategyById(id, ownerId) {
  const db = await getDb();
  return db.findOneAsync({ id: String(id), ownerId: String(ownerId) }).execAsync();
}

export async function upsertStrategy(input, ownerId) {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = input?.id ? await getStrategyById(input.id, ownerId) : null;

  const strategy = {
    ...existing,
    ...input,
    ownerId: String(ownerId),
    id: input.id || existing?.id || `opt-${Date.now()}`,
    name: input.name || existing?.name || 'Strategy',
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now,
  };

  await db.updateAsync(
    { id: String(strategy.id) },
    strategy,
    { upsert: true },
  );

  return strategy;
}

export async function deleteStrategyById(id, ownerId) {
  const db = await getDb();
  await db.removeAsync({ id: String(id), ownerId: String(ownerId) }, {});
}

export async function assignOrphanStrategiesToOwner(ownerId) {
  const db = await getDb();
  await db.updateAsync(
    { $or: [{ ownerId: { $exists: false } }, { ownerId: null }, { ownerId: '' }] },
    { $set: { ownerId: String(ownerId) } },
    { multi: true },
  );
}

export { DB_FILE, LEGACY_JSON_FILE };