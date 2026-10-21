-- Stage 4 behaviour test for v_business_attention and get_attention_count().
-- LOCAL DATABASE ONLY. Everything runs in one transaction that is rolled back.
--   docker exec supabase_db_correspondence-clerk psql -U postgres -d postgres -f /tmp/stage4_test.sql
-- Run after applying 20261021_004_business_attention.sql.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

BEGIN;

SELECT organization_id AS org FROM businesses WHERE organization_id IS NOT NULL LIMIT 1 \gset
SELECT user_id AS uid FROM correspondence LIMIT 1 \gset
SELECT (get_attention_count(:'org')->>'total')::int AS total_before \gset

INSERT INTO businesses (organization_id, name, normalized_name, status)
VALUES (:'org', 'Stage4 test', 'stage4 test', 'Prospect') RETURNING id AS biz \gset

CREATE TEMP VIEW t_reason AS
  SELECT coalesce((SELECT reason FROM v_business_attention WHERE business_id = :'biz'), '(none)') AS r;

-- 1-6. The noise scoring, moved over from likelyNeedsReply
SELECT CASE WHEN email_needs_reply('Club Card', 'Hi Tom, could you send me the rate card for next year?') THEN 'PASS' ELSE 'FAIL' END || ' 1 a request needs a reply';
SELECT CASE WHEN NOT email_needs_reply('Re: Club Card', 'Thanks so much! Kind regards, Anna') THEN 'PASS' ELSE 'FAIL' END || ' 2 a pure thank-you does not';
SELECT CASE WHEN NOT email_needs_reply('Automatic reply: Club Card', 'I am out until Monday, can you call?') THEN 'PASS' ELSE 'FAIL' END || ' 3 an out-of-office does not';
SELECT CASE WHEN NOT email_needs_reply('October news', 'View this email in your browser. Big sale! To unsubscribe from this list click here') THEN 'PASS' ELSE 'FAIL' END || ' 4 a newsletter (2+2 points) does not';
SELECT CASE WHEN email_needs_reply('Mailchimp campaign stats', 'Here are the campaign stats you asked for. What do you think?') THEN 'PASS' ELSE 'FAIL' END || ' 5 one weak signal (2 points) is not enough to drop it';
SELECT CASE WHEN email_needs_reply('Hello', 'We have a new menu launching next month and would love some coverage for it') THEN 'PASS' ELSE 'FAIL' END || ' 6 an untagged longer email counts';

-- 7. An email they sent two days ago puts the business in the view
INSERT INTO correspondence (business_id, user_id, organization_id, raw_text_original, formatted_text_current, subject, direction, entry_date, type)
VALUES (:'biz', :'uid', :'org', 'x', 'Hi Tom, can you tell me the price of a sidebar ad?', 'Ad enquiry', 'received', now() - interval '2 days', 'Email')
RETURNING id AS mail \gset
SELECT CASE WHEN r = 'waiting_on_you' THEN 'PASS' ELSE 'FAIL' END || ' 7 received email is waiting on you: ' || r FROM t_reason;
SELECT CASE WHEN since = (now() - interval '2 days')::date AND NOT is_overdue THEN 'PASS' ELSE 'FAIL' END
       || ' 8 a reply shows its true age, not overdue: ' || since FROM v_business_attention WHERE business_id = :'biz';

-- 9. Anything sent to them since clears it
INSERT INTO correspondence (business_id, user_id, organization_id, raw_text_original, subject, direction, entry_date, type)
VALUES (:'biz', :'uid', :'org', 'x', 'Re: Ad enquiry', 'sent', now() - interval '1 day', 'Email') RETURNING id AS sent \gset
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 9 a reply clears it: ' || r FROM t_reason;
DELETE FROM correspondence WHERE id = :'sent';

-- 10. "No reply needed" clears it
UPDATE correspondence SET reply_dismissed_at = now() WHERE id = :'mail';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 10 No reply needed clears it: ' || r FROM t_reason;
UPDATE correspondence SET reply_dismissed_at = NULL WHERE id = :'mail';

