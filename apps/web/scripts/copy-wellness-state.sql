INSERT INTO wellness_user_state (user_id, payload, updated_at)
SELECT 'usr-1776348315064-629418', payload, NOW()
FROM wellness_user_state
WHERE user_id = 'usr-hardi'
ON CONFLICT (user_id) DO UPDATE
  SET payload = EXCLUDED.payload, updated_at = NOW();

SELECT user_id, updated_at FROM wellness_user_state;
