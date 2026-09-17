# Automation simplification, 16 September 2026

Goal: keep Correspondence Clerk updating itself while spending as little of the shared Claude
usage allowance as possible. Anything deterministic now runs in the database or the app; the
Claude routines only do work that needs judgement or a connector.

Every data change below was backed up to `cc_phase0_backup` first (reason shown).

## How it fits together now

| Time (UTC) | What | Where | Uses AI allowance? |
|---|---|---|---|
| 02:10 daily | `refresh_system_tasks()` | pg_cron `refresh-system-tasks` | No |
| 05:30 weekdays | **CC daily desk v2**: QuickBooks refresh, mailbox sweep, intent tagging, meetings, Tom's hand-written tasks, then `run_morning_pipeline()` | Claude routine `trig_01J3s7CLtfg2QtqEf78wRjjA` | Yes |
| 06:50 daily | `run_morning_pipeline()`: QuickBooks to CRM, task engine, prospect matching | pg_cron `morning-pipeline` | No |
| 07:00-07:59 daily | **Desk email**: runs the pipeline again, then builds and sends the email from `v_morning_desk` | Vercel cron `/api/cron/desk-email` | No |
| 08:12 weekdays | **Outreach**: drafts only; on Mondays refills `prospect_leads` first | Claude routine `trig_016DYfDyes2wzdsTkTz7Yg7F` | Yes |
| 10:30 daily | `check_routine_heartbeats()`: opens a task if the desk, outreach or desk email did not finish | pg_cron `check-routine-heartbeats` | No |
| Hourly | Mastersheet sync (Apps Script pulls `cc-live-export`) | Google Apps Script | No |
| On every email | Inbound webhook files mail and moves kanban stages | App + DB triggers | No (AI off) |

## Changes

### Routines (claude.ai)
- **New `CC daily desk v2`** (`trig_01J3s7CLtfg2QtqEf78wRjjA`), weekdays 05:30 UTC, Sonnet, connectors Supabase, Microsoft 365 and QuickBooks only. It sends no email. It replaces the Cowork-created routine, which carried about 80 KB of hidden setup (a long system prompt and remote-device tools) and 8 connectors on every one of its roughly 78 steps.
- **Old `CC daily desk`** (`trig_01LALVLwTZ7CWe13qEtmjz7i`): disabled, not deleted.
- **Outreach** (`trig_016DYfDyes2wzdsTkTz7Yg7F`): Google Drive connector removed, told not to load the two reference skills (about 30,000 characters per run), Monday prospecting folded in, stale references to the prospecting routine removed.
- **Business prospecting** (`trig_01EnDnHPMUR519P21RhwwidX`): disabled, merged into outreach.
- **Cloud environment "Default"**: network access set to Full (earlier on 16 Sep).

### Runbook
- `system_runbook.daily_desk` rewritten as v2 (steps 0 to 6). The old step 4 checked every open task (121 on 16 Sep, 7 closed); v2 checks only Tom's hand-written tasks, because engine tasks close themselves. The email step is gone. Backup reason `runbook_v1_before_v2_2026_09_16`.

### Database (migrations in `supabase/migrations/`)
- `20260916_001_qbo_renewal_needs_prior_term.sql`: a renewal card moves to invoice_paid only for a paid renewal term.
- `20260916_002_routine_heartbeats.sql`: `routine_heartbeat`, `routine_schedule`, `check_routine_heartbeats()`, cron at 10:30.
- `20260916_003_morning_pipeline.sql`: `run_morning_pipeline()`, `match_prospect_leads()`; cron `apply-qbo-to-crm` replaced by `morning-pipeline` at 06:50; `desk_email` added to the heartbeat schedule; `prospecting` disabled there.
- Considered and **rejected**: closing hand-written tasks in SQL. The dry run's two candidates were both wrong.

### App (correspondence-clerk, merged to `main`)
- `/api/cron/desk-email` + `lib/email/desk-email.ts`: the desk email, no AI. Needs `CRON_SECRET`. `?dry=1` previews without sending.
- `vercel.json`: removed `/api/cron/daily-briefing` (AI, failing daily for lack of credit); added `/api/cron/desk-email` at `0 7 * * *` (Hobby plan: runs some time within that hour).
- `lib/ai/client.ts`: `AI_ENABLED=false` makes every app AI call fail fast, so callers use their existing fallbacks. Inbound email still gets the deterministic formatting path.
- `lib/rate-limit.ts`: nightly cleanup now uses the service role (it had been failing with "permission denied").
- `lib/marketing/blog-generator.ts`: no error log for the never-created `blog_posts` table.