-- 11. A routine tag saying it wants no reply clears it; reply_needed keeps it
UPDATE correspondence SET intent = 'editorial' WHERE id = :'mail';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 11 tagged editorial is not counted: ' || r FROM t_reason;
UPDATE correspondence SET intent = 'reply_needed' WHERE id = :'mail';
SELECT CASE WHEN r = 'waiting_on_you' THEN 'PASS' ELSE 'FAIL' END || ' 12 tagged reply_needed is counted: ' || r FROM t_reason;

-- 13. Older than 30 days is not counted
UPDATE correspondence SET entry_date = now() - interval '31 days' WHERE id = :'mail';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 13 over 30 days old is not counted: ' || r FROM t_reason;
UPDATE correspondence SET entry_date = now() - interval '2 days' WHERE id = :'mail';

-- 14-16. Commercial and reviewed businesses only
UPDATE businesses SET status = 'Unreviewed' WHERE id = :'biz';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 14 Unreviewed is not counted: ' || r FROM t_reason;
UPDATE businesses SET status = 'Prospect', business_type = 'internal' WHERE id = :'biz';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 15 internal (not commercial) is not counted: ' || r FROM t_reason;
UPDATE businesses SET business_type = 'venue_promoter' WHERE id = :'biz';
SELECT CASE WHEN r = 'waiting_on_you' THEN 'PASS' ELSE 'FAIL' END || ' 16 a commercial type is counted: ' || r FROM t_reason;

-- 17-18. Hand-written to-dos: due today counts, a future one doesn't; a reply outranks it
INSERT INTO tasks (organization_id, title, due_date, source, business_id)
VALUES (:'org', 'Stage4 test to-do', cc_today() + 3, 'manual', :'biz') RETURNING id AS task \gset
UPDATE correspondence SET reply_dismissed_at = now() WHERE id = :'mail';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 17 a to-do due in 3 days is not counted yet: ' || r FROM t_reason;
UPDATE tasks SET due_date = cc_today() - 1 WHERE id = :'task';
SELECT CASE WHEN r = 'todo' AND is_overdue THEN 'PASS' ELSE 'FAIL' END || ' 18 a to-do past its date is counted and overdue: ' || r
FROM t_reason, v_business_attention WHERE business_id = :'biz';
UPDATE correspondence SET reply_dismissed_at = NULL WHERE id = :'mail';
SELECT CASE WHEN r = 'waiting_on_you' AND reasons = ARRAY['waiting_on_you', 'todo'] THEN 'PASS' ELSE 'FAIL' END
       || ' 19 waiting on you outranks a to-do, both listed: ' || array_to_string(reasons, ',')
FROM t_reason, v_business_attention WHERE business_id = :'biz';

-- 20-23. Renewal window: 45 days ahead, 60 days back; outcome clears it
INSERT INTO contracts (business_id, organization_id, membership_type, contract_start, contract_end, is_current)
VALUES (:'biz', :'org', 'club_card', cc_today() - 345, cc_today() + 20, true) RETURNING id AS con \gset
SELECT CASE WHEN r = 'renewal' THEN 'PASS' ELSE 'FAIL' END || ' 20 renewal in 20 days outranks a reply: ' || r FROM t_reason;
UPDATE contracts SET contract_end = cc_today() + 46 WHERE id = :'con';
SELECT CASE WHEN r = 'waiting_on_you' THEN 'PASS' ELSE 'FAIL' END || ' 21 46 days out is not yet a renewal: ' || r FROM t_reason;
UPDATE contracts SET contract_end = cc_today() - 59 WHERE id = :'con';
SELECT CASE WHEN r = 'renewal' AND is_overdue THEN 'PASS' ELSE 'FAIL' END || ' 22 ended 59 days ago is a renewal, overdue: ' || r
FROM t_reason, v_business_attention WHERE business_id = :'biz';
UPDATE contracts SET contract_end = cc_today() - 61 WHERE id = :'con';
SELECT CASE WHEN r = 'waiting_on_you' THEN 'PASS' ELSE 'FAIL' END || ' 23 ended 61 days ago drops out: ' || r FROM t_reason;
UPDATE contracts SET contract_end = cc_today() + 20 WHERE id = :'con';
UPDATE businesses SET renewal_stage = 'agreed' WHERE id = :'biz';
SELECT CASE WHEN r = 'waiting_on_you' THEN 'PASS' ELSE 'FAIL' END || ' 24 an agreed renewal drops out: ' || r FROM t_reason;
UPDATE businesses SET renewal_stage = 'not_started' WHERE id = :'biz';

