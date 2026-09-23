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

## 17-18 Sep 2026: wiring audit and fixes

An audit of every page, table and routine found parts that did not talk to each other. All fixed, every data change backed up to `cc_phase0_backup` first.

| Gap | Fix | Where |
|---|---|---|
| 626 emails stored with an empty body, about 1,000 unreadable in total (the body was only ever written by the AI formatter, which is off) | `plainEmailBody()` fills the body on arrival with no AI; `plain_email_body()` backfilled 1,017 rows (backup `empty_body_backfill_2026_09_18`) | `lib/inbound/utils.ts`, `app/api/inbound-email/route.ts`, migration `20260918_001` |
| Routine drafts only visible in the 07:00 email; "Recent Drafts" on /briefing read the wrong table | /briefing "Drafts written for you" reads `routine_drafts`, with hold-backs and their return dates | `app/actions/leads.ts`, `app/briefing/_components/DraftsSection.tsx` |
| Tasks did not know a draft had been written | `routine_draft_marks_tasks()` stamps matching open tasks; the task row shows "Draft waiting" and links to Outlook Drafts | migration `20260918_002`, `components/DelegateButton.tsx` |
| The ✨ Draft button called an AI account with no credit | Now "Ask for a draft": writes `draft_requests`, which the member care routine handles first on its next run (prompt step 0). `/api/delegate-draft` deleted | `app/actions/tasks.ts`, routine `trig_01StP874yVwk1toJgR5EsCrN` |
| A routine that finished late looked failed until 10:30 the next day | A heartbeat closes its own missed-run task on arrival | migration `heartbeat_closes_missed_task` (applied via MCP, recorded here) |
| Prospect Leads and the Outreach board disagreed | The two mirror each other through triggers; the board counts only leads still needing a decision (backup `prospect_pipeline_sync_2026_09_18`) | migration `20260918_003`, `getProspectLeads()` |
| Members whose term ended long ago sat in "To contact" | A Lapsed list below the renewals board for terms ended over 90 days ago, with "Chasing it" and "Move to outreach" | `app/todos/_components/ContractsView.tsx` |
| Insights offered buttons that could only fail with AI off | Hidden from the nav when `AI_ENABLED=false`; /insights explains why | `components/Navigation.tsx`, `app/insights/page.tsx` |
| Dead code: legacy task generators (a trigger already blocked their inserts), a renewal-date migration running on every To-dos load, the retired daily-briefing cron route, the bookmarklet banner | Deleted | `app/actions/tasks.ts`, `app/settings/page.tsx`, `components/DashboardClient.tsx` |
| AI clients built at module load, so a missing key broke the whole build | Built on use | `app/api/tools/clean-email`, `lib/marketing/*` |
| Nine Former businesses still typed as current members | `membership_type` set to `former_*` (backup `former_membership_type_tidy_2026_09_18`) | data |
| Rate card link held only in routine prompts | The Resource Hub rate card row now points at the same file and is pinned. To change the rate card, replace the PDF at the same storage path (`public-assets/chiswick-calendar-rate-card.pdf`) and every link keeps working | data |

**First morning on the new wiring (18 Sep):** member care drafted 4 (Hatch Meyhane renewal, check-ins for Kings House Sports Ground, Foster Books and Cykl Haus) and held back 6, including four where a draft was already waiting in Outlook and one where the member is waiting on a reply from Tom. Overnight, 8 emails were filed and none had an empty body.

**Walk-through of the live site, 18 Sep:** four more fixes (migration `20260918_004`). Drafts are marked sent, and answered, when the BCC copy files back with the same subject; the task then says "Sent". Hold-backs appear on their task as "Held back to <date>" with the reason and an "Ask again" button. To-dos now groups automatic tasks by kind (payments to chase, replies waiting, stats emails) instead of labelling everything "renewals". News Leads counts only live leads.

## 18 Sep 2026: QuickBooks drives contracts

QuickBooks was synced every morning, but an invoice for a new term never became a contract. Members invoiced for another year still showed as expired, and Chiswick Physio, a current advertiser, was marked Former.

- **`record_qbo_terms()`** now runs first in `run_morning_pipeline()`. A membership or advertising invoice becomes a contract when it's clearly a new term:
  - a **renewal**: the current term ends within 90 days either side of the invoice, and the invoice is at least 80% of the old amount, which ignores monthly standing orders;
  - a **new member**: a 12-month invoice from the last 60 days, with no current contract.
  - Instalment deals are skipped and need recording by hand. Each invoice is used once (`contracts.qbo_invoice_id`).
- **First run:** 6 contracts, for Arcane, Bollo House, Levent Borek, Oddono's, Tarantella (renewals) and Rozies (new member).
- **Chiswick Physio** is now recorded by hand as one advertiser contract: 17 Jul 2026 to 16 Jul 2027, £2,160 in three instalments. Invoice 1793 (£720) is still outstanding.
- **`sync_business_flags_from_contracts()`** now also:
  - copies the current contract onto the business's own contract fields, which the business page header and the Mastersheet export read;
  - marks a business Active when it has a contract in force. This covered 5 members who were still labelled Prospect.
- **Business page:**
  - a new "Drafts and decisions by the routines" panel;
  - contract dates shown for advertisers as well as Club Card members;
  - the AI summary and suggestion panels are hidden while AI is off.
