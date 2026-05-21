SELECT u.id, u.username, u.email,
       COALESCE(jsonb_array_length(w.payload->'entries'), 0) AS wellness_entries
FROM app_users u
LEFT JOIN wellness_user_state w ON w.user_id = u.id
ORDER BY wellness_entries DESC;
