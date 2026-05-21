import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });
const r = await pool.query("SELECT plan_id, name, start_date, started_at, status FROM wellness_user_plans WHERE user_id = 'usr-hardi' ORDER BY start_date DESC");
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
