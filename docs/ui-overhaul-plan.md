# UI overhaul plan

The one file any session reads first to know where this work stands. Update the stage table, Decisions and the log after every change.

- **Status:** approved by Tom on 21 Oct 2026. Stages 0 and 1 done, each waiting on a check after the next scheduled runs (see the handover at the end of the Log); Stage 2 next.
- **Why some checks wait.** A check that depends on a scheduled job (a nightly run, a morning cron) can only be done after that job has run. Same-day checks show the change is in place; the later check shows it holds.
- **Branch:** `ui-overhaul`. Nothing merges to `main` (which auto-deploys to production) without Tom's say-so.
- **Supabase project:** `ayoiibrzkllerrwbhvda` (Free plan). **Vercel:** `correspondence-clerk` (Hobby).

## Why this exists

Tom finds the app overwhelming. The overdue and task areas are the worst: on 21 Oct 2026 the nav badge showed 146, the To-dos overdue strip 63, and fewer than half of the 173 open tasks needed him. He wants to open the app and find a business's latest contact, correspondence, history and deal with almost no effort, in a Mastersheet-style table.

## Hard constraints

1. **No paid per-use API calls** anywhere in the running system (Anthropic, OpenAI, Google Places or similar).
2. **Claude routines** (claude.ai subscription allowance) are allowed but optional. The app must work fully without them.
3. **Migrations** are additive and backwards compatible, tested on a local Supabase copy first (`supabase start`, needs Docker), and backed up to `cc_phase0_backup` before touching live data. Nothing destructive without a backup and Tom's explicit sign-off for that specific action.
4. **No data deleted, merged or altered** without Tom approving that specific action.
5. **No emails sent or drafted** by Claude Code sessions.

## Findings (audit of 21 Oct 2026)

| # | Finding | Evidence |
|---|---|---|
| F1 | Ticking a task done doesn't stick | The engine reopens the same signal after `reopen_after_days`. 24 of 31 "You said you'd" items reopened (one 7 times); 35 of 87 replies reopened |
| F2 | Reply tasks hide their age | `refresh_system_tasks` resets `due_date` to today every night; all 51 open reply tasks say "due today", the oldest from 25 Aug |
| F3 | Noise in the task list | 17 "Check the new record", 3 "Routine did not finish", reply/editorial tasks for internal people (Bridget Osborne: 342 emails, 5 open tasks) and junk senders |
| F4 | Two "needs reply" systems on To-dos | Engine `reply:` tasks plus legacy `getNeedsReply()`; its RPC `get_needs_reply_candidates` has `LIMIT 500`, so the "365-day" window reaches back only about 3 weeks |
| F5 | Email auto-creates junk businesses | 139 since 21 Sep, all `Prospect` (HMRC, Dropbox, NHS, Mailchimpapp, "Mail", spam). Personal providers mapped: `btopenworld.com`, `cantab.net` |
| F6 | Junk reaches the Mastersheet | `cc-live-export` includes Prospects contacted within 18 months: about 134 of the junk |
| F7 | Duplicate businesses | About 17 likely pairs (e.g. M\|P Studio / MP Studio, CHISWICK-PHYSIO / CHISWICK PHYSIO). 28 emails on contacts at 2+ businesses |
| F8 | "Active" has three meanings | `status='Active'` 123; contract in force 91; flags. 32 Active with no contract in force; 18 current contracts already ended |
| F9 | Deal stored twice | Contract fields copied onto `businesses`; 83 businesses have `contract_end` with no current contract; the business page header reads the copies |
| F10 | Contacts | 820 of 1,479 are placeholders; 638 businesses have no named contact with an email; no primary contact |
| F11 | Unused or undefined fields | `business_type` and `disposition` set on 0 businesses; `renewal_stage='in_progress'` not in the TS union; nothing records "On website?" |
| F12 | "+ Task" on a business page isn't linked | `BusinessDetailClient.tsx` calls `createTask()` with no `business_id`; 28 of 31 hand-written tasks have no business |
| F13 | Five expiry windows | `renewal_due` 45d ahead; `renewal_lapsed` 120d back; member care -60/+35; renewals board lapsed after 90d; CLAUDE.md says 30d |
| F14 | Two clocks | Nav count uses the UTC date, To-dos the local date |
| F15 | CLAUDE.md stale | Describes the removed `/actions` page; Hard Rule 2 contradicts the task engine |
| F16 | Old Outreach Engine still calls the paid API | Vercel project `chiswick-calendar-outreach-engine` crons at 06:00/07:00/08:00 UTC call Edge Functions; `score-prospect` hits Anthropic daily and fails only for lack of credit. 7 of 14 Edge Functions have `verify_jwt=false` |
| F17 | Supabase security advisor | `run_readonly_query` is SECURITY DEFINER and callable by any signed-in user; 9 drop-in functions callable without signing in; leaked-password protection off |

