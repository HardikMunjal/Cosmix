import fs from 'fs';
import path from 'path';
import Datastore from '@seald-io/nedb';
import { ensureWebStorage, getWebPool, hasPostgresStorage } from './postgres';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'saved-options-strategies.json');
const DB_FILE = path.join(DATA_DIR, 'saved-options-strategies.db');

let dbPromise = null;
let seededPostgresStrategiesPromise = null;
let lastSeedRunAt = 0;
const SEED_DEBOUNCE_MS = 30 * 1000; // re-run incremental sync at most every 30s

const DEFAULT_STATUS = 'watching';

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
  const now = Date.now();
  if (seededPostgresStrategiesPromise && now - lastSeedRunAt < SEED_DEBOUNCE_MS) {
    return seededPostgresStrategiesPromise;
  }
  lastSeedRunAt = now;
  seededPostgresStrategiesPromise = (async () => {
      const pool = await ensureWebStorage();

      // Seed from local JSON file into option_strategies if that table is empty
      const legacyTableResult = await pool.query(
        `SELECT id, owner_id, payload, created_at, updated_at
         FROM option_strategies
         ORDER BY updated_at DESC, created_at DESC`,
      );

      if (!legacyTableResult.rows.length) {
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
      }

      // Incrementally sync rows that are missing from or stale in option_strategy_headers.
      // This handles strategies written/updated by older production code that only touches option_strategies.
      const unmigrated = await pool.query(
        `SELECT os.id, os.owner_id, os.payload, os.created_at, os.updated_at
         FROM option_strategies os
         LEFT JOIN option_strategy_headers h ON h.id = os.id
         WHERE h.id IS NULL
            OR os.updated_at > h.updated_at
         ORDER BY os.updated_at DESC, os.created_at DESC`,
      );

      for (const row of unmigrated.rows) {
        const payload = row.payload || {};
        const ownerId = String(payload.ownerId || row.owner_id || '');
        const strategy = {
          ...payload,
          id: String(payload.id || row.id),
          ownerId,
          createdAt: payload.createdAt || row.created_at,
          updatedAt: payload.updatedAt || row.updated_at,
        };
        await upsertNormalizedStrategy(pool, strategy, ownerId);
      }
  })();

  await seededPostgresStrategiesPromise;
}

function normalizeStrategyInput(input, existing, ownerId) {
  const now = new Date().toISOString();
  return {
    ...existing,
    ...input,
    ownerId: String(ownerId),
    id: input.id || existing?.id || `opt-${Date.now()}`,
    name: input.name || existing?.name || 'Strategy',
    status: input.status || existing?.status || DEFAULT_STATUS,
    legs: Array.isArray(input.legs) ? input.legs : (existing?.legs || []),
    closedLegs: Array.isArray(input.closedLegs) ? input.closedLegs : (existing?.closedLegs || []),
    transactions: Array.isArray(input.transactions) ? input.transactions : (existing?.transactions || []),
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now,
  };
}

function normalizeLeg(leg, sequenceNo) {
  return {
    ...leg,
    id: Number(leg?.id ?? sequenceNo),
    side: String(leg?.side || ''),
    optionType: String(leg?.optionType || ''),
    strike: Number(leg?.strike || 0),
    quantity: Math.max(1, parseInt(leg?.quantity || 1, 10) || 1),
    premium: Number(leg?.premium || 0),
    marketPremium: leg?.marketPremium == null ? null : Number(leg.marketPremium),
    locked: Boolean(leg?.locked),
    expiry: leg?.expiry == null ? null : Number(leg.expiry),
  };
}

function normalizeClosedLeg(leg, sequenceNo) {
  return {
    ...leg,
    legId: leg?.legId == null ? null : Number(leg.legId),
    quantity: Math.max(1, parseInt(leg?.quantity || 1, 10) || 1),
    entryPremium: Number(leg?.entryPremium || 0),
    exitPremium: Number(leg?.exitPremium || 0),
    pnl: Number(leg?.pnl || 0),
    closedAt: leg?.closedAt || null,
    sequenceNo,
  };
}

function normalizeTransaction(tx, sequenceNo) {
  return {
    ...tx,
    type: tx?.type ? String(tx.type) : null,
    amount: tx?.amount == null ? null : Number(tx.amount),
    timestamp: tx?.timestamp || null,
    sequenceNo,
  };
}

function toHeaderRecord(strategy, ownerId) {
  return {
    id: String(strategy.id),
    ownerId: String(ownerId),
    name: String(strategy.name || 'Strategy'),
    status: String(strategy.status || DEFAULT_STATUS),
    selectedExpiry: strategy.selectedExpiry == null ? null : Number(strategy.selectedExpiry),
    expiryLabel: strategy.expiryLabel || null,
    lotSize: strategy.lotSize == null ? null : Number(strategy.lotSize),
    savedAtSpot: strategy.savedAtSpot == null ? null : Number(strategy.savedAtSpot),
    pricingSource: strategy.pricingSource || null,
    liveSource: strategy.liveSource || null,
    entryAt: strategy.entryAt || null,
    learning: strategy.learning || null,
    createdAt: strategy.createdAt,
    updatedAt: strategy.updatedAt,
  };
}

