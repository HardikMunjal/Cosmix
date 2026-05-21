import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const uid = 'usr-hardi';

// Full plan transactions - get all dates 
const pt = await pool.query(
  "SELECT DISTINCT entry_date::date as d FROM wellness_plan_transactions WHERE user_id = $1 ORDER BY d DESC",
  [uid]
);
console.log('Distinct plan_transaction dates:', pt.rows.map(r => r.d));

// Check if there's any data in wellness_user_state (check if table exists and has rows)
const tables = await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%wellness%' OR table_schema='public' AND table_name LIKE '%entries%'"
);
console.log('\nWellness-related tables:', tables.rows.map(r => r.table_name));

// Check daily scores date range
const ds = await pool.query(
  "SELECT DISTINCT score_date::date as d FROM wellness_daily_scores WHERE user_id = $1 ORDER BY d DESC",
  [uid]
);
console.log('\nDaily score dates:', ds.rows.map(r => r.d));

await pool.end();
