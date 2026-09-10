# Daily outreach routine: dry run 1

**Date:** 2026-09-10
**Mode:** DRY RUN. Nothing sent. No records written.

Six businesses assessed. **Two cleared, three blocked, one held.**

The three blocks are the headline. All three passed every database check cleanly and would have been sent under a database-only routine. The mailbox check caught all three.

---

## Result

| Business | Verdict | Why |
|---|---|---|
| WEST 4 GYM | **CLEAR** | No history anywhere. Address confirmed W4 4LD. |
| LA MENSWEAR | **CLEAR** | No history anywhere. Address confirmed W4 1RG. |
| FUSHI WELLBEING | **BLOCKED** | Existing Club Card business |
| HEALTH SHAK | **BLOCKED** | Lapsed Club Card member, already chased to re-join |
| BAYLEY & SAGE | **BLOCKED** | Former member who explicitly declined to renew |
| Brook & Green | **HELD** | Genuinely new and a good fit, but no verified contact yet |

---

## The three blocks, in detail

### FUSHI WELLBEING

Database said: `outreach_stage = identified`, zero correspondence rows, no contract, `is_club_card = false`, `is_advertiser = false`. Clean cold prospect on every count.

Mailbox said otherwise. **Four Fushi addresses appear on the recipient list of an info@ email dated 2024-11-04 addressed "Dear Club Card Members"**: `rannesh@fushi.co.uk`, `ria@fushi.co.uk`, `mamta@fushi.co.uk`, `anne-claire@fushi.co.uk`. Separately, Rannesh Jansari wrote to info@ on 2025-08-26 as "a long-time reader of your newsletter and a resident of Chiswick".

Pitching him the Club Card as though he had never heard of it would have been a bad look.

### HEALTH SHAK

Database said: identical clean cold prospect.

Mailbox said: info@ emailed `tania@healthshak.co.uk` and `david@healthshak.co.uk` on 2024-09-19, subject **"Re: Re-joining the Chiswick Calendar Club Card"**, body "Just following up on this again. As we head into Autumn let me know if there's any appetite on your end". A lapsed member who had already been chased at least twice.

Also worth fixing: our contact record has `tania@healthshak.co`. The real address is `tania@healthshak.co.uk`. The stored domain is wrong, so the send would have bounced or reached a stranger.

### BAYLEY & SAGE

Database said: clean cold prospect.

Mailbox said: info@ emailed Annabel Lintott on 2019-03-05, "**I know you decided not to renew your membership with the club card as it wasn't working for Bayley & Sage**, however it would be great to discuss advertising".

An explicit past decline. Nothing in Correspondence Clerk records it, because the decline lives only in a 2019 email.

---

## The two that cleared

