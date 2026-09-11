# Correspondence Clerk: data and automation audit

**Date:** 2026-09-11
**Status:** Audit and plan. Nothing changed yet.

---

## The headline

There are two separate problems, and only one of them is messy data.

**1. A bad import in March 2026 put 193 prospect records into the `contracts` table.** They are not contracts. They have no dates, no amounts, and their `deal_terms` field contains prospect research notes like `Category: Dental | Website: whitedentalrooms.com` and outreach log entries like `21/08/25 - Follow up email sent, after no reply to previous`. That single fact is behind most of what looks like chaos.

**2. Almost nothing is automated.** Email is the only event in the whole system that updates Correspondence Clerk on its own. Invoices, payments, contracts and renewals are all manual.

Everything below follows from those two.

---

## Part 1: what actually updates automatically today

| Event | What happens now | Automated? |
|---|---|---|
| Email received from a business | Forward Email to webhook, files a `correspondence` row, updates `last_contacted_at`, trips the stage trigger | **Yes** |
| Email sent (BCC'd to `info-utbz@`) | Same path, files as `direction = sent` | **Yes** |
| Correspondence added or deleted | Stage recomputes via `derive_business_stages()` | **Yes** (built this week) |
| Contract added with a membership type | `is_club_card` / `is_advertiser` set, status promoted to Active | **Partly** |
| Contract added without a type | Nothing at all | **No** |
| Business wins a deal | `renewal_stage` set, outreach block cleared | **No.** A button someone has to press |
| Invoice raised in QuickBooks | Nothing | **No** |
| Invoice paid in QuickBooks | Nothing | **No** |
| Contract approaching expiry | Nothing. A view can compute it, nothing acts on it | **No** |
| Business declines | Manual, and deliberately so | **No, correctly** |

The whole database has **three** triggers that do real work. Everything else is `updated_at` housekeeping. There is **one** scheduled job, `refresh-system-tasks`, at 02:10 daily.

---

## Part 2: what the audit found

### 2.1 The 193 fake contracts

`contracts` has 388 rows. Of the 303 marked `is_current`:

| Membership type | Rows | Flag set correctly |
|---|---:|---|
| `club_card` | 93 | 93 |
| `advertiser` | 16 | 16 |
| **NULL** | **194** | **0** |

Of those 194, **193 have no start date, no end date and no amount**. They were all created on 2026-03-20 in one batch. Their `deal_terms` holds prospect notes.

The one real exception is **HEN CORNER**: a genuine contract, 2026-05-29 to 2027-05-28, £150, created 25 June, that simply never got a membership type. It is wrongly missing from the renewal board.

**This is not flag drift, and `sync_business_flags_from_contracts` is not broken.** It sets a flag only for `club_card` or `advertiser`, so a NULL type sets neither. It behaved correctly on bad input.

**The problem is historic, not ongoing.** 226 untyped contracts were created in March 2026. Since April, every contract except Hen Corner has been properly typed. The app does this right. A `NOT NULL` constraint would stop it recurring for good.

**Consequences, three of them:**

- The renewal board sees 111 businesses, not 302. That gap is entirely these rows.
- **My kanban derivation excluded 193 real prospects as `graduated_to_renewal`.** The rule "has ever held a contract means renewal-side" is right, but these businesses never held a contract. That is a bug I introduced on your data, and clearing these rows fixes it.
- The outreach routine will not consider any of those 193 either, for the same reason.

### 2.2 The contact book is mostly placeholder

1,273 contacts. **803 of them are literally named "Contact"** — 63% of the book, all from the same March import. A further 10 are named "Info", "Team", "at the" or `<>`. 363 have no email address at all.

**8 contacts are internal staff**, Calendar addresses or Bridget's personal one, attached to businesses as if they were the client. That is the trap that nearly cold-pitched your own editor three times.

### 2.3 The business records are mostly empty

Of 947 businesses: **847 have no email, 851 have no address, 864 have no phone.** No exact duplicate names, which is better than I feared, though near-duplicates exist ("UP & RUNNING" and "UP AND RUNNING CHISWICK").

The addresses that do exist mostly came from `prospect_leads`, and until yesterday were not written back.

### 2.4 QuickBooks is a snapshot, not a sync

All 159 invoices share a single `synced_at` of **2026-09-10 12:26:07**. One full refresh, not an incremental feed. 113 customers, 109 linked to businesses.

So the QBO data is only as fresh as the last time someone ran the refresh, and **nothing reads it to update anything**. `contracts.invoice_paid` and `renewal_stage = 'invoice_paid'` are set by hand, even though the answer is sitting in `qbo_invoices.is_paid`.

### 2.5 Smaller things

- 70 correspondence rows have no direction, 1 has no type. Harmless now that the derivation ignores them, but they are invisible to every direction-aware feature.
- 374 correspondence rows have no `contact_id`.
- `inbound_queue` is clean, nothing stuck.
- 116 open tasks.

---

## Part 3: the plan

Four phases. The order matters: automating on top of the March import would just spread it faster.

### Phase 1: clear the import damage

The single highest-value change in this document.

1. Copy each of the 193 rows' `deal_terms` onto `businesses.notes` where it belongs, then delete the contract rows. Backed up to `cc_phase0_backup` first, as with the kanban work.
2. Set Hen Corner's `membership_type` to its real value, so it appears on the renewal board.
3. Add `CHECK (membership_type IS NOT NULL)` on `contracts`, or a `NOT NULL` constraint, so this can never recur.
4. Re-run the kanban derivation. The 193 businesses stop being "graduated to renewal" and re-enter outreach properly.

**Effect:** the renewal board becomes truthful, 193 real prospects become reachable, and the outreach routine's pool roughly triples.

### Phase 2: make QuickBooks drive the money side

1. Put the QBO refresh on a schedule rather than running it by hand. Either a `pg_cron` job or a step in the existing CC daily desk routine, which already has the QuickBooks connector.
2. On each sync, act on what changed:
   - **Invoice newly paid** sets `contracts.invoice_paid = true`, `renewal_stage = 'invoice_paid'`, `renewal_invoice_paid_at = txn_date`.
   - **New invoice raised** writes a `correspondence` row so it appears in the business's history where you would expect to see it.
3. Auto-link new `qbo_customers` to businesses by normalised name, writing a `qbo_links` row with a confidence score, and leave anything ambiguous for review rather than guessing.

**Effect:** "when I send an invoice" and "when it gets paid" both become automatic.

### Phase 3: make the contract lifecycle drive the pipeline

Extend the existing contracts trigger so that adding a real contract does what the manual button does:

- set `renewal_stage = 'not_started'` and `renewal_not_started_at`
- clear the outreach block, which is exactly what `promoteOutreachToContracts()` does today by hand
- set `status = 'Active'`

And on the other end, when `contract_end` passes without a renewal, surface it rather than letting it go quiet. `v_unrecorded_renewals` already does the detection work; nothing currently acts on it.

**Effect:** "when a new contract is added" becomes automatic, in both directions.

### Phase 4: stop the contact book rotting

1. Blank the 803 "Contact" placeholders, or mark them so the UI and the outreach routine can tell a real name from a filler. My preference is a flag rather than deletion, since the email addresses attached to them are often real and useful.
2. Delete or re-tag the 8 internal-staff contacts.
3. When a real name is learned from inbound correspondence, promote it onto the contact record automatically instead of leaving the placeholder.

---

## What I would want to agree before starting

- **Phase 1 deletes 193 rows from `contracts`.** Backed up and reversible, but I want you to say yes explicitly, and ideally to eyeball a sample of the `deal_terms` notes first so you agree they belong on the business rather than in a contract.
- **Where the QBO sync should live.** The daily desk routine is the path of least resistance since it already has the connector. A `pg_cron` job would be more reliable but needs the credentials somewhere.
- **Placeholder contacts: blank, flag or delete?** I would flag.
- **How aggressive to be on invoice-paid automation.** Setting `renewal_stage = 'invoice_paid'` from a QuickBooks payment is a real state change on your board. I would do it, but it is the one piece here that moves a card without a human.

---

## Related, already noted

The Mastersheet sync has an unresolved fuzzy-matching bug that produced roughly 134 unexpected appends in a May dry run. Phase 1 will change what the export sees, so it is worth looking at that before or alongside this work rather than after.
