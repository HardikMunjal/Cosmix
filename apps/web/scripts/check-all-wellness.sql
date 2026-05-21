SELECT 'activity_transactions' as tbl, COUNT(*) as cnt FROM wellness_user_activity_transactions WHERE user_id='usr-hardi'
UNION ALL SELECT 'plan_transactions', COUNT(*) FROM wellness_plan_transactions WHERE user_id='usr-hardi'
UNION ALL SELECT 'daily_scores', COUNT(*) FROM wellness_daily_scores WHERE user_id='usr-hardi'
UNION ALL SELECT 'user_state', COUNT(*) FROM wellness_user_state WHERE user_id='usr-hardi';

SELECT activity_name, date, detail FROM wellness_user_activity_transactions WHERE user_id='usr-hardi' ORDER BY date DESC LIMIT 20;

SELECT state_json::text FROM wellness_user_state WHERE user_id='usr-hardi';