- **Home page:** the News Leads board is removed, because the news scan is off.
- **Removed:** `/api/businesses/update-contract`, which was unused and wrote only to the business row.
- **Backups:** reason `quickbooks_drives_contracts_2026_09_18`.
- **Still to decide:** Theatre at the Tabard has two current contracts for the same year (£1,920 and £1,439.99).

## 21 Sep 2026: emails put people on file

Before this, an email to someone who was not already a contact was dropped, and one from an unknown business was dropped too. Both now create what is missing (`app/api/inbound-email/route.ts`):

| Situation | What happens now |
|---|---|
| Tom BCCs an email to a known business, unknown person | The contact is created on that business, with the name from the header |
| Tom BCCs an email to a company we have never dealt with | The business is created from the company's domain, plus the contact, plus a task to check the record. The domain is remembered for next time |
| Tom BCCs an email to a personal address (gmail and the like) with no match | The business is named after the person, so it can be renamed |
| An email arrives from a new person at a known business | The contact is created |
| An email arrives from a company we have never dealt with | The business and contact are created and the email is filed |
| An email arrives from a personal address with no match | Left alone, as before: there is no business to infer |

Guardrails: never our own domains; no-reply, newsletter and blocked senders are dropped before this point; an exact business-name clash reuses the existing business; every automatic record says so in its notes, and a new business opens a "Check the new record for X" task.

**Theatre at the Tabard:** the duplicate contract is retired. The live one is the advertising deal, 12 months sidebar at £160 a month, £1,920 in total, paid £480 every 3 months, Nov 2025 to Nov 2026. Invoices 1683, 1726 and 1728 are paid; the last £480 instalment is still to invoice. Backup reason `tabard_single_contract_2026_09_21`.

## 21 Sep 2026: yes, no, and one-off work

Two jobs that still needed Tom.

**"Agreed" and "Not renewing" move themselves.** The desk routine already tags every inbound email each morning. Its intent list gains `renewal_agreed`, `renewal_declined` and `deal_agreed`, with strict wording: only what the customer actually said, in an email they sent, never read into our own words or into silence. A trigger (`apply_intent_to_stage`) then moves the card, sets the date, and will not walk a paid renewal backwards. Runbook backup reason `runbook_before_yes_no_intents_2026_09_21`.

**One-off work is recorded.** `one_off_sales`, filled by `record_qbo_one_offs()` as the second step of the morning pipeline: any QuickBooks invoice that is not an annual membership or advertising term, so advertorials, featured articles, short ad runs and band fee contributions. The business page shows them under "Other work bought", with the total and anything unpaid. First run recorded **40 invoices, £30,278, of which £1,360 is outstanding**. Three membership renewals were caught by the first pass and removed; the test now excludes anything mentioning a Club Card or membership.

## 23 Sep 2026: why the chasers went quiet

Tom noticed he had stopped seeing renewal and payment drafts. Three faults in `v_member_care_queue` (migration `20260923_001`):

1. **Former members were excluded from everything, including money they owe.** Pub in the Park (£360, 503 days) and The Old Pack Horse (£250, 523 days) could never be chased. The overdue part now covers every business that is not muted; renewals and check-ins still go only to current members.
2. **Any later contract row counted as "already renewed".** Rocks Lane's Club Card expired on 23 Sep having never been chased, because a three-month sidebar ad from May started later than the Club Card term. The test is now a current contract of the same kind.
3. **Three weeks between payment chasers.** Everyone overdue had been chased on 17 or 21 Sep, so the queue was empty for most of the month. Now two weeks.

The rest was working as designed: renewals that looked missing had drafts already sitting in Outlook (four of which Tom sent on 21 Sep), and several were held back with snooze dates the routine had set itself.

## 23 Sep 2026: chase until it is sent

Tom's rule: money and renewals get chased every day, as many as are needed, and anything he has not sent gets lifted back to the top of his Drafts folder.

- **No more waiting on the clock.** The queue used to go quiet for 14 or 21 days after a draft was *written*. What counts now is whether the email was *sent*: a chaser that went out rests for 7 days, then the debt comes back round. Same for renewals, which also drop out for good once the customer agrees, pays or declines.
- **No cap on money or renewals.** Every overdue business and every renewal in the window is handled on every run. Check-ins stay at 3 a run, after the money. A whole run stops at 15 emails to protect the shared allowance.
- **Unsent drafts are lifted, not duplicated.** Each queue row carries `open_draft_id`, `open_draft_written_at` and `open_draft_bumps`. The routine re-saves that draft through `outlook_update_draft`, which moves it to the top of Drafts, and records the lift on the same `routine_drafts` row (`bumped_at`, `bump_count`). If the draft has been deleted, it writes a fresh one, shorter and more direct. After three lifts it holds back and says it needs Tom.
- **Money is never held back for want of a named contact.** It uses the QuickBooks billing address and opens with "Hello,". No chaser is snoozed for more than 7 days.
- The desk email and the home page now say when a draft has been waiting and how many times it has been moved back up.

Found while investigating: the Drafts folder held only that morning's drafts. Some had been sent (they file themselves back through the BCC, which is how the app knows), and others were in Deleted Items. The routine now treats a deleted draft as a decision to bin it and writes a fresh one next time round.