Classification of the 173 open tasks on 21 Oct: about 66-74 actionable, 31 probably done already, 30 junk or internal sender (about 8 of them real contact-form leads), 20 housekeeping, 14 already handled by a routine, 11 stale, 1 duplicate.

## Decisions

| Date | Decision |
|---|---|
| 21 Oct | Plan approved as proposed |
| 21 Oct | Routines allowed but optional; the app must work without them |
| 21 Oct | "All Active Businesses" = a Club Card or advertiser contract in force, plus contracts ended within 60 days not marked `not_renewing` |
| 21 Oct | Test migrations on local Supabase (CLI + Docker), not branching |
| 21 Oct | Mastersheet: read-only copy keyed on `business_id`, one row per business, during the rollout; retire once the table replaces it |
| 21 Oct | "On website?" is worked out from the Club Card page on the website if possible |
| 21 Oct | Advertiser stats emails and Club Card check-ins are quiet reminders, not "needs attention" |
| 21 Oct | The 139 auto-created businesses go to Tom as a review list with obvious junk pre-ticked |
| 21 Oct | Internal and community contacts get their own type, kept out of every commercial view |
| 21 Oct | Commitments: no automatic detection feeds the attention count (see below) |
| 21 Oct | Stop the Outreach Engine functions |
| 21 Oct | Auto-created businesses that are really a person at a business on file are moved, not hidden: their emails and the person go to that business (joined to the existing contact if the name or email matches), and the empty record is hidden. The review page offers Keep / Hide / Move. Going forward, an Unreviewed business gets a "Move to business" action in the app (Stage 3, built on `merge_businesses()`) |

**Commitments ("You said you'd").** Automatic detection depends on routine tags, which are optional and have been unreliable. So: a one-click "I'll do this by [date]" on any email or business row creates a linked to-do, and that is the only thing that counts. Where a routine has tagged a promise, the business page shows it as a suggestion with an "Add as to-do" button; it never enters the count and can't reopen. Existing open commitment tasks are bulk-closed after a backup (Stage 1, with Tom's go-ahead).

## Definitions

**Needs attention** is worked out live per business by the view `v_business_attention`: one top reason per business, recalculated on every page load, so there is nothing to tick and nothing can come back.

| Priority | Reason | Rule | Clears when |
|---|---|---|---|
| 1 | Money owed | QuickBooks balance > 0, past due, not in `care_exclusions`, no chaser from Tom, QuickBooks or a routine in the last 7 days | Paid, or a chaser is sent (rests 7 days) |
| 2 | Renewal | Current contract ending within the Expiring window (default 45 days) or ended up to 60 days ago; renewal stage not agreed, paid or not renewing | Renewed, agreed, declined or paid |
| 3 | Waiting on you | Email received from a reviewed commercial business (not internal, not muted) within 30 days, nothing sent to them since on any thread. Noise filtered by the existing 3-plus-points scoring | Anything sent to them, or "No reply needed" (sets `reply_dismissed_at`) |
| 4 | Your to-dos | Hand-written tasks, including "I'll do this by [date]" | Ticked |

**Overdue** is used only where there is a real deadline: an invoice past its due date, a contract that has ended, a to-do past its date. Replies show their true age instead.

