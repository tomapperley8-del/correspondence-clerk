# Kanban stage derivation — build report

**Date:** 2026-09-09
**Status:** Live. Function, backfill and triggers all applied to production (`ayoiibrzkllerrwbhvda`).

The outreach and renewal kanban stages are no longer manual-only fields. They are derived from the correspondence log, contracts and QuickBooks invoices, backfilled once, and kept current by a trigger on `correspondence`.

| File | What | State |
|---|---|---|
| `supabase/migrations/20260909_001_derive_business_stages.sql` | Pure derivation function, no side effects | Applied |
| `supabase/migrations/20260909_002_backfill_derived_stages.sql` | Backfill + `cc_phase0_backup` | Applied — 61 rows |
| `supabase/migrations/20260909_003_correspondence_stage_trigger.sql` | `apply_derived_stages()` + INSERT/UPDATE/DELETE triggers | Applied |
| `docs/kanban-outreach-changes-applied.csv` | 48 outreach rows changed (44 stage + 4 date fills) | — |
| `docs/kanban-renewal-changes-applied.csv` | 13 renewal rows changed (10 stage + 3 date fills) | — |

The authoritative record of what changed is `cc_phase0_backup`. To see it at any time:

```sql
SELECT b.name,
       k.before_row->>'outreach_stage' AS outreach_before, b.outreach_stage AS outreach_after,
       k.before_row->>'renewal_stage'  AS renewal_before,  b.renewal_stage  AS renewal_after
FROM cc_phase0_backup k
JOIN businesses b ON b.id = k.row_id
WHERE k.reason = 'kanban_derivation_backfill'
ORDER BY b.name;
```

---

## 1. What reading the code changed

Two things in the app contradicted the original brief, and both made the change materially smaller and safer.

### 1.1 `outreach_stage IS NULL` means "not on the board", not "unset"

`getOutreachBusinesses()` filters `.not('outreach_stage','is',null)`. `addBusinessToOutreach()` sets `'identified'`; `removeBusinessFromOutreach()` sets it back to NULL **and nulls every outreach date**. `PipelineStatusCard` reads `inOutreach = !!business.outreach_stage`.

So the 162 NULL rows are businesses deliberately never added, or explicitly removed. The first dry run would have added ~150 of them to the board. **The derivation never promotes NULL into a stage** — it only updates businesses already on a board. Same on the renewal side: membership is `is_club_card OR is_advertiser`, and the derivation never sets `renewal_stage` for an unflagged business.

### 1.2 Graduating on contract is already the app's own model

`promoteOutreachToContracts()` nulls the entire outreach block and sets `renewal_stage = 'not_started'`. Moving a business off the outreach board once it holds a contract is not a new rule — it is what the app already does when a deal closes. The derivation now respects it.

### 1.3 Stage vocabulary, confirmed against the TypeScript

`OutreachView.tsx`:
```ts
type OutreachStage = 'identified' | 'contacted' | 'followed_up' | 'in_discussion' | 'won' | 'invoice_paid' | 'not_interested'
```
`ContractsView.tsx`:
```ts
type RenewalStage = 'not_started' | 'contacted' | 'in_discussion' | 'agreed' | 'invoice_paid' | 'not_renewing' | 'renewed'
```

- **`won`** is a real board column with a real date field, never used — 0 businesses in it, and the 2 with `outreach_won_at` set are already at `invoice_paid`. Manual-only; the derivation never produces it and never overwrites it.
- **`renewed`** is UI-only. `updateBusinessRenewalStage()` intercepts it, stores `not_started` and clears the renewal dates. It never persists, so the derivation never needs to produce it.
- **`in_progress`** is not in the TS union at all. `ContractsView.mapLegacyStage()` maps it to `contacted` for display, so those 2 businesses already render in the Contacted column. Left alone.

---

## 2. The rules as built

**Outreach** applies only to a business that is on the outreach board, is not muted, has no `outreach_declined_at`, is not in a manual-only stage (`not_interested`, `won`), is not `Former`/`Inactive`/`Closed`, and **has never held a contract**.

