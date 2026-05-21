-- When were these auto-generated rows inserted?
SELECT MIN(created_at), MAX(created_at) FROM wellness_plan_transactions WHERE user_id='usr-hardi';

-- Check ALL tables in the database
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;

-- Check dead tuples (unvacuumed deleted rows)
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum, last_autoanalyze 
FROM pg_stat_user_tables 
WHERE relname LIKE 'wellness%';