**Not counted:** editorial submissions (own list), unreviewed new businesses (a table filter), routine failures (a small system banner), advertiser stats and Club Card check-ins (quiet reminders on the row).

**Snooze** is per business (`attention_snoozed_until`) and survives every refresh.

## Stages

| # | Stage | Depends on | Status |
|---|---|---|---|
| 0 | Stop paid and public Edge Function calls | none | **Done 21 Oct**, pending the 3-day check: no Outreach Engine calls in `function_edge_logs` on 22-24 Oct (no calls since the pause on 21 Oct; Supabase `ANTHROPIC_API_KEY` secret deleted) |
| 1 | Done sticks and honest dates in the task engine; bulk-close stale engine tasks | Local Supabase | **Done 21 Oct**, pending a check of the first nightly run (02:10 UTC on 22 Oct). Live migration applied and fingerprint-matched to the tested version; 69 tasks bulk-closed with Tom's approval |
| 2 | Stop junk at the source: `Unreviewed` status, notification-domain guard, personal-domain mappings | Local Supabase | **In progress.** Code, migration and Tom's review cleanup all done and tested locally. Waiting on Tom's go-ahead for live (migration, merge to `main`, cleanup script) |
| 3 | Canonical record: primary contact, Internal/Community type, `merge_businesses()`, approved merges and cleanup | 2 | Not started |
| 4 | `v_business_attention` and one consistent count, shown beside the old count for a week | 1, 2 | Not started |
| 5 | Table home and saved views (old pages still reachable); "On website?" from the Club Card page | 3, 4 | Not started |
| 6 | Business detail "at a glance" and one merged timeline | 3, 4 | Not started |
| 7 | Merge and retire screens, redirects, nav | 5, 6 | Not started |
| 8 | Zero-credit drafting: templates and "Copy context pack" | 6 | Not started |
| 9 | Mastersheet export keyed on `business_id`, one row per business, excludes Unreviewed; Apps Script update (Tom) | 2, 3 | Not started |
| 10 | Docs: CLAUDE.md, bring `cc-live-export` into the repo | all | Not started |

### Per stage: change, risk, verify, rollback

- **0.** Pause the outreach-engine Vercel project; require JWT on the paid Edge Functions. Risk: something still needs them. Verify: no `function_edge_logs` hits for 3 days. Rollback: unpause; redeploy previous function version.
- **1.** A trigger on `tasks` writes ticks back to the source (`reply_dismissed_at`, `intent_meta.done`, snooze); reply `due_date` = date received. Risk: items vanish wrongly. Verify: tick 3 test items, run the refresh 3 times, they stay closed. Rollback: restore the previous function definitions, kept in the migration.
- **2.** Webhook creates `Unreviewed` businesses; notification domains refused; export excludes Unreviewed. Risk: a real lead hidden. Verify: replay 20 recent emails in dry-run. Rollback: revert the commit.
- **3.** `contacts.is_primary`, `businesses.merged_into`, `merge_businesses()`. Risk: wrong merge. Verify: run on local Supabase; row counts per foreign key before and after. Rollback: restore from `cc_phase0_backup`, pair by pair.
- **4.** New view and nav count; old and new shown side by side for a week. Risk: a missed item. Verify: compare against the 21 Oct classification. Rollback: flag off.
- **5-7.** New routes alongside the old ones, then redirects. Risk: a missing feature. Verify: regression checklist. Rollback: flag off, remove redirects.
- **8.** Templates in the database; mailto and copy only. Rollback: hide the buttons.
- **9.** Export v13 adds fields only; Apps Script change by Tom. Rollback: previous export version.

## Regression checklist (after every stage)

- [ ] Inbound email files correctly: BCC, forward, contact form, QuickBooks notice
- [ ] Own-domain guard holds
- [ ] Contract trigger sets the business flags
- [ ] Stage derivation moves a test card
- [ ] Morning pipeline runs and the desk email sends
- [ ] Member care queue size unchanged unless intended
- [ ] Mastersheet export row count within 2 of expected
- [ ] Business page loads every section
- [ ] New entry saves
- [ ] Inbox file, block and discard work
- [ ] Nav count matches the page
- [ ] No console errors
- [ ] `npm run build` and `npm run lint` pass

