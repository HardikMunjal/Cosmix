SELECT user_id,
       payload->'plans'->0->>'name' AS first_plan_name,
       COALESCE(jsonb_array_length(payload->'entries'), 0) AS entry_count,
       payload->'entries'->0->>'date' AS latest_entry_date
FROM wellness_user_state
WHERE user_id = 'usr-1776348315064-629418';