async function upsertNormalizedStrategy(client, strategy, ownerId) {
  const normalized = normalizeStrategyInput(strategy, null, ownerId);
  const header = toHeaderRecord(normalized, ownerId);
  const legs = (normalized.legs || []).map((leg, index) => normalizeLeg(leg, index + 1));
  const closedLegs = (normalized.closedLegs || []).map((leg, index) => normalizeClosedLeg(leg, index + 1));
  const transactions = (normalized.transactions || []).map((tx, index) => normalizeTransaction(tx, index + 1));

  await client.query(
    `INSERT INTO option_strategy_headers (
       id, owner_id, name, status, selected_expiry, expiry_label, lot_size,
       saved_at_spot, pricing_source, live_source, entry_at, learning,
       created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE
     SET owner_id = EXCLUDED.owner_id,
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         selected_expiry = EXCLUDED.selected_expiry,
         expiry_label = EXCLUDED.expiry_label,
         lot_size = EXCLUDED.lot_size,
         saved_at_spot = EXCLUDED.saved_at_spot,
         pricing_source = EXCLUDED.pricing_source,
         live_source = EXCLUDED.live_source,
         entry_at = EXCLUDED.entry_at,
         learning = EXCLUDED.learning,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
    [
      header.id,
      header.ownerId,
      header.name,
      header.status,
      header.selectedExpiry,
      header.expiryLabel,
      header.lotSize,
      header.savedAtSpot,
      header.pricingSource,
      header.liveSource,
      header.entryAt,
      header.learning,
      header.createdAt,
      header.updatedAt,
    ],
  );

  await client.query(
    `INSERT INTO option_strategy_payloads (strategy_id, owner_id, payload, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (strategy_id) DO UPDATE
     SET owner_id = EXCLUDED.owner_id,
         payload = EXCLUDED.payload,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
    [header.id, header.ownerId, JSON.stringify(normalized), header.createdAt, header.updatedAt],
  );

  await client.query('DELETE FROM option_strategy_legs WHERE strategy_id = $1 AND owner_id = $2', [header.id, header.ownerId]);
  for (const leg of legs) {
    await client.query(
      `INSERT INTO option_strategy_legs (
         strategy_id, owner_id, leg_id, side, option_type, strike, quantity,
         premium, market_premium, locked, expiry, payload, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)`,
      [
        header.id,
        header.ownerId,
        leg.id,
        leg.side,
        leg.optionType,
        leg.strike,
        leg.quantity,
        leg.premium,
        leg.marketPremium,
        leg.locked,
        leg.expiry,
        JSON.stringify(leg),
        header.createdAt,
        header.updatedAt,
      ],
    );
  }

  await client.query('DELETE FROM option_strategy_closed_legs WHERE strategy_id = $1 AND owner_id = $2', [header.id, header.ownerId]);
  for (const leg of closedLegs) {
    await client.query(
      `INSERT INTO option_strategy_closed_legs (
         strategy_id, owner_id, sequence_no, leg_id, closed_at, pnl, payload, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        header.id,
        header.ownerId,
        leg.sequenceNo,
        leg.legId,
        leg.closedAt,
        leg.pnl,
        JSON.stringify(leg),
        header.createdAt,
        header.updatedAt,
      ],
    );
  }

  await client.query('DELETE FROM option_strategy_transactions WHERE strategy_id = $1 AND owner_id = $2', [header.id, header.ownerId]);
  for (const tx of transactions) {
    await client.query(
      `INSERT INTO option_strategy_transactions (
         strategy_id, owner_id, sequence_no, tx_type, amount, tx_timestamp, payload, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        header.id,
        header.ownerId,
        tx.sequenceNo,
        tx.type,
        tx.amount,
        tx.timestamp,
        JSON.stringify(tx),
        header.createdAt,
        header.updatedAt,
      ],
    );
  }
}

function mergeNormalizedStrategyRows(headers = [], legsRows = [], closedRows = [], txRows = []) {
  const legsByStrategy = new Map();
  const closedByStrategy = new Map();
  const txByStrategy = new Map();

  for (const row of legsRows) {
    const list = legsByStrategy.get(row.strategy_id) || [];
    list.push(row.payload || {});
    legsByStrategy.set(row.strategy_id, list);
  }
  for (const row of closedRows) {
    const list = closedByStrategy.get(row.strategy_id) || [];
    list.push(row.payload || {});
    closedByStrategy.set(row.strategy_id, list);
  }
  for (const row of txRows) {
    const list = txByStrategy.get(row.strategy_id) || [];
    list.push(row.payload || {});
    txByStrategy.set(row.strategy_id, list);
  }

  return headers.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    status: row.status || DEFAULT_STATUS,
    selectedExpiry: row.selected_expiry,
    expiryLabel: row.expiry_label,
    lotSize: row.lot_size,
    savedAtSpot: row.saved_at_spot,
    pricingSource: row.pricing_source,
    liveSource: row.live_source,
    entryAt: row.entry_at,
    learning: row.learning || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    legs: legsByStrategy.get(row.id) || [],
    closedLegs: closedByStrategy.get(row.id) || [],
    transactions: txByStrategy.get(row.id) || [],
  }));
}