## Deferred

- Vercel Hobby plan is for non-commercial use; this is commercial use (terms risk, not technical)
- Supabase advisor fixes (`run_readonly_query`, drop-in functions, leaked-password protection)
- `oe_*` tables and the old Edge Functions: kept until decided
- SaaS and marketing pages (landing, pricing, blog, onboarding, billing)

## Log

- **21 Oct 2026:** Audit delivered and plan approved. Working copy re-cloned to `Desktop\correspondence-clerk`, branch `ui-overhaul`.
- **21 Oct 2026, Stage 0:** The caller is the outreach-engine Vercel project's own crons (`vercel.json`: `/api/cron/sync` 06:00, `/api/cron/ad-scan` 07:00, `/api/cron/rescore` 08:00 UTC), which match the Edge Function calls seen that morning. Its crons were never switched off on 16 Sep. Fixed through the Vercel CLI (Tom's login): project paused, and its crons disabled (`crons.disabledAt` set). To undo: unpause in the Vercel dashboard and re-enable Cron Jobs in the project settings. Follow-ups: (a) check `function_edge_logs` shows no Outreach Engine calls on 22-24 Oct; (b, done) Tom deletes the `ANTHROPIC_API_KEY` secret under Supabase → Edge Functions → Secrets, so the 5 Anthropic-calling functions (`score-prospect`, `generate-brief`, `generate-contact-brief`, `generate-email`, `generate-insights`) can never spend even if called directly. Their source is in the `chiswick-calendar-outreach-engine` repo. `google-places` (paid Google API) is also uncalled now.
- **21 Oct 2026, blocker for Stage 1:** Docker Desktop is installed but cannot start because WSL is missing. Tom installs WSL (`wsl --install` in an admin terminal, then restart). Tom also deleted the Supabase `ANTHROPIC_API_KEY` secret.
- **21 Oct 2026, Stage 1 design:** `tasks_write_back_to_source()` (BEFORE UPDATE OF status, due_date on tasks) writes a tick to the source email: `reply_dismissed_at` for reply and editorial tasks, `intent_meta.done` for promises, clears `action_needed` for follow-up flags. Un-ticking reverses it. A snooze by Tom sets `signal_meta.snooze_until` (the engine flags its own updates with `cc.task_engine` so they aren't mistaken for snoozes). Reply tasks are dated the day the email arrived. Rules with their own source never reopen once ticked (`reopen_after_days` 36500); `invoice_overdue` keeps 7 days. Second bug found while doing this: pressing S on To-dos moved `due_date`, which the engine reset overnight, so snoozes never held.
- **Local copy of the live database:** the repo's migrations are incomplete (many changes went in through the dashboard or MCP), so the local database is built from a `supabase db dump` of live. That needs `npx supabase login` and `npx supabase link --project-ref ayoiibrzkllerrwbhvda`, which Tom runs himself because `link` asks for the database password. Dumps go in `supabase/.local/` (git-ignored) and are never committed.
- **21 Oct 2026, local Supabase working:** WSL installed, Docker Desktop running. Built with `npx supabase@2.121.0` (the repo's pinned 2.72.7 can't dump: "invalid secret format"). `supabase/config.toml` has migration replay and seeding switched off, because the local database is a copy of live, not a replay of the incomplete migrations folder. To rebuild it: `supabase db dump --linked -f supabase/.local/schema.sql`, the same with `--data-only --use-copy -f supabase/.local/data.sql`, `supabase start -x studio,imgproxy,mailpit,realtime,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta`, then `supabase db reset --local` and load both files with psql inside the `supabase_db_correspondence-clerk` container (data with `session_replication_role = replica`). In Git Bash set `MSYS_NO_PATHCONV=1`, or container paths like `/tmp/x.sql` get rewritten. Load gave 63 tables and 0 errors (2 harmless ones in Supabase's internal storage tables).
- **21 Oct 2026, Stage 1 tested locally:** migration applied in one transaction. A word-by-word diff against the saved originals shows `v_task_signals` changed only at the 3 intended points. `supabase/tests/stage1_done_sticks_test.sql` passes 8/8: ticks write back to the source (reply, promise, editorial, follow-up); a snooze is kept; three engine runs reopen nothing; engine updates aren't mistaken for snoozes; un-ticking restores the email and gives a single open task; reply tasks are dated by arrival. The first engine run after the change closed 18 reply tasks whose emails had already been marked done elsewhere (`reply_dismissed_at` set) but which the engine had ignored. The rollback restores the original view, function and settings exactly; re-applying afterwards also works. The baseline run before the change reopened 21 already-ticked tasks (10 lapsed renewals, 9 invoices), which is the reopen problem in action.
- **21 Oct 2026, Stage 1 live (Tom approved both):** `20261021_001_done_sticks` applied to live through MCP `apply_migration`. The md5 of `v_task_signals`, `v_inbound_tails` and `refresh_system_tasks` on live matches the locally tested copies exactly; trigger present; 11 backups under reason `stage1_done_sticks_2026_10_21`. Bulk close (Tom chose all four groups): 69 tasks closed, each backed up first under `stage1_bulk_close_2026_10_21` and noted on the task (`signal_meta.bulk_closed`): 31 where Tom had emailed the business since, 17 "Check the new record", 12 replies or editorial from unreviewed auto-created senders that weren't leads, 5 old automatic promises, 3 internal or community senders, 1 reply over 30 days old. A manual engine run then closed the 19 replies already marked done elsewhere and reopened 9 unpaid invoices (the intended 7-day money rule). **Live totals: open tasks 170 → 91, nav badge 146 → 64, overdue strip 63 → 25.** Hand-written to-dos (31) untouched.
- **21 Oct 2026, Stage 0 and 1 checks (Tom: no waiting periods):** Outreach Engine project is not live (Vercel `live: false`). `function_edge_logs` for the last 24 hours show the last Outreach Engine call at 08:40 UTC (`score-prospect`, `scheduled-sync`, `generate-contact-brief`), none since the pause. Engine: a dry run of `refresh_system_tasks(true)` inside a rolled-back transaction would open 0 and close 0 (111 live signals), so nothing ticked is coming back; no run row was left behind (last run id still 159). Open tasks 91. Tom first asked to drop the waiting periods, then put them back once it was clear they test something the same-day checks can't: no cron slot has passed since the pause, and no nightly engine run has happened since the migration.
- **21 Oct 2026, Stage 2 built and tested locally:** (1) `lib/inbound/utils.ts`: personal providers added (`btopenworld.com`, `cantab.net`, `nhs.net`, `gmx.co.uk`, `ymail.com`, `aol.co.uk`, and any `yahoo|hotmail|outlook|live|gmx|aol.<country>`); new `newBusinessRefusal()` refuses notification services (PayPal, Dropbox, Zoom, HMRC, Mailchimp, createsend, Stripe and others, matched on the registrable domain) and any sender on a subdomain (`news.paypal.com`, `x18z3o47.outinchiangmai.com`, `outlook.mail.microsoft`). Over the 132 sender domains of the 135 auto-created businesses: 7 personal, 20 refused, 105 still allowed. (2) `route.ts`: auto-created businesses get status `Unreviewed`; no more "Check the new record" task; a refused received email is kept in `inbound_queue` as `discarded`, a refused BCC'd sent email waits in the inbox as `pending`. (3) Bug found and fixed: the fuzzy name match compared the first label of the domain, so `email.stripe.com` matched the junk business "Mail", which on the local copy holds mappings for `outlook.mail.microsoft`, `pz-mailer.com`, `hotmail.it`, `mail.thegrocer.co.uk` (and, after the test, `email.stripe.com`). It now uses the registrable domain and never matches notification services. (4) Dashboard: Unreviewed businesses only show under a new "Unreviewed (N)" filter. Edit Business on an Unreviewed business says so, and saving marks it reviewed (Prospect, unless that box is unticked). (5) Migration `20261021_002_unreviewed_status`: the two contract triggers treat `Unreviewed` like `Prospect` (a contract in force makes it Active). `cc-live-export` needs no change: it only exports Active, Former and Prospect. Verified on a fresh local copy of live: `supabase/tests/stage2_unreviewed_test.sql` 3/3 (and fails on the old functions); rollback restores the function md5 exactly; webhook end to end on `next dev` against the local database with 8 made-up emails (new company → Unreviewed business, no task; Stripe and bulk subdomain → discarded; btopenworld → dropped; BCC to a bulk subdomain → inbox; real business on `mail.poshcockney.co.uk` still matched). Existing junk mappings and contacts still catch mail (PayPal test filed to the old "Paypal" business) until the cleanup. `npm run build` passes; eslint clean on the changed files. Not checked in the browser (logging in needs Tom's password).
- **21 Oct 2026, Stage 2 review answered and cleanup built:** Tom's choices (review page v2): MOVE 6, HIDE 52, KEEP 77, saved in `supabase/data-fixes/20261021_stage2_review_cleanup.sql`. It backs up every row it touches to `cc_phase0_backup` (reason `stage2_review_2026_10_21`), moves correspondence, tasks, `mail_scan`, `task_evidence`, `task_term_aliases`, cross-links and company domain links to the right business; a contact that matches one at the target by name or email gives it its addresses and is switched off, others move as they are; hidden and emptied records get status `Not a business`, lose their domain links and any open tasks; personal-provider domain links are removed everywhere. Guards refuse a second run, missing ids, overlap and any business with a contract. App: `getBusinesses()` and the business-name search skip `Not a business`. Tested on a fresh local copy of live: 64 businesses, 8 contacts, 14 correspondence, 62 domain links, 9 tasks, 11 mail_scan rows backed up; 59 domain links removed (0 personal ones left); 58 marked Not a business with their 138 emails kept; Sabrina Shropshire and Chris Parker joined their existing contacts; open tasks unchanged at 91. Undo (`..._undo.sql`) restores every row; a column-by-column check finds only `updated_at` differs (update triggers re-stamp it). Build passes. Noticed: LIVING ROOM AT THE CHISWICK also has a contact called "Contact" (`mazurmariana20@gmail.com`), probably Mariana; left for Tom.
- **Next session starts here:**
  1. **On 22 Oct (any time after 08:30 UTC), re-run both checks:** (a) MCP `query_logs` on `function_edge_logs` for 22 Oct: no calls to `score-prospect`, `scheduled-sync`, `read-sheet`, `ad-scanner`, `generate-*` (the Outreach Engine's crons were 06:00, 07:00, 08:00 UTC). Repeat on 23 and 24 Oct, then mark Stage 0 fully done. (b) `select * from system_task_runs order by ran_at desc limit 3`: the 02:10 run on 22 Oct should reopen nothing except `invoice_overdue` (unpaid invoices come back after 7 days by design). Also compare open tasks with 91. If either check fails, stop and tell Tom before Stage 2.
  2. **Stage 2 is waiting on Tom's go-ahead for live**, in this order, each step separately: (a) apply migration `20261021_002_unreviewed_status` (expected fingerprint `181e05394cee842c9d972f64d7079b9c`, md5 of the two functions' `pg_get_functiondef` concatenated in name order); (b) merge `ui-overhaul` to `main`, which deploys the new email rules and the `Not a business` filter; (c) run `supabase/data-fixes/20261021_stage2_review_cleanup.sql` on live (re-check first that the 6 move targets and 52 hides still exist; the script's own guards also check). Then the regression checklist, and Stage 2 is done.
  3. Nothing is half-done. Nothing is pushed. The local database has test rows from the webhook check (business "Freshlocalshop Test", a few test emails); rebuild it before the next local test.
