---
name: correspondence-clerk-db
description: >
  Look things up in Tom's Correspondence Clerk (the Chiswick Calendar CRM in Supabase). Use this
  skill whenever Tom asks about any business, member, advertiser, prospect or contact: "what's the
  deal with X", "when did we last hear from X", "who's renewing next month", "what did Dawn say
  about X's ad", "who owes us money", "who was it who said they wanted ...", "how many Club Card
  businesses did I speak to in April", "look up X", "check Correspondence Clerk", "pull up their
  correspondence", or when drafting outreach, renewal or chase emails that need CRM context.
  Read this before querying: one call, business_dossier, returns everything about a business, and
  the old deal columns on businesses are empty, so querying tables by hand gives wrong answers.
  The Supabase MCP connector is available; no need to ask Tom for credentials.
---

# Correspondence Clerk: how to look things up

Correspondence Clerk (https://correspondenceclerk.com) holds The Chiswick Calendar's businesses,
deals, contacts, every forwarded/BCC'd/swept email, QuickBooks invoices, Club Card pages,
newsletter mentions, news articles, to-dos and the routines' drafts.

- **Project ID:** `ayoiibrzkllerrwbhvda` (Supabase MCP, `execute_sql`). Load the Supabase MCP tools first if they aren't loaded.
- **Read only.** Never INSERT, UPDATE or DELETE unless Tom asks for that specific change in this chat. Say what you would change and wait for his yes.
- Today's date in the data: `SELECT cc_today();` (London date). Dates to Tom in British format (30/10/2026).

## Step 1: always start with one of these four calls

### Everything about one business

```sql
SELECT business_dossier('killik');
```

Takes a name (any part of it; case and punctuation ignored, so `archies` finds "Archie's London") or an id.
Merged records resolve to the surviving business. Returns one JSON document:

| Key | What it holds |
|---|---|
| `business` | name, status, category, type, website, address, phone, notes, last in touch, renewal and outreach stage, `merged_from` |
| `deal` | `current` contract (type, start, end, amount, terms, paid, `days_to_end`) and `history` (all contracts) |
| `money` | `owed_total`, `overdue_total`, `open_invoices`, `recent_invoices` (paid/voided flagged), QuickBooks customer, `do_not_chase` (Tom's "let them go" decisions) |
| `contacts` | main contact (and whether Tom chose it), every contact with role, emails, phones, active flag |
| `attention` | why it is on Today: reason (`money_owed`, `renewal`, `waiting_on_you`, `todo`, `club_card`, `club_card_lapsed`), detail, since, snoozed |
| `correspondence` | totals, first date, `last_received`, `last_sent`, the 20 most recent emails/calls/meetings (date, direction, subject, contact, cleaned text cut to 700 characters) and the 10 latest notes |
| `todos` | open to-dos (hand-written ones first) and the last 5 done |
| `calendar` | to-dos, deal ends and invoice due dates from a week ago to 90 days ahead |
| `club_card` | card state (member, grace, lapsed, none), the website page, offer and its end date, page checks |
| `newsletter` | last featured, mentions in the last 12 months, recent mentions with the issue link |
| `news_articles` | count and the 10 most recent articles about them |
| `outreach` | stage, the Work on next bucket and fit score, the routines' drafts, prospect leads |
| `data_health` | anything on the Data health page for this business |
| `app_url` | link to the business page; give it to Tom when useful |

If the name matches several businesses equally well you get `"ambiguous": true` and a
`candidates` list (id, name, status, category). Pick the obvious one if Tom's wording makes it
clear, otherwise ask him which, then call again with the id. `"found": false` with no candidates
means nothing matched: try a shorter part of the name, or `find_businesses('{"q": "..."}')`.

If a business shows no emails, check `search_everything('"business name"')`: their emails may be
filed under the person who wrote them.

To keep a reply short, pull only the parts needed:

```sql
SELECT d->'deal', d->'money', d->'attention' FROM business_dossier('killik') d;
```

### "Which businesses ..." questions

```sql
SELECT find_businesses('{"ends_from": "2026-11-01", "ends_to": "2026-11-30", "order": "ends"}');
```

Every filter is optional; combine them. Returns `total`, `shown` and one line per business (name,
status, category, current deal and end, `deals_in_force`, attention reason, owed, last in touch,
card state, last featured, main contact and email). Call `business_dossier(id)` for detail.

| Filter | Meaning |
|---|---|
| `q` | part of the name |
| `status` | `"Active"`, `"Former"`, `"Prospect"`, `"Unreviewed"`, or a list |
| `category` | e.g. `"Food & Drink"`, `"Health & Beauty"`, `"Retail"` |
| `deal` | `"club_card"` (member or in grace, same as the Club Card tab), `"advertiser"`: a deal of that kind running or ended within 60 days |
| `card_state` | `"member"`, `"grace"`, `"lapsed"`, `"none"`, or a list |
| `ends_from`, `ends_to` | a deal ends in this range and hasn't already been renewed ("who's renewing next month") |
| `renewal_stage`, `outreach_stage` | stage names as in the app |
| `bucket` | Outreach Work on next bucket: `reply`, `chase`, `follow_up`, `close`, `new`, `find_contact`, `waiting`, `tidy_*` |
| `attention` | `"money_owed"`, `"renewal"`, `"waiting_on_you"`, `"todo"`, `"club_card"`, `"club_card_lapsed"` |
| `owes_money` | `true`: open QuickBooks balance |
| `quiet_days` | nothing in or out for at least N days |
| `featured_since` | in the newsletter on or after this date |
| `email_text` | words that appear in their emails or notes |
| `include_hidden` | `true` also lists "Not a business" and merged records |
| `order` | `"name"` (default), `"ends"`, `"last_in_touch"`, `"owed"` |
| `limit` | default 50, at most 200 |

### Searching inside emails

```sql
SELECT search_correspondence('Archies ad', 'Dawn Wilson', 10);
```

Full-text search over every email and note (same index as the app's search; web-search syntax:
`"exact phrase"`, `-word`, `or`). Second argument (optional) limits it to one business by name or
id; third is how many (default 20, at most 50). Results newest first with business, direction,
subject, contact and text (cut to 900 characters).

People are filed under their own business: Dawn Wilson's emails are on **Dwmultimedia** (her
"Dawn Wilson" record was merged into it), so "what did Dawn say about Archies' ad" is
`search_correspondence('Archies', 'Dawn Wilson')`, or `search_correspondence('Archies ad stats')`
across everyone. Tom's own replies to the business sit on the business itself.

### Searching everything, across all businesses

```sql
SELECT search_everything('wanted sidebar', '2026-01-01', NULL, 25);
```

For "who was it who said they wanted …", "did anyone mention …". Arguments: words (same
web-search syntax), optional from and to dates, how many (default 25, at most 100). Searches
emails, calls, meetings and notes, business and contact notes, to-dos, newsletter items and the
routines' drafts. Returns `total`, `by_kind`, `businesses_matched` (all matches, not just those
shown), then results newest first: kind, date, business and id, contact, title and a snippet
with the matched words in `**bold**`. Open a promising one with `business_dossier(business_id)`.