export async function listStrategies(ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
    const ownerKey = String(ownerId);
    const headerResult = await pool.query(
      `SELECT *
       FROM option_strategy_headers
       WHERE owner_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [ownerKey],
    );
    if (!headerResult.rows.length) return [];

    const strategyIds = headerResult.rows.map((row) => row.id);
    const [legsResult, closedResult, txResult] = await Promise.all([
      pool.query(
        `SELECT strategy_id, payload
         FROM option_strategy_legs
         WHERE owner_id = $1 AND strategy_id = ANY($2::text[])
         ORDER BY strategy_id, leg_id`,
        [ownerKey, strategyIds],
      ),
      pool.query(
        `SELECT strategy_id, payload
         FROM option_strategy_closed_legs
         WHERE owner_id = $1 AND strategy_id = ANY($2::text[])
         ORDER BY strategy_id, sequence_no`,
        [ownerKey, strategyIds],
      ),
      pool.query(
        `SELECT strategy_id, payload
         FROM option_strategy_transactions
         WHERE owner_id = $1 AND strategy_id = ANY($2::text[])
         ORDER BY strategy_id, sequence_no`,
        [ownerKey, strategyIds],
      ),
    ]);

    return mergeNormalizedStrategyRows(
      headerResult.rows,
      legsResult.rows,
      closedResult.rows,
      txResult.rows,
    );
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
       FROM option_strategy_payloads
       WHERE strategy_id = $1 AND owner_id = $2`,
      [String(id), String(ownerId)],
    );
    if (result.rows[0]?.payload) {
      return result.rows[0].payload;
    }

    const list = await listStrategies(ownerId);
    return list.find((strategy) => String(strategy.id) === String(id)) || null;
  }

  const db = await getDb();
  return db.findOneAsync({ id: String(id), ownerId: String(ownerId) }).execAsync();
}

export async function upsertStrategy(input, ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
    const existing = input?.id ? await getStrategyById(input.id, ownerId) : null;
    const strategy = normalizeStrategyInput(input, existing, ownerId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO option_strategies (id, owner_id, payload, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET owner_id = EXCLUDED.owner_id,
             payload = EXCLUDED.payload,
             updated_at = EXCLUDED.updated_at`,
        [strategy.id, strategy.ownerId, JSON.stringify(strategy), strategy.createdAt, strategy.updatedAt],
      );
      await upsertNormalizedStrategy(client, strategy, strategy.ownerId);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

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
    const strategyId = String(id);
    const ownerKey = String(ownerId);
    await pool.query('DELETE FROM option_strategy_legs WHERE strategy_id = $1 AND owner_id = $2', [strategyId, ownerKey]);
    await pool.query('DELETE FROM option_strategy_closed_legs WHERE strategy_id = $1 AND owner_id = $2', [strategyId, ownerKey]);
    await pool.query('DELETE FROM option_strategy_transactions WHERE strategy_id = $1 AND owner_id = $2', [strategyId, ownerKey]);
    await pool.query('DELETE FROM option_strategy_payloads WHERE strategy_id = $1 AND owner_id = $2', [strategyId, ownerKey]);
    await pool.query('DELETE FROM option_strategy_headers WHERE id = $1 AND owner_id = $2', [strategyId, ownerKey]);
    await pool.query('DELETE FROM option_strategies WHERE id = $1 AND owner_id = $2', [strategyId, ownerKey]);
    return;
  }

  const db = await getDb();
  await db.removeAsync({ id: String(id), ownerId: String(ownerId) }, {});
}

export async function assignOrphanStrategiesToOwner(ownerId) {
  if (hasPostgresStorage()) {
    await seedPostgresStrategiesIfNeeded();
    const pool = getWebPool();
    const ownerKey = String(ownerId);
    await pool.query(
      `UPDATE option_strategies
       SET owner_id = $1,
           payload = jsonb_set(payload, '{ownerId}', to_jsonb($1::text), true),
           updated_at = NOW()
       WHERE owner_id = ''`,
      [ownerKey],
    );
    await pool.query('UPDATE option_strategy_headers SET owner_id = $1 WHERE owner_id = $2', [ownerKey, '']);
    await pool.query('UPDATE option_strategy_payloads SET owner_id = $1 WHERE owner_id = $2', [ownerKey, '']);
    await pool.query('UPDATE option_strategy_legs SET owner_id = $1 WHERE owner_id = $2', [ownerKey, '']);
    await pool.query('UPDATE option_strategy_closed_legs SET owner_id = $1 WHERE owner_id = $2', [ownerKey, '']);
    await pool.query('UPDATE option_strategy_transactions SET owner_id = $1 WHERE owner_id = $2', [ownerKey, '']);
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