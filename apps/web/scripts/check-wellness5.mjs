import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const HARDI_ID = 'usr-hardi';

// Hardi's plans
const plans = await pool.query(`SELECT plan_id, name, status, start_date FROM wellness_user_plans WHERE user_id=$1`, [HARDI_ID]);
console.log('Hardi plans:');
plans.rows.forEach(r => console.log(' ', r.plan_id, '|', r.name, '|', r.status));

// Hardi's plan transactions (daily entries)
const ptCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='wellness_plan_transactions' ORDER BY ordinal_position`);
console.log('\nPlan transaction columns:', ptCols.rows.map(r => r.column_name).join(', '));

const pt = await pool.query(`SELECT * FROM wellness_plan_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`, [HARDI_ID]);
console.log(`\nPlan transactions for ${HARDI_ID} (last 5):`);
pt.rows.forEach(r => console.log(' ', JSON.stringify(r).slice(0, 160)));

// Check daily_scores
const dsCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='wellness_daily_scores' ORDER BY ordinal_position`);
console.log('\nDaily score columns:', dsCols.rows.map(r => r.column_name).join(', '));

const ds = await pool.query(`SELECT * FROM wellness_daily_scores WHERE user_id=$1 ORDER BY score_date DESC LIMIT 5`, [HARDI_ID]);
console.log(`\nDaily scores for ${HARDI_ID} (last 5):`);
ds.rows.forEach(r => console.log(' ', JSON.stringify(r).slice(0, 160)));

await pool.end();