### WEST 4 GYM
- Contact: Paul Lovelace, `info@west4gym.co.uk`
- Address: **10a Sutton Lane North, Chiswick W4 4LD** (verified via Yelp and the gym's own site)
- tom@ mailbox: no history, checked by recipient and sender domain
- info@ mailbox: no relevant history
- Correspondence, contracts, QBO: all clean. Not Club Card, not advertiser.
- Note: `info@` is a generic address rather than a personal one. Flagging because your rules ask for a real named contact. We have the name (Paul Lovelace) but not a personal address.

### LA MENSWEAR
- Contact: Henrik Hansen, `henrik@lamenswear.co.uk`
- Address: **11a Turnham Green Terrace, Chiswick W4 1RG** (verified)
- tom@ and info@ mailboxes: no history at all
- Correspondence, contracts, QBO: all clean. Not Club Card, not advertiser.
- Named contact on the business's own domain. This one meets every rule as written.

---

## The one held: Brook & Green

Found by web search, not from any list. **142 Chiswick High Road, W4**, an 89-cover all-day restaurant and wine room opening **end of September 2026**. Owner-operator **Tim Price**.

Not in Correspondence Clerk at all. A new W4 restaurant opening in about three weeks is close to an ideal Club Card or Featured Article prospect, and the Featured Article angle writes itself.

**Held because no email address is published yet.** The routine would keep working it: the restaurant's own site once live, Companies House, Instagram. It should not guess an address, and it should not send to a PR agency.

---

## The email that would have gone out

To Henrik Hansen at LA Menswear, from tom@thechiswickcalendar.co.uk, BCC `info-utbz@correspondenceclerk.com`, with **Chiswick Calendar Rate Card.pdf** attached.

> **Subject:** Promoting your business to Chiswick's most-read local audience
>
> Hello,
>
> I'm Tom, commercial lead at The Chiswick Calendar. We're a Community Interest Company covering Chiswick, W4 and W6, and we're now the biggest local news website in the area, reaching around 50,500 monthly users and over 126,000 page views a month, alongside a weekly newsletter to more than 18,500 subscribers with roughly a 50% open rate.
>
> I wanted to flag a couple of ways your business could work with us, and I've attached our current rate card, which covers everything in more detail.
>
> **Club Card**
>
> Around 90 local businesses are already part of our Club Card scheme. For £250 a year, you get a dedicated page on our website, an introduction in the newsletter, ongoing mentions across the year, social media promotion, and window stickers so customers know you're part of the scheme. In return, you offer our readers a small discount or perk, whatever suits your business.
>
> You can see live examples of current member pages and offers in our Club Card A-Z directory.
>
> **Display advertising**
>
> If you're after more visible, ongoing brand presence, we also offer leaderboard and side panel advertising across the site, with rates from £140 a month depending on position and term. Full specs and pricing are in the attached rate card.
>
> **Featured Articles**
>
> If you have a story to tell, a launch, a new menu, a course, an anniversary, we can produce a dedicated article about your business, published on the site and included in the newsletter, from £300.
>
> Because our content is almost exclusively about Chiswick, the people seeing this are either local residents or people with a strong connection to the area, so you're not paying to reach anyone outside your actual customer base.
>
> Take a look at the attached rate card and let me know which option, or combination, makes the most sense. Happy to talk it through if useful.
>
> Best,
> Tom Apperley
> Content Manager
> [chiswickcalendar.co.uk](http://www.thechiswickcalendar.co.uk/)
> tom@thechiswickcalendar.co.uk

Verbatim from your brief. No em dashes. No name or business merge field, so nothing can go out unfilled.

---

## How Correspondence Clerk gets updated

Mostly it already does, using the work from the kanban job.

**For a business already in CC:** send with the BCC, Forward Email hits the webhook, the webhook files a correspondence row as `direction = 'sent'`, `source = 'webhook_bcc'`, and the trigger I added recomputes the stage and moves the card from Identified to Contacted. No new writing code needed. Verified working: 24 sent rows landed this way in the last seven days, most recent yesterday.

**For a newly discovered business like Brook & Green:** the routine must create the business and contact records in CC *before* sending. Otherwise the BCC arrives with nothing to match and drops into `inbound_queue` unmatched. So the order is create, then send, then let the webhook and trigger close the loop.

---

## What this run says about volume

Five a day is not reachable from the database pool, and today shows why more sharply than yesterday's counts did. Of the five strongest candidates the database can produce, **three were disqualified by history the database has no record of**. The pool is not just thin, parts of it are actively wrong.

The web discovery arm works, and Brook & Green is the kind of prospect worth having. But discovery produces businesses without contact details, so enrichment is the bottleneck rather than finding them.

Realistic near-term rate is one to three a day, rising as discovery and enrichment bed in. I would rather send two good ones than pad to five.

---

## Checks the routine runs, in order

1. **Database gates.** Not Club Card, not advertiser, no contract past or present, no QBO link, not muted, no decline recorded, not Former/Inactive/Closed.
2. **Correspondence table**, including `linked_business_ids`, and name-siblings so a second row for the same business is caught.
3. **tom@ mailbox**, by recipient domain and sender domain. Precise.
4. **info@ mailbox**, by contact email then business name. Note Graph free-text search is relevance-ranked and returns loosely related results, so hits are read and judged rather than counted. Searching info@ for "Virgin Active" returns PayPal receipts.
5. **Calendar**, for anything booked.
6. **Web verification.** Address in W4, W6 or immediately adjacent. Business still trading. Contact still in post.
7. **Contact quality.** Real named person, business-owned domain, not freemail, not a PR agency, not internal to the Calendar.

---

## Still open

- The bad `virgin.net` to VIRGIN ACTIVE domain mapping is still in place. Every email from that consumer ISP domain auto-files to Virgin Active. Say the word and I will remove it and add virgin.net to `PERSONAL_DOMAINS`.
- HEALTH SHAK's contact email in CC has the wrong domain (`.co` for `.co.uk`). There may be more like it. Worth a sweep.
