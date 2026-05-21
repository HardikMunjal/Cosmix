SELECT transaction_id, entry_date, status, payload
FROM wellness_user_activity_transactions
WHERE user_id = 'usr-1776348315064-629418'
ORDER BY entry_date DESC, updated_at DESC
LIMIT 20;
