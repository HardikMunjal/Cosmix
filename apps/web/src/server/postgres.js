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
        email TEXT,
        email_key TEXT UNIQUE,
        password_hash TEXT,
        quote TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

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
    `);
  }

  await schemaPromise;
  return getWebPool();
}