| Stage | Condition | Date set |
|---|---|---|
| `invoice_paid` | a linked paid QBO invoice | latest paid `txn_date` |
| `in_discussion` | ≥1 inbound | date of first inbound |
| `followed_up` | ≥2 outbound, no inbound | date of most recent outbound |
| `contacted` | ≥1 outbound, no inbound | date of first outbound |
| `identified` | no qualifying correspondence | existing value, else `created_at` |

`in_discussion` outranks `followed_up`: a reply is a stronger signal than repeated chasing.

**Renewal** applies only to a business flagged `is_club_card OR is_advertiser`, not muted, no `renewal_declined_at`, not in a manual-only stage (`not_renewing`, `agreed`, `invoice_paid`, `in_progress`), not `Former`/`Inactive`/`Closed`, with a current contract that has an end date. Only correspondence dated after `contract_end - 90 days` counts, so an old thread cannot make a fresh renewal look already in progress.

**Qualifying correspondence** is `type IN ('Email','Email Thread','Call','Meeting')` — `Note` is an internal memo and `Draft` has not been sent. `linked_business_ids` is honoured, so a shared thread counts for every business it touches. `direction = 'outbound'` is treated as sent (the CHECK allows it; 0 rows currently use it).

**Direction-unknown rows are ignored, not guessed at.** 70 rows have `direction IS NULL`; 49 are on qualifying types, touching 32 businesses. Reading them, they are almost all team-authored log entries backfilled from 2024–early 2026 ("Conversation with X", "Invoice sent"), effectively Notes mistyped as Email/Call/Meeting. Counting them as inbound would promote cold prospects on the strength of our own notes. Only one business (`AILAND GARDEN & MAINTENANCE`) has no directioned correspondence at all, and it is skipped anyway as a contract holder — so ignoring them changes zero derivations.

**Never derived, always manual:** `not_interested`, `not_renewing`, `won`, `agreed`, renewal `invoice_paid`, and both `*_declined_at` columns.

**Never regresses.** Where a human has put a card further along than the log supports, the human wins.

**Dates are only stamped when the card actually moves, or when the slot is empty.** Re-dating a card already in the right stage would jog the "days in stage" badge backwards for no visible gain.

---

## 3. What the backfill did

**61 businesses changed** out of 947. Every one was written to `cc_phase0_backup` with reason `kanban_derivation_backfill` first.

### Outreach — 44 stage changes + 4 date fills

| From | To | Count |
|---|---|---:|
| contacted | in_discussion | 29 |
| identified | in_discussion | 7 |
| contacted | followed_up | 4 |
| followed_up | in_discussion | 3 |
| identified | contacted | 1 |
| _(already `in_discussion`, empty date filled)_ | | 4 |

### Renewal — 10 stage changes + 3 date fills

| Business | From | To | contract_end | Date set |
|---|---|---|---|---|
| KILLIK & CO | not_started | in_discussion | 2026-10-13 | 2026-08-10 |
| MY PLACE | not_started | in_discussion | 2026-10-01 | 2026-07-09 |
| OMNIA LIFESTYLE | not_started | in_discussion | 2026-09-03 | 2026-06-05 |
| ROCKS LANE | not_started | in_discussion | 2026-09-23 | 2026-06-25 |
| THE PACKHORSE & TALBOT | not_started | in_discussion | 2026-08-29 | 2026-06-02 |
| THE PILOT | not_started | in_discussion | 2026-09-01 | 2026-06-06 |
| THEATRE AT THE TABARD | not_started | in_discussion | 2026-11-01 | 2026-08-09 |
| LITTLE BIRD | contacted | in_discussion | 2025-04-28 | 2026-04-07 |
| ODDONO'S GELATERIA | contacted | in_discussion | 2026-07-01 | 2026-04-28 |
| AGNES DOS SANTOS LASH EXPERTS | not_started | contacted | 2026-10-28 | 2026-08-28 |

Seven live renewals were sitting in "To contact" having already replied.

### Board totals, before and after

