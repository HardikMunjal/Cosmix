import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const uid = 'usr-hardi';

const [act, plans, pt, ds, state] = await Promise.all([
  pool.query("SELECT count(*) FROM wellness_user_activity_transactions WHERE user_id = $1", [uid]),
  pool.query("SELECT plan_id, name, start_date, status FROM wellness_user_plans WHERE user_id = $1 ORDER BY start_date DESC", [uid]),
  pool.query("SELECT count(*) FROM wellness_plan_transactions WHERE user_id = $1", [uid]),
  pool.query("SELECT count(*) FROM wellness_daily_scores WHERE user_id = $1", [uid]),
  pool.query("SELECT to_regclass('public.wellness_user_state') AS exists"),
]);

console.log('activity_transactions rows:', act.rows[0].count);
console.log('plans:', JSON.stringify(plans.rows, null, 2));
console.log('plan_transactions rows:', pt.rows[0].count);
console.log('daily_scores rows:', ds.rows[0].count);
console.log('wellness_user_state exists:', state.rows[0].exists);

// Get sample activity transactions
const sample = await pool.query(
  "SELECT transaction_id, plan_id, entry_date, status, payload FROM wellness_user_activity_transactions WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 5",
  [uid]
);
console.log('\nSample activity transactions:', JSON.stringify(sample.rows, null, 2));

// Check wellness_user_state if it exists
if (state.rows[0].exists) {
  const stateData = await pool.query("SELECT user_id, updated_at FROM wellness_user_state WHERE user_id = $1", [uid]);
  console.log('\nwellness_user_state rows:', stateData.rows);
}

await pool.end();
