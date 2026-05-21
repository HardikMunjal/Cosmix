SELECT id, username, name, email
FROM app_users
WHERE lower(username) IN ('hardi', 'laks') OR lower(email) = 'hardik.munjaal@gmail.com'
ORDER BY username;

SELECT user_id,
       COALESCE(jsonb_array_length(payload->'entries'), 0) AS state_entries,
       COALESCE(jsonb_array_length(payload->'plans'), 0) AS state_plans,
       payload->'plans' AS state_plan_payload
FROM wellness_user_state
WHERE user_id IN ('usr-hardi', 'usr-1776348315064-629418');

SELECT user_id, plan_id, plan_name, status, start_date, started_at, updated_at
FROM wellness_user_plans
WHERE user_id IN ('usr-hardi', 'usr-1776348315064-629418')
ORDER BY user_id, updated_at DESC;

SELECT user_id, COUNT(*) AS txn_count,
       MIN(entry_date) AS min_date,
       MAX(entry_date) AS max_date,
       MAX(payload->>'planId') AS sample_plan_id
FROM wellness_user_activity_transactions
WHERE user_id IN ('usr-hardi', 'usr-1776348315064-629418')
GROUP BY user_id
ORDER BY user_id;
