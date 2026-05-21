import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://cosmix:s6Q3TnZOp7+tL9vtijqce8O60J%234EPUR@44.193.83.205:5432/cosmix' });

const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log('=== TABLES ===');
tables.rows.forEach(r => console.log(r.tablename));

// Find wellness-related tables and check entry counts per user
for (const { tablename } of tables.rows) {
  if (tablename.includes('wellness') || tablename.includes('entry') || tablename.includes('entries') || tablename.includes('activity')) {
    try {
      const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${tablename}' AND column_name IN ('user_id','userId')`);
      const hasUserId = cols.rows.length > 0;
      if (hasUserId) {
        const col = cols.rows[0].column_name;
        const counts = await pool.query(`SELECT "${col}", count(*)::int as cnt FROM "${tablename}" GROUP BY "${col}" ORDER BY cnt DESC LIMIT 10`);
        console.log(`\n=== ${tablename} (by ${col}) ===`);
        counts.rows.forEach(r => console.log(r[col], ':', r.cnt));
      }
    } catch (e) { /* skip */ }
  }
}

await pool.end();