## Not in the database yet (say so; don't guess)

These arrive one by one in Stage 17b. Until then, if a question depends on them, tell Tom it isn't
in Correspondence Clerk yet, and offer what is there (for example emails that mention it) clearly
labelled as that, not as the answer:

- **Freebie entries and Eventbrite** ticket sales or attendees (so "how many businesses have done
  Freebie entries" can't be counted; `search_everything('freebie')` only finds emails and notes
  that mention the word).
- **Sent email that wasn't BCC'd or forwarded** in, and email nobody forwarded.
- **Google Drive documents** (contracts, media packs, proposals).
- **Ad stats** (Google Analytics figures from Dawn or James) as data: only the emails they sent, if forwarded.
- **Full QuickBooks history**: the app holds a partial copy (about 180 of some 780 invoices).
- **Mailchimp opens and clicks**, **Companies House** details for members, and website pages beyond Club Card.

## Counting across businesses (tested recipes)

Use these for period and "how many" questions; change the dates. Deal types in `contracts`:
`club_card`, `advertiser`, and `former_club_card` / `former_advertiser` for earlier terms of a
business that later stopped. A term "covers" a period when it starts on or before the period's
end and ends on or after its start.

**Club Card businesses Tom was in touch with in a month** (April 2026 below):

```sql
WITH cc AS (SELECT DISTINCT business_id FROM contracts
  WHERE membership_type IN ('club_card','former_club_card')
    AND coalesce(contract_start,'1900-01-01') <= '2026-04-30' AND coalesce(contract_end,'2999-01-01') >= '2026-04-01')
SELECT b.name, count(*) AS entries
FROM cc JOIN v_businesses b ON b.id = cc.business_id
JOIN correspondence c ON (c.business_id = b.id OR b.id = ANY (coalesce(c.linked_business_ids,'{}')))
WHERE c.type::text IN ('Email','Email Thread','Call','Meeting')
  AND c.entry_date >= '2026-04-01' AND c.entry_date < '2026-05-01'
GROUP BY b.name ORDER BY entries DESC;
```

