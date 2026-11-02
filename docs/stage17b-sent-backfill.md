# Stage 17b (2): sent email backfill, 4 Jun to 1 Sep 2026

One-off, run by a Claude session (Sonnet) after the migration `20261102_003_sent_mail` and the runbook script
`supabase/data-fixes/20261102_stage17b_sent_runbook.sql` are live, and only with Tom's go-ahead for the load.
Read only on Outlook (never send, move, label or delete). No paid API: the Outlook connector in the session.

Why a separate run: the daily routine resumes from its newest sent scan (late Oct), so it never looks back at
Jun to Aug. About 1,025 sent items sit there (363 in tom@, 662 in info@; Outlook counts on 2 Nov).

For each mailbox (tom@thechiswickcalendar.co.uk; info@thechiswickcalendar.co.uk with `mailboxOwnerEmail`):

1. `outlook_email_search` with `folderName: "Sent Items"`, `afterDateTime: "2026-06-04"`, `beforeDateTime: "2026-09-02"`,
   `order: "newest"`, `limit: 25`, paging with `offset` until `moreResults` is gone. Do not open full messages.
2. After each page, one call: `SELECT file_sent_mail('00000000-0000-0000-0000-000000000001', $j$[...]$j$::jsonb, '<mailbox>');`
   Each array element is `{"mailbox", "internet_message_id": internetMessageId, "graph_id": id, "sent_at": sentDateTime,
   "from": sender, "subject", "body": summary (exactly as returned), "web_link": webLink,
   "recipients": [{"address", "name" (from namedRecipients, else null), "kind": "to"}]}`.
3. Add up the returned counts (`filed`, `already_on_file`, `skipped`, `held`, `already_scanned`) for the Log.

The function skips what is already in `mail_scan`, matches contacts and businesses, de-duplicates against BCC copies and
holds unknown company addresses on Data health. Safe to stop and resume: a message already handled is skipped.
Undo for the filed rows: `DELETE FROM correspondence WHERE ai_metadata->>'source' = 'sent_mail_sweep' AND entry_date < '2026-09-02'`
(first copy those rows to `cc_phase0_backup`, reason `stage17b sent backfill undo`), and delete the matching `mail_scan` rows.
Reading cost: about 40 pages of 25.

Expected effect on Today: "waiting on you" only looks at the last 30 days, and the window being filled ends 2 Sep, so
Today, the badge and the desk email do not change. What changes is last in touch (and Win back / gone quiet) for
businesses whose last contact was in Jun to Aug, and what the dossier, search and the skill can see.
