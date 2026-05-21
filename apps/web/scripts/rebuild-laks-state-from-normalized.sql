WITH entry_rows AS (
  SELECT payload, entry_date, updated_at
  FROM wellness_user_activity_transactions
  WHERE user_id = 'usr-1776348315064-629418'
),
plan_rows AS (
  SELECT payload, start_date, updated_at
  FROM wellness_user_plans
  WHERE user_id = 'usr-1776348315064-629418'
),
rebuilt AS (
  SELECT jsonb_build_object(
    'entries', COALESCE((SELECT jsonb_agg(payload ORDER BY entry_date DESC, updated_at DESC) FROM entry_rows), '[]'::jsonb),
    'form', (SELECT payload FROM entry_rows ORDER BY entry_date DESC, updated_at DESC LIMIT 1),
    'plans', COALESCE((SELECT jsonb_agg(payload ORDER BY start_date DESC, updated_at DESC) FROM plan_rows), '[]'::jsonb),
    'updatedAt', COALESCE(
      (
        SELECT to_char(MAX(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        FROM (
          SELECT updated_at AS ts FROM entry_rows
          UNION ALL
          SELECT updated_at AS ts FROM plan_rows
        ) AS all_updates
      ),
      to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  ) AS payload
)
INSERT INTO wellness_user_state (user_id, payload, updated_at)
SELECT 'usr-1776348315064-629418', payload, NOW()
FROM rebuilt
ON CONFLICT (user_id) DO UPDATE
SET payload = EXCLUDED.payload,
    updated_at = NOW();
