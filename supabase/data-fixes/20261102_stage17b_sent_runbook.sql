-- Stage 17b (2): the daily desk routine files sent email through file_sent_mail().
-- The routine reads its steps from system_runbook ('daily_desk'), so this changes STEP 1 there; the routine's
-- own prompt (the trigger text in claude.ai) needs no change. STEP 1 keeps the Inbox sweep (received mail);
-- sent mail moves to a new STEP 1B that hands each Sent Items message, unedited, to the database function
-- from migration 20261102_003_sent_mail, which matches, skips and de-duplicates the same way every time.
-- Run only after that migration is live. Before-image of the whole row in cc_phase0_backup
-- (reason 'stage17b sent runbook 2026-11-02'). Undo: 20261102_stage17b_sent_runbook_undo.sql.
BEGIN;
DO $$
DECLARE
  b text;
  o1 text := E'SELECT mailbox, max(received_at) FROM mail_scan GROUP BY 1;';
  n1 text := E'SELECT mailbox, max(received_at) FROM mail_scan WHERE direction = ''received'' GROUP BY 1;';
  o2 text := E'list Inbox and Sent Items since then with outlook_email_search (order newest, offset paging, cap 120 per mailbox).';
  n2 text := E'list the Inbox (folderName ''Inbox'') since then with outlook_email_search (order newest, offset paging, cap 120 per mailbox). Sent Items are STEP 1B.';
  o3 text := E'insert it: direction ''received'' or ''sent'', type';
  n3 text := E'insert it: direction ''received'' (sent mail is STEP 1B), type';
  o4 text := E'STEP 2';
  n4 text := E'STEP 1B - SENT EMAIL from tom@ and info@. Do this for each mailbox on every weekday run, even when there is nothing new, so the run is recorded.
Resume point: SELECT coalesce(max(received_at), ''2026-06-04''::timestamptz) - interval ''1 day'' FROM mail_scan WHERE direction = ''sent'' AND mailbox = <mailbox>;
List folderName ''Sent Items'' with outlook_email_search (info@ via mailboxOwnerEmail, order newest, afterDateTime = the resume point, offset paging until there are no more pages: NO cap). Do not open full messages.
Hand the messages to the database in batches of 25, copying each message''s fields exactly as the search returned them (do not shorten, summarise or reword the text):
  SELECT file_sent_mail(''00000000-0000-0000-0000-000000000001'', $j$[ ...json... ]$j$::jsonb, ''<mailbox>'');
Each array element: {"mailbox": <mailbox>, "internet_message_id": internetMessageId, "graph_id": id, "sent_at": sentDateTime, "from": sender, "subject": subject, "body": summary, "web_link": webLink, "recipients": [{"address": <address>, "name": <name from namedRecipients, or null>, "kind": "to"}, ...]} with one recipients entry for every address in recipients (the search does not say To or Cc, so use "to").
If the mailbox has no new sent mail, still call it once with an empty array: file_sent_mail(''00000000-0000-0000-0000-000000000001'', ''[]''::jsonb, ''<mailbox>'').
file_sent_mail decides everything: it skips mail already in mail_scan, calendar replies, team-only mail and personal addresses with no contact, de-duplicates against BCC copies, matches the recipient to a contact and business, and holds the rest for Tom on Data health ("Sent email to review"). Do NOT insert sent mail yourself, do not create businesses or contacts from it, and do not mark any of it noise. Put the counts it returns (filed, already_on_file, skipped, held, already_scanned) in the heartbeat note.

STEP 2';
BEGIN
  SELECT body INTO b FROM system_runbook WHERE id = 'daily_desk';
  IF b IS NULL THEN RAISE EXCEPTION 'daily_desk runbook not found'; END IF;
  IF (length(b) - length(replace(b, o1, ''))) <> length(o1)
     OR (length(b) - length(replace(b, o2, ''))) <> length(o2)
     OR (length(b) - length(replace(b, o3, ''))) <> length(o3)
     OR (length(b) - length(replace(b, E'\nSTEP 2', ''))) <> length(E'\nSTEP 2') THEN
    RAISE EXCEPTION 'daily_desk runbook is not the text this script expects (md5 %): stop and look', md5(b);
  END IF;
  INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
  SELECT 'system_runbook', md5('system_runbook:daily_desk')::uuid, to_jsonb(r), 'stage17b sent runbook 2026-11-02'
  FROM system_runbook r WHERE r.id = 'daily_desk';
  UPDATE system_runbook
     SET body = replace(replace(replace(replace(body, o1, n1), o2, n2), o3, n3), E'\nSTEP 2', E'\n' || n4),
         updated_at = now()
   WHERE id = 'daily_desk';
END $$;
COMMIT;
