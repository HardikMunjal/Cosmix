-- Any entries at all in activity_transactions?
SELECT user_id, COUNT(*) FROM wellness_user_activity_transactions GROUP BY user_id;

-- Any data in daily_scores dead tuples (might tell us history)
-- Look at dead tuple dates in daily_scores
SELECT score_date, source, physical_score, mental_score, total_score
FROM wellness_daily_scores 
WHERE user_id='usr-hardi' 
ORDER BY score_date;

-- Check what was wiped (plan_transactions has been autovacuumed but daily_scores still has dead tuples)
-- Try to see the payload of daily_scores for usr-hardi
SELECT score_date, payload FROM wellness_daily_scores WHERE user_id='usr-hardi' ORDER BY score_date LIMIT 10;

-- Who has data in user_activity_transactions?
SELECT DISTINCT user_id FROM wellness_user_activity_transactions;