-- 25-28. Money owed outranks everything; a chaser rests it 7 days; care exclusion stops it
INSERT INTO qbo_customers (qbo_customer_id, organization_id, display_name)
VALUES ('stage4-test', :'org', 'Stage4 test');
INSERT INTO qbo_links (organization_id, business_id, qbo_customer_id, match_method)
VALUES (:'org', :'biz', 'stage4-test', 'test');
INSERT INTO qbo_invoices (qbo_invoice_id, organization_id, qbo_customer_id, doc_number, due_date, balance, total_amount)
VALUES ('stage4-test-1', :'org', 'stage4-test', 'T1', cc_today() - 10, 250, 250);
SELECT CASE WHEN r = 'money_owed' AND reasons = ARRAY['money_owed', 'renewal', 'waiting_on_you', 'todo'] THEN 'PASS' ELSE 'FAIL' END
       || ' 25 money owed comes first: ' || array_to_string(reasons, ',')
FROM t_reason, v_business_attention WHERE business_id = :'biz';
INSERT INTO correspondence (business_id, user_id, organization_id, raw_text_original, subject, direction, entry_date, type)
VALUES (:'biz', :'uid', :'org', 'x', 'Invoice T1 reminder', 'sent', now() - interval '6 days', 'Email') RETURNING id AS chase \gset
SELECT CASE WHEN r = 'renewal' THEN 'PASS' ELSE 'FAIL' END || ' 26 a chaser 6 days ago rests it (and answers the email): ' || r FROM t_reason;
UPDATE correspondence SET entry_date = now() - interval '8 days' WHERE id = :'chase';
SELECT CASE WHEN r = 'money_owed' THEN 'PASS' ELSE 'FAIL' END || ' 27 a chaser 8 days ago no longer rests it: ' || r FROM t_reason;
INSERT INTO care_exclusions (business_id, kind, reason) VALUES (:'biz', 'overdue', 'stage4 test');
SELECT CASE WHEN r = 'renewal' THEN 'PASS' ELSE 'FAIL' END || ' 28 care exclusion stops money owed: ' || r FROM t_reason;

-- 29-31. Snooze, and the count
SELECT (get_attention_count(:'org')->>'total')::int AS total_in \gset
SELECT CASE WHEN :total_in = :total_before + 1 THEN 'PASS' ELSE 'FAIL' END || ' 29 count goes up by one business, not by reasons: ' || :total_before || ' -> ' || :total_in;
UPDATE businesses SET attention_snoozed_until = cc_today() WHERE id = :'biz';
SELECT CASE WHEN (get_attention_count(:'org')->>'total')::int = :total_before
            AND (get_attention_count(:'org')->>'snoozed')::int >= 1 THEN 'PASS' ELSE 'FAIL' END || ' 30 snoozed until today drops out of the count';
UPDATE businesses SET attention_snoozed_until = cc_today() - 1 WHERE id = :'biz';
SELECT CASE WHEN (get_attention_count(:'org')->>'total')::int = :total_in THEN 'PASS' ELSE 'FAIL' END || ' 31 a past snooze no longer applies';

-- 32. A hand-written to-do with no business counts once
INSERT INTO tasks (organization_id, title, due_date, source) VALUES (:'org', 'Stage4 loose to-do', cc_today(), 'manual');
SELECT CASE WHEN (get_attention_count(:'org')->>'total')::int = :total_in + 1 THEN 'PASS' ELSE 'FAIL' END || ' 32 a loose to-do due today counts';

-- 33. Not a business drops out entirely
UPDATE businesses SET status = 'Not a business' WHERE id = :'biz';
SELECT CASE WHEN r = '(none)' THEN 'PASS' ELSE 'FAIL' END || ' 33 Not a business drops out: ' || r FROM t_reason;

-- 34. Totals add up
SELECT CASE WHEN (c->>'total')::int = (c->>'money_owed')::int + (c->>'renewal')::int + (c->>'waiting_on_you')::int
                                     + (c->>'todo')::int + (c->>'unlinked_todos')::int
            THEN 'PASS' ELSE 'FAIL' END || ' 34 reasons add up to the total: ' || c::text
FROM (SELECT get_attention_count(:'org') AS c) x;

ROLLBACK;
