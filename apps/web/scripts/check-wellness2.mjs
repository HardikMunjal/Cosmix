import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const OLD_ID = 'usr-1776348315064-629418';
const HARDI_ID = 'usr-hardi';

const [plans, actsOld, actsHardi] = await Promise.all([
  pool.query(`SELECT id, name, status, start_date FROM wellness_user_plans WHERE user_id=$1`, [OLD_ID]),
  pool.query(`SELECT plan_id, activity_date, activity_type FROM wellness_user_activity_transactions WHERE user_id=$1 ORDER BY activity_date DESC LIMIT 10`, [OLD_ID]),
  pool.query(`SELECT plan_id, activity_date, activity_type FROM wellness_user_activity_transactions WHERE user_id=$1 ORDER BY activity_date DESC LIMIT 5`, [HARDI_ID]),
]);

console.log(`\nPlans under ${OLD_ID}:`);
plans.rows.forEach(r => console.log(' ', r.id, '|', r.name, '|', r.status, '|', r.start_date));

console.log(`\nActivities under ${OLD_ID} (last 10):`);
actsOld.rows.forEach(r => console.log(' ', String(r.activity_date).slice(0,10), r.activity_type, r.plan_id?.slice(0,24)));

console.log(`\nActivities under ${HARDI_ID}: ${actsHardi.rows.length}`);

await pool.end();