| | identified | contacted | followed_up | in_discussion | won | invoice_paid | not_interested | NULL |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| before | 567 | 182 | 14 | 15 | 0 | 2 | 5 | 162 |
| after | 559 | 150 | 15 | **54** | 0 | 2 | 5 | 162 |

| | not_started | contacted | in_discussion | agreed | invoice_paid | not_renewing | in_progress |
|---|---:|---:|---:|---:|---:|---:|---:|
| before | 917 | 6 | 1 | 4 | 9 | 8 | 2 |
| after | 909 | 5 | **10** | 4 | 9 | 8 | 2 |

Row count unchanged at 947. No business gained or lost board membership. Every manual-only value untouched.

### Who was skipped, and why

| Reason | Outreach | Renewal |
|---|---:|---:|
| not on that board | 162 | 836 |
| graduated to renewal (has held a contract) | 201 | — |
| `status` Former / Inactive / Closed | 79 | — |
| manual-only stage | 4 | 17 |
| declined by a human (`*_declined_at` set) | 1 | 4 |
| `mute_replies` | 3 | 1 |
| would regress the stage | 4 | 0 |
| no current contract end date | — | 1 |

---

## 4. Verification

| Test | Result |
|---|---|
| WEST & HUNTER → `in_discussion`, date = first inbound | **Pass.** `contacted → in_discussion`, `outreach_in_discussion_at = 2026-06-30` (first of 15 received; 10 sent from 2025-11-12). |
| HOME INSTEAD not silently reactivated | **Pass.** Skipped, `closed_or_former_business`. Would also have been caught by `graduated_to_renewal`. |
| ROCK & ROSE (permanently closed, `status = Inactive`) untouched | **Pass.** Skipped, `closed_or_former_business`. |
| `mute_replies = true` untouched | **Pass.** All 10 skipped on both passes. |
| Zero-correspondence businesses stay `identified` | **Pass.** 559 hold at `identified`. |
| Backfill idempotent | **Pass.** Ran a second time: 0 rows backed up, 0 rows updated, `cc_phase0_backup` still 61 rows / 61 distinct businesses. |
| Row count unchanged, no new nulls | **Pass.** 947 before and after. `coalesce()` means a NULL from the function preserves the stored value, so nothing can be nulled out. |
| Trigger fires on a real insert | **Pass.** Inserted a `received` Email for AIRIVO (`contacted`, no prior inbound): it moved to `in_discussion` with `outreach_in_discussion_at = 2026-09-09`, `outreach_contacted_at` preserved at 2025-11-14. Test row deleted and AIRIVO restored. |

---

## 5. Two behaviours worth knowing

**Deleting a correspondence entry will not walk a stage back.** The delete trigger fires and recomputes, but the never-regress rule holds the card where it is. Observed during testing: deleting the AIRIVO test email left it at `in_discussion` until the stage was reset by hand. This follows from "backfill never regresses" and is probably what you want — deleting an email shouldn't silently demote a deal — but a stage put there by a since-deleted entry has to be dragged back manually.

**Trigger cost is about 16 ms per correspondence row.** Measured with `EXPLAIN ANALYZE` on both the heaviest business in the table and a light one — the cost is flat, dominated by the contract and QBO lookups rather than correspondence volume, and both `business_id` (btree) and `linked_business_ids` (GIN) are indexed. At the mail import's 150 rows per chunk that is roughly 2.4 s added per chunk. Acceptable for now; if it starts to bite, the fix is a statement-level trigger over the affected business ids, or moving the recompute to the existing nightly `pg_cron` job.

---

## 6. Follow-up, out of scope here

**194 businesses have a current contract but neither `is_club_card` nor `is_advertiser`.** The renewal board is driven by those flags (`getContractBusinesses()` filters on them), so the renewal pass only ever sees 111 of the 302 businesses with a live contract. This is the flag drift the mastersheet notes warned about — `sync_business_flags_from_contracts` fires on contract writes, so contracts loaded before that trigger existed never got flagged. Worth a proper look on its own.
