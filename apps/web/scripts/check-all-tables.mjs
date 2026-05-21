import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

// Full state check
const tables = await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
);
console.log('All tables:', tables.rows.map(r => r.table_name));

// Check wellness_user_activity_transactions for usr-hardi with dates
const act = await pool.query(
  "SELECT transaction_id, entry_date, status, payload FROM wellness_user_activity_transactions WHERE user_id = 'usr-hardi' ORDER BY entry_date DESC LIMIT 20"
);
console.log('\nActivity transactions:', JSON.stringify(act.rows, null, 2));

await pool.end();
