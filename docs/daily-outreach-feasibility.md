# Daily outreach routine: pre-build verification

**Date:** 2026-09-10
**Status:** Nothing built, nothing sent. Three blockers need your decision first.

You asked me to verify three things before building. All three came back with problems, and a fourth turned up that I think is the most important finding here.

---

## 1. Mail access: I cannot search either work mailbox, and I cannot send as you

Verified, not assumed. The Gmail connector in this session is authenticated as **`tomapperley8@gmail.com`**, your personal account. Confirmed two ways: the calendar list returns `tomapperley8@gmail.com` plus your "Work stuff" and Brentford/Arsenal calendars, and every thread matching `thechiswickcalendar.co.uk` is a Calendar newsletter *received at* the personal account, not mail from inside the work mailbox.

What that means against your source-of-truth cascade:

| Check | Available? |
|---|---|
| 1. `correspondence` table | Yes |
| 2. Search `tom@` and `info@` mailboxes | **No. Neither.** |
| 3. `contracts` / `qbo_invoices` / `qbo_links` | Yes |
| 4. Calendar | Partly. Personal and "Work stuff" only, no Chiswick-domain calendar |

You were explicit that info@ carries a lot of commercial traffic and must be searched every time. I cannot do that from here, so check 2 would silently be skipped on every single send. That alone is enough reason not to switch auto-send on.

Separately, the Microsoft/Outlook connector **failed to connect this session** (31 tools dropped out mid-session). If tom@ and info@ are on Microsoft 365, that connector is probably the route to them, and it needs reconnecting before any of this can work.

I also will not send through the Gmail connector as a workaround. It would send cold commercial outreach from `tomapperley8@gmail.com`, a personal freemail address, signed "Tom Apperley, Content Manager". That is the exact thing your own contact rules disqualify a prospect for, and it would be worse coming from us.

---

## 2. Where it should run: proposal, plus a blocker

**Proposal:** a Vercel cron in the existing Next.js app at `/api/cron/daily-outreach`, alongside the eight crons already in `vercel.json`. Same auth pattern as the others (`CRON_SECRET`), same Resend dependency, deploys with the app, logs where you already look. A standalone script would need somewhere to live and its own scheduler.

**Blocker:** sending as `tom@thechiswickcalendar.co.uk` through Resend needs `thechiswickcalendar.co.uk` verified as a sending domain in the Resend account. Today the app only ever sends from `correspondenceclerk.com`. Can you confirm whether thechiswickcalendar.co.uk is verified in Resend? If it is not, the routine cannot send as you at all, whatever else we build. Worth checking before I write any code.

---

## 3. Existing outbound mail: there is no path to reuse, and no BCC today

I checked all of it before proposing anything new.

| Where | Sends as | BCCs ingestion? |
|---|---|---|
| `lib/email.ts` | `noreply@correspondenceclerk.com` | No |
| `lib/email/briefing-email.ts` | Correspondence Clerk | No |
| `lib/marketing/sequence-runner.ts` | Correspondence Clerk | No |
| `app/api/cron/scan-articles/route.ts` | `noreply@correspondenceclerk.com` | No |

**No existing code sends as you, and no outbound path BCCs anything.** The BCC ingestion is inbound-only: you BCC `{token}@correspondenceclerk.com` from your own mail client and `app/api/inbound-email/route.ts` catches it and files it as `direction = 'sent'`. So the BCC would be new code, not a reuse.

One naming trap worth knowing, since it would be easy to wire up backwards:

| Token / BCC address | That profile's own address |
|---|---|
| `tom-pgfi@correspondenceclerk.com` | info@thechiswickcalendar.co.uk |
| **`info-utbz@correspondenceclerk.com`** | **tom@thechiswickcalendar.co.uk** |

The address you gave me, `info-utbz@`, is the right one for mail sent from tom@, despite reading like the opposite. Confirmed in `user_profiles`.

---

## 4. The finding that matters most: the data cannot support five a day