For advertisers use `('advertiser','former_advertiser')`. Members in force on a date (matches the
Club Card tab's member count): `membership_type = 'club_card' AND coalesce(contract_start,'1900-01-01') <= :date AND contract_end >= :date`.

**Emails received and sent per business in a date range:**

```sql
SELECT b.name, count(*) FILTER (WHERE c.direction = 'received') AS received,
       count(*) FILTER (WHERE c.direction = 'sent') AS sent
FROM correspondence c JOIN v_businesses b ON b.id = c.business_id
WHERE c.type::text LIKE 'Email%' AND c.entry_date >= '2026-10-01' AND c.entry_date < '2026-11-01'
  AND coalesce(c.ai_metadata->>'source','') <> 'quickbooks_notice' AND coalesce(b.is_commercial, true)
GROUP BY b.name ORDER BY count(*) DESC LIMIT 20;
```

**Renewals due in a month** (skips terms already renewed): `find_businesses('{"ends_from": "2026-11-01", "ends_to": "2026-11-30", "order": "ends"}')`, or by hand:

```sql
SELECT b.name, c.membership_type, c.contract_end, c.contract_amount
FROM contracts c JOIN v_businesses b ON b.id = c.business_id
WHERE c.membership_type IN ('club_card','advertiser') AND c.contract_end BETWEEN '2026-11-01' AND '2026-11-30'
  AND NOT EXISTS (SELECT 1 FROM contracts n WHERE n.business_id = c.business_id
                  AND n.membership_type = c.membership_type AND n.contract_start > c.contract_start)
ORDER BY c.contract_end, b.name;
```

**Money owed** (open, not voided; overdue = past due date). Per business: `find_businesses('{"owes_money": true, "order": "owed"}')`. Totals:

```sql
SELECT count(DISTINCT l.business_id) AS businesses, sum(i.balance) AS owed,
       sum(i.balance) FILTER (WHERE i.due_date < cc_today()) AS overdue
FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
WHERE i.balance > 0 AND i.voided_at IS NULL AND coalesce(i.private_memo,'') <> 'Voided';
```

Today's "Money owed" list is narrower (past due and not chased in the last 7 days):
`SELECT * FROM v_business_attention WHERE 'money_owed' = ANY (reasons);`

**Newsletter mentions in a period** (`status = 'confirmed'`; `unclear` ones are waiting for Tom):

```sql
SELECT b.name, count(*) AS mentions, max(i.sent_at)::date AS last
FROM newsletter_mentions m JOIN newsletter_issues i ON i.id = m.issue_id JOIN v_businesses b ON b.id = m.business_id
WHERE m.status = 'confirmed' AND i.sent_at >= '2026-09-01' AND i.sent_at < '2026-10-01'
GROUP BY b.name ORDER BY mentions DESC;
```

**Outreach** stage counts and the Work on next buckets (as on the Outreach tab):

```sql
SELECT coalesce(outreach_stage, '(none)') AS stage, count(*) FROM v_businesses
WHERE merged_into IS NULL AND coalesce(status,'') <> 'Not a business' GROUP BY 1 ORDER BY 2 DESC;
SELECT bucket, count(*) FROM v_outreach_next GROUP BY 1 ORDER BY 2 DESC;
```

## Step 2: answer from what came back

- **The deal is in `contracts`, never on `businesses`.** `businesses.is_club_card`, `is_advertiser`,
  `contract_start`, `contract_end`, `contract_amount` and `deal_terms` were emptied on 23 Oct 2026
  and are not kept up to date. If you query by hand, read deals from `contracts`
  (`is_current`, `membership_type` club_card / advertiser / former_*), status from `v_businesses`.
- A business can hold two deals at once (a Club Card and an advert): look at `deal.history` or
  `deals_in_force`, not only `deal.current`.
- Status: Active = a deal in force or ended within 60 days; Former = had a deal; Prospect = never;
  Unreviewed = created automatically from an email and not yet checked by Tom; "Not a business" =
  hidden (kept for its emails).
- Money: QuickBooks in the app is a partial copy (not every invoice since 2019 yet). Voided
  invoices don't count. If `do_not_chase` is set, don't suggest chasing.
- Email text is the cleaned body (quoted chains removed). Quote Tom's and the business's words
  exactly; don't paraphrase them as if quoting.
- Never invent: no made-up dates, amounts, offers or promises. If something isn't in the data,
  say so ("nothing on file since 07/10/2026").
- Check "Not in the database yet" above before answering; if the answer depends on one of those,
  say so and offer to look in Outlook/Gmail if those tools are on.
- For counts, say what was counted ("37 Club Card businesses had an email, call or meeting
  logged in April") so Tom can tell a filing gap from a real zero.

## Hand-written SQL (only when the calls and recipes can't answer)

Current objects worth knowing (all in `public`):

| Object | Use |
|---|---|
| `v_businesses` | businesses with worked-out status, `deal_state`, `current_contract_id`, `main_contact_id`, `is_commercial`, `website` |
| `contracts` | every deal (one row per term) |
| `contacts` | `emails` and `phones` are JSON arrays; `is_primary` = Tom's chosen main contact |
| `correspondence` | `entry_date`, `direction` (`received` / `sent`), `type` (Email, Note, Call, Meeting), `subject`, `formatted_text_current`, `linked_business_ids` (shared entries) |
| `v_business_attention` | the Today list: one top reason per business |
| `qbo_invoices` + `qbo_links` | invoices and which business they belong to (`voided_at`, `private_memo = 'Voided'`) |
| `v_club_card_members`, `club_card_pages` | Club Card state, page and offer |
| `v_business_newsletter`, `newsletter_mentions`, `newsletter_issues` | newsletter appearances |
| `business_articles` | news articles about a business (`status` confirmed/rejected) |
| `v_outreach_next` | Outreach Work on next buckets |
| `routine_drafts` | drafts written by the Claude routines |
| `tasks` | to-dos (`source = 'manual'` are Tom's; others feed the desk email) |
| `v_data_health` | records that need tidying |

Match names with `cc_name_key(name) LIKE '%' || cc_name_key('term') || '%'` (ignores punctuation),
skip `merged_into IS NOT NULL` rows, and keep result sets small (`LIMIT`, pick columns).

## Key business context

- **Club Card:** yearly membership for local businesses (listing page on chiswickcalendar.co.uk with an offer, editorial benefits).
- **Advertisers:** paid display adverts (sidebar, leaderboard, mobile sticky), featured articles and money blogs; separate from Club Card.
- Ad stats come from Dawn Wilson (dwmultimedia.co.uk) and James Willcocks by email.
- Tom: tom@thechiswickcalendar.co.uk / info@thechiswickcalendar.co.uk; signs off "Tom / The Chiswick Calendar".
- The Mastersheet (Google Sheets) was retired on 22 Oct 2026; Correspondence Clerk is the only record now.

## Keeping this skill right

This skill is a reader of the database. When a stage changes where a fact is stored, it updates
`business_dossier` / `find_businesses` and this text in the same go-live (Correspondence Clerk
`docs/ui-overhaul-plan.md`, "Who reads what"). The repo copy is
`docs/skills/correspondence-clerk-db/SKILL.md`.
