-- Check what's in plan_transactions (activity names)
SELECT activity_name, source, entry_date, detail FROM wellness_plan_transactions WHERE user_id='usr-hardi' ORDER BY entry_date ASC, activity_name LIMIT 60;

-- Check what's in activity_transactions 
SELECT * FROM wellness_user_activity_transactions WHERE user_id='usr-hardi' ORDER BY entry_date ASC LIMIT 20;

-- Check user_state payload
SELECT payload FROM wellness_user_state WHERE user_id='usr-hardi';
