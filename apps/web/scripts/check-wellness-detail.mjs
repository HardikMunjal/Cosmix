import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const uid = 'usr-hardi';

// Get all plan_transactions sorted by date
const pt = await pool.query(
  "SELECT transaction_id, plan_id, entry_date, activity_name, source, detail FROM wellness_plan_transactions WHERE user_id = $1 ORDER BY entry_date DESC",
  [uid]
);
console.log('Plan transactions:', JSON.stringify(pt.rows, null, 2));

// Get all daily_scores
const ds = await pool.query(
  "SELECT score_id, plan_id, score_date, total_score, workout_minutes FROM wellness_daily_scores WHERE user_id = $1 ORDER BY score_date DESC LIMIT 30",
  [uid]
);
console.log('\nDaily scores:', JSON.stringify(ds.rows, null, 2));

await pool.end();
