import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const OLD_ID = 'usr-1776348315064-629418';
const HARDI_ID = 'usr-hardi';

// Check column names first
const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='wellness_user_activity_transactions' ORDER BY ordinal_position`);
console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));

const plans = await pool.query(`SELECT id, name, status, start_date FROM wellness_user_plans WHERE user_id=$1`, [OLD_ID]);
console.log(`\nPlans under ${OLD_ID}:`);
plans.rows.forEach(r => console.log(' ', r.id, '|', r.name, '|', r.status));

const actsOld = await pool.query(`SELECT * FROM wellness_user_activity_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`, [OLD_ID]);
console.log(`\nActivities under ${OLD_ID} (last 5):`);
actsOld.rows.forEach(r => console.log(' ', JSON.stringify(r).slice(0, 120)));

await pool.end();