### Vercel settings
- `correspondence-clerk` production branch changed from `master` to `main`. Nothing had reached production between 8 Jul and 16 Sep.
- Environment variables added: `CRON_SECRET` (production), `AI_ENABLED=false` (production, preview).
- `chiswick-calendar-outreach-engine` **paused**. It had been running three daily crons since February: copying the Mastersheet into `oe_mastersheet_cache`, rebuilding a few hundred unused `oe_actions`, scanning ads, and calling the paid API to score prospects and write briefs. Unpause from the Vercel dashboard to restore it. Its tables and Edge Functions were left in place.

### Data
- 60 stale `news_leads` (July and August) set to `killed`. Backup reason `stale_news_leads_archived_2026_09_16`.
- Four businesses marked Former, Parle Pantry note corrected, Virgin Active removed. Backup reason `tom_decisions_2026_09_16`.

## To undo
- Old desk routine: re-enable `trig_01LALVLwTZ7CWe13qEtmjz7i`, disable `trig_01J3s7CLtfg2QtqEf78wRjjA`, restore the runbook from `cc_phase0_backup`.
- App AI: set `AI_ENABLED=true` (and top up the Anthropic API account).
- Outreach engine: unpause the Vercel project.

## Known gaps, not changed
- The app has Microsoft OAuth configured but no stored tokens. If it were connected, the app could read the mailboxes itself and the desk routine's sweep could go too.
- `oe_*` tables (about 3,000 rows) and 13 February-era Edge Functions are now unused.

## First morning on the new setup (17 Sep 2026)

- **Desk v2:** finished in 15.5 minutes and 60 steps, down from 45 minutes and 78 steps. It swept 69 emails (43 linked, 5 added, 21 noise), tagged 44 intents, closed 2 hand-written tasks, added 1 calendar event, and reconciled receivables to £5,038.04.
- **Desk email:** sent at 07:01. **Outreach:** 2 drafted, 5 held. **pg_cron:** all jobs succeeded. **Missed-run tasks:** none.
- **Old Outreach Engine:** no Edge Function calls, so the pause is holding.
- **Follow-up fix:** with AI off, the formatter now skips the call quietly instead of logging an error for every inbound email. The desk email subject now reads "Sep" rather than "Sept".
- **Test run on 16 Sep evening:** stopped by the 5-hour usage limit partway through the mail sweep, after completing step 0. A long interactive session had used the allowance. Keep heavy manual sessions away from the 05:30 to 08:30 UTC window.

## Added 17 Sep 2026: member care drafts

- **New routine `CC member care drafts`** (`trig_01StP874yVwk1toJgR5EsCrN`), weekdays 06:05 UTC, Sonnet, connectors Supabase and Microsoft 365. Its prompt is in `docs/member-care-routine-prompt.md`. It writes drafts only, never sends, in Tom's voice after reading the history and both mailboxes:
  - renewal, one month before a Club Card or advertising term ends
  - payment chaser, 7+ days overdue, at most once every 21 days per business
  - check-in, every 3 months of a live term
  - at most 6 drafts a day, 3 of them check-ins
  - one email per business; an overdue invoice takes precedence over a renewal
  - holds back when there's an open conversation or a recent email
- **Migration `20260917_001_member_care.sql`:**
  - `routine_drafts` logs every draft or hold-back, with a snooze date on hold-backs
  - `v_member_care_queue` decides who is due
  - `member_care` added to the heartbeat schedule
- **Desk email:** now opens with "Drafts waiting in your Outlook", from `routine_drafts` over the last 26 hours.
- **Outreach routine:** now records its drafts in `routine_drafts`. Drafts carry Tom's signature and Aptos 12, and the routine checks the Drafts folder before writing.
- **Queue on the first day:** 6 renewals, 9 businesses with overdue invoices, 62 check-ins. The check-in backlog clears at up to 3 a day.
