-- Check column names
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='wellness_user_activity_transactions' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='wellness_plan_transactions' ORDER BY ordinal_position;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='wellness_user_state' ORDER BY ordinal_position;
