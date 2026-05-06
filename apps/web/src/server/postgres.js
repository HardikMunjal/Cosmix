import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';

let pool = null;
let schemaPromise = null;

export function hasPostgresStorage() {
  return Boolean(DATABASE_URL);
}

export function getWebPool() {
  if (!hasPostgresStorage()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
    });
  }
  return pool;
}

export async function ensureWebStorage() {
  if (!hasPostgresStorage()) return null;
  if (!schemaPromise) {
    const activePool = getWebPool();
    schemaPromise = activePool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        email TEXT,
        email_key TEXT UNIQUE,
        password_hash TEXT,
        quote TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';

      CREATE INDEX IF NOT EXISTS idx_app_users_name ON app_users(name);

      CREATE TABLE IF NOT EXISTS app_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS option_strategies (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL DEFAULT '',
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_option_strategies_owner_id ON option_strategies(owner_id);
      CREATE INDEX IF NOT EXISTS idx_option_strategies_updated_at ON option_strategies(updated_at DESC);

      CREATE TABLE IF NOT EXISTS option_strategy_headers (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'watching',
        selected_expiry BIGINT,
        expiry_label TEXT,
        lot_size INTEGER,
        saved_at_spot DOUBLE PRECISION,
        pricing_source TEXT,
        live_source TEXT,
        entry_at TIMESTAMPTZ,
        learning TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_option_strategy_headers_owner_updated
        ON option_strategy_headers(owner_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS option_strategy_payloads (
        strategy_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_option_strategy_payloads_owner_updated
        ON option_strategy_payloads(owner_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS option_strategy_legs (
        strategy_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        leg_id BIGINT NOT NULL,
        side TEXT NOT NULL,
        option_type TEXT NOT NULL,
        strike DOUBLE PRECISION NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        premium DOUBLE PRECISION NOT NULL DEFAULT 0,
        market_premium DOUBLE PRECISION,
        locked BOOLEAN NOT NULL DEFAULT FALSE,
        expiry BIGINT,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (strategy_id, leg_id)
      );

      CREATE INDEX IF NOT EXISTS idx_option_strategy_legs_owner_strategy
        ON option_strategy_legs(owner_id, strategy_id);

      CREATE TABLE IF NOT EXISTS option_strategy_closed_legs (
        strategy_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        sequence_no BIGINT NOT NULL,
        leg_id BIGINT,
        closed_at TIMESTAMPTZ,
        pnl DOUBLE PRECISION,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (strategy_id, sequence_no)
      );

      CREATE INDEX IF NOT EXISTS idx_option_strategy_closed_legs_owner_strategy
        ON option_strategy_closed_legs(owner_id, strategy_id);

      CREATE TABLE IF NOT EXISTS option_strategy_transactions (
        strategy_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        sequence_no BIGINT NOT NULL,
        tx_type TEXT,
        amount DOUBLE PRECISION,
        tx_timestamp TIMESTAMPTZ,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (strategy_id, sequence_no)
      );

      CREATE INDEX IF NOT EXISTS idx_option_strategy_transactions_owner_strategy
        ON option_strategy_transactions(owner_id, strategy_id);
    `);
  }

  await schemaPromise;
  return getWebPool();
}