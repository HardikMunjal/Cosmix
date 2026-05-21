-- Check entries for the user with data
SELECT entry_date, status, payload FROM wellness_user_activity_transactions 
WHERE user_id='usr-1776348315064-629418' 
ORDER BY entry_date ASC;

-- Check who this user is in app_users
SELECT id, username, email FROM app_users WHERE id='usr-1776348315064-629418';

-- Check their plans
SELECT plan_id, name, start_date, status FROM wellness_user_plans WHERE user_id='usr-1776348315064-629418';

-- Check their daily scores (source tells us if they had real entries)
SELECT score_date, source, total_score FROM wellness_daily_scores WHERE user_id='usr-1776348315064-629418' ORDER BY score_date;
