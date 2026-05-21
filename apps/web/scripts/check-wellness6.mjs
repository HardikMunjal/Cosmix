import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

// Check wellness_user_state for both user IDs
const state = await pool.query(`SELECT user_id, updated_at, (payload->'entries') AS entries_count_raw FROM wellness_user_state ORDER BY user_id`);
console.log('wellness_user_state rows:');
for (const r of state.rows) {
  const entries = r.entries_count_raw;
  const count = Array.isArray(entries) ? entries.length : (entries ? JSON.parse(entries)?.length : 0);
  console.log(' user_id:', r.user_id, '| entries:', count, '| updated:', r.updated_at);
}

// Get Hardi's state entries sample
const hardi = await pool.query(`SELECT payload FROM wellness_user_state WHERE user_id='usr-hardi'`);
if (hardi.rows[0]) {
  const p = hardi.rows[0].payload;
  console.log('\nHardi state keys:', Object.keys(p));
  console.log('entries count:', p.entries?.length ?? 0);
  if (p.entries?.length) {
    console.log('first entry:', JSON.stringify(p.entries[0]).slice(0, 200));
    console.log('last entry:', JSON.stringify(p.entries[p.entries.length - 1]).slice(0, 200));
  }
  console.log('plans count:', p.plans?.length ?? 0);
}

await pool.end();
