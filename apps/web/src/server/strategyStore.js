import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';
import { ensureWebStorage, getWebPool, hasPostgresStorage } from './postgres';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'saved-options-strategies.json');
const DB_FILE = path.join(DATA_DIR, 'saved-options-strategies.db');

let dbPromise = null;
let seededPostgresStrategiesPromise = null;

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

async function seedPostgresStrategiesIfNeeded() {
  if (!hasPostgresStorage()) return;
  if (!seededPostgresStrategiesPromise) {
    seededPostgresStrategiesPromise = (async () => {
      const pool = await ensureWebStorage();
      const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM option_strategies');
      if (countResult.rows[0]?.count > 0) return;
      const legacyStrategies = readLegacyStrategies();
      for (const strategy of legacyStrategies) {
        const now = strategy.updatedAt || strategy.createdAt || new Date().toISOString();
        await pool.query(
          `INSERT INTO option_strategies (id, owner_id, payload, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5)
           ON CONFLICT (id) DO UPDATE
           SET owner_id = EXCLUDED.owner_id,
               payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at`,
          [
            String(strategy.id || `opt-${Date.now()}`),
            String(strategy.ownerId || ''),
            JSON.stringify({ ...strategy, ownerId: String(strategy.ownerId || '') }),
            strategy.createdAt || now,
            now,
          ],
        );
      }
    })();
  }

  await seededPostgresStrategiesPromise;
}

export async function listStrategies(ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
    const result = await pool.query(
      `SELECT payload
       FROM option_strategies
       WHERE owner_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [String(ownerId)],
    );
    return result.rows.map((row) => row.payload);
  }

  const db = await getDb();
  return db.findAsync({ ownerId: String(ownerId) }).sort({ updatedAt: -1, createdAt: -1 }).execAsync();
}

export async function getStrategyById(id, ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
    const result = await pool.query(
      `SELECT payload
       FROM option_strategies
       WHERE id = $1 AND owner_id = $2`,
      [String(id), String(ownerId)],
    );
    return result.rows[0]?.payload || null;
  }

  const db = await getDb();
  return db.findOneAsync({ id: String(id), ownerId: String(ownerId) }).execAsync();
}

export async function upsertStrategy(input, ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
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

    await pool.query(
      `INSERT INTO option_strategies (id, owner_id, payload, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
      [strategy.id, strategy.ownerId, JSON.stringify(strategy), strategy.createdAt, strategy.updatedAt],
    );

    return strategy;
  }

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
  if (hasPostgresStorage()) {
    await ensureWebStorage();
    const pool = getWebPool();
    await pool.query('DELETE FROM option_strategies WHERE id = $1 AND owner_id = $2', [String(id), String(ownerId)]);
    return;
  }

  const db = await getDb();
  await db.removeAsync({ id: String(id), ownerId: String(ownerId) }, {});
}

export async function assignOrphanStrategiesToOwner(ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
    await pool.query(
      `UPDATE option_strategies
       SET owner_id = $1,
           payload = jsonb_set(payload, '{ownerId}', to_jsonb($1::text), true),
           updated_at = NOW()
       WHERE owner_id = ''`,
      [String(ownerId)],
    );
    return;
  }

  const db = await getDb();
  await db.updateAsync(
    { $or: [{ ownerId: { $exists: false } }, { ownerId: null }, { ownerId: '' }] },
    { $set: { ownerId: String(ownerId) } },
    { multi: true },
  );
}

export { DB_FILE, LEGACY_JSON_FILE };