You said both pools are thin and to enrich one at a time rather than bulk-cleaning. That is fine as an approach, but the numbers are worse than "thin", and one of the gaps is a correctness problem rather than a volume problem.

### `oe_prospects` (1,014 rows)

| | Count |
|---|---:|
| Has an email | 703 |
| Has any location at all | 115 |
| Has a W4/W6 postcode | 57 |
| **Has both an email and a postcode** | **0** |

Not one row in the table has both. The rows with emails and the rows with locations are disjoint sets, presumably populated by different discovery runs. So `oe_prospects` cannot currently yield a single prospect that satisfies both "confirmed address in W4/W6" and "a real named contact", without external enrichment on every one.

### `businesses` at `identified` with zero correspondence (391 rows, post-derivation)

| | Count |
|---|---:|
| Has an email on the business record | **0** |
| Has an address on the business record | **0** |
| Has at least one `contacts` row | 369 |
| Contact has an email | 263 |
| **Contact has a non-placeholder name** | **27** |

Zero addresses means the "confirmed address in W4, W6 or immediately adjacent" test cannot be satisfied from the database at all, for any business in the pool.

I pulled all 25 of the best candidates (real contact name plus an email). Applying your own rules to them by hand:

- **Bridget Osborne is listed as the contact for three of them** (EXCEL SPORTS, SPRINKLEDMAGIC, THE STABLE PIZZA RESTAURANT) at `bridget.osborne@gmail.com`. That is your own editor. Auto-send would have cold-pitched the Calendar's editor three times.
- Two are PR agencies: HONEST BURGERS via `toniccomms.co.uk`, ORANGE TREE THEATRE via `katemorleypr.com`. Your rules exclude both.
- Six are freemail: yahoo, aol, hotmail, outlook, gmail.
- Several "names" are junk: `<>` for DAYFRESH, "at the" for HONEST BURGERS, "Sureno (the Son, tattooist)" for CAVALLEROS.

After exclusions, roughly **five to eight are even arguably viable**, in total, not per day, and each still needs its address verified externally.

### The duplicate-row problem, which is a correctness bug not a volume one

Your check 1 is "the correspondence table on this business". That is not sufficient, because the same business exists on multiple rows.

- **VIRGIN ACTIVE** is at `in_discussion`, last contacted 2026-07-01.
- **VIRGIN ACTIVE (CHISWICK RIVERSIDE)** is `identified`, zero correspondence, and has a named contact, so it lands in the candidate list.

A per-business-id correspondence check passes it as a clean cold prospect. Sending would cold-pitch a company we are mid-conversation with, which is exactly what your "never contradict or repeat anything already said" rule exists to prevent. Same pattern with UP & RUNNING and UP AND RUNNING CHISWICK.

**141 of the 391** zero-correspondence identified businesses have a name-twin elsewhere in the data that has correspondence history or a live relationship. That is 36% of the pool. Any version of this routine has to match on name similarity across the whole table, not just on `business_id`, or it will do this repeatedly.

---

## What I need from you

1. **Mail.** Can you reconnect the Microsoft/Outlook connector, or tell me what the right route to tom@ and info@ is? Without mailbox search, check 2 never runs.
2. **Resend.** Is `thechiswickcalendar.co.uk` verified as a sending domain?
3. **Cron in the Next.js app** as proposed, or somewhere else?
4. **Volume.** Five a day is not achievable on this data. Options as I see them:
   - (a) Run at whatever volume passes the checks, some days zero, and report why.
   - (b) Build an enrichment step first so the pool can actually support five.
   - (c) Keep five a day but with me surfacing candidates for you to verify, which means it is not really auto-send.

   My recommendation is (a) now and (b) over time. Never lower the bar to hit a number.
5. **Auto-send.** Given that check 2 and the address test cannot currently run, I would not turn auto-send on yet, even once the pool exists. Dry-run only until mailbox search works.

---

## Still on the list, not part of this

194 businesses have a current contract but neither `is_club_card` nor `is_advertiser`, so the renewal board sees 111 of 302 live contracts. Separate piece of work.
