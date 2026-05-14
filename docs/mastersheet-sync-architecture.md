# Correspondence Clerk → Mastersheet: Architecture Explainer

_For the dev. Written May 2026. Context for upcoming outreach status sync work._

---

## Overview

There are two separate systems that need to stay in sync:

1. **Correspondence Clerk (CC)** — a custom-built CRM on Supabase. This is the source of truth for business contacts, correspondence history, contracts, and relationship data.
2. **The Mastersheet** — a Google Sheet used as an operational pipeline tracker. Outreach status, invoice tracking, action dates, and reminders all live here.

The sync is one-directional: CC → Mastersheet. The Mastersheet never writes back to CC.

---

## The Sync Pipeline

### How it works

1. A **Supabase Edge Function** (`cc-live-export`, project ID `ayoiibrzkllerrwbhvda`) runs on demand and exports CC data as JSON. Note: this function was deployed directly via the Supabase dashboard — it does not currently exist in the codebase repo. Any changes to what it exports need to be made in the Supabase dashboard directly.

2. A **Google Apps Script** (`cc_mastersheet_sync.gs`) runs on a timed trigger (hourly). It fetches the JSON from the Edge Function and updates the Mastersheet accordingly.

3. A dedicated **CC Sync Log** tab in the Mastersheet records every sync run — what was updated, appended, or skipped.

### What the Edge Function currently exports

The Edge Function queries the **contracts table** (not the businesses flags) to determine relationship status. This is intentional — the `is_club_card` and `is_advertiser` boolean flags on the businesses table drift when contracts are updated without a corresponding flag change. The contracts table is the authoritative source.

Current export scope: Active Club Card members, Active Advertisers, and Prospects contacted within the last 18 months (~276 rows).

Placeholder contracts (where `is_current = TRUE` but `membership_type IS NULL`) are filtered out to avoid noise.

### What the Apps Script writes to the Mastersheet

The sync currently controls exactly **seven columns**. Everything else is Mastersheet-owned and never touched by the sync.

| Column | Field | Source |
|--------|-------|--------|
| A | Business Name | CC businesses table |
| B | Relationship Type | Derived from CC status (Active club card → Club Card, etc.) |
| E | Contract Start | CC contracts table |
| F | Contract End | CC contracts table |
| K | Email | CC businesses table |
| L | Phone | CC businesses table |
| AA | Business Category | CC businesses table |

### Core sync rule: CC adds, never deletes

If CC has a value, it writes it. If CC has no value for a field but the Mastersheet already has something there, the existing Mastersheet value is preserved. CC empty values never overwrite populated Mastersheet cells.

### Protected rows

The sync skips any row where column B (Relationship Type) is **Closed** or **Directory**. These rows are protected — they can only be changed manually. Prospect rows are not protected.

### Fuzzy name matching

The Apps Script matches CC businesses to Mastersheet rows by name. It uses fuzzy matching (not exact) to handle minor name variations. This has occasionally caused incorrect matches — worth being aware of if debugging unexpected updates.

---

## The Database — Key Tables

The CC Supabase project ID is `ayoiibrzkllerrwbhvda`.

**businesses** — the core record for each contact/business. Key columns:
- `id` (UUID)
- `name`, `normalized_name`
- `status` (Active, Prospect, Former, etc.)
- `is_club_card`, `is_advertiser` — boolean flags, but treat as approximate (see above)
- `email`, `phone`, `category`
- `last_contacted_at`
- `relationship_memory` — freetext notes field
- `business_type` — new field added recently (TEXT, with `org_business_types` lookup table)

**contracts** — one or more per business. Key columns:
- `business_id` (FK to businesses)
- `membership_type` ('club_card', 'advertiser', or NULL for placeholders)
- `is_current` (boolean)
- `contract_start`, `contract_end`
- `amount`
- `invoice_paid` (boolean)

**correspondence** — email/correspondence log. Key columns:
- `business_id` (FK to businesses — primary owner)
- `linked_business_ids` (UUID array — new field, for entries linked to a second business)
- `direction` ('sent' or 'received')
- `entry_date`
- `subject`
- `formatted_text_current`
- `action_needed`

**contacts** — individual people within a business.

**org_business_types** — lookup table for the new business_type taxonomy (Business, Internal, Contributor, Community, Council/Public sector, Media/PR, Venue/Promoter, Supplier).

---

## Recent Changes to Be Aware Of

Two new columns were added to the database in May 2026 and are now live in production:

1. **`correspondence.linked_business_ids`** (UUID array with GIN index) — allows a correspondence record to be associated with a second business. The Apps Script and Edge Function do not currently reference this column. If the Edge Function ever uses `SELECT *`, this column will appear in the export — so use explicit column names in the Edge Function, not `SELECT *`.

2. **`businesses.business_type`** (TEXT) — a secondary classification tag separate from the commercial status system. Has a companion `org_business_types` table. The Mastersheet sync does not read or write this column and should not be affected.

---

## The Mastersheet — Column Reference

The columns currently in the Mastersheet (left to right):

| Col | Field | Owner |
|-----|-------|-------|
| A | Business Name | CC (sync-controlled) |
| B | Relationship Type | CC (sync-controlled) |
| C | Outreach Status | Mastersheet (currently manual) |
| D | Action Date | Mastersheet (manual) |
| E | Contract Start | CC (sync-controlled) |
| F | Contract End | CC (sync-controlled) |
| G | Reminder Flag | Mastersheet (manual) |
| H | On Website? | Mastersheet (manual) |
| I | Primary Contact | Mastersheet (manual — CC has no single primary contact field) |
| K | Email | CC (sync-controlled) |
| L | Phone | CC (sync-controlled) |
| (invoice cols) | Latest Invoice, Invoice Date, Invoice Status, Amount, Up to Date | Mastersheet (manual) |
| AA | Business Category | CC (sync-controlled) |

---

## What We Want to Build Next

### Goal: make Outreach Status (col C) auto-populate from CC

Currently Outreach Status is set manually. The intent is to derive it automatically from CC correspondence data, so the Mastersheet reflects the actual state of each relationship without manual updating.

**Proposed status values and how they'd be derived:**

| Status | Source | Trigger |
|--------|--------|---------|
| Not Contacted | CC correspondence | No correspondence on record |
| Awaiting Reply | CC correspondence | Most recent correspondence direction = 'sent' |
| In Conversation | CC correspondence | Most recent correspondence direction = 'received' |
| Follow Up Later | CC disposition field (new) | Manually set in CC |
| Not Interested | CC disposition field (new) | Manually set in CC |

The first three are derivable automatically from the correspondence table. The last two require a new disposition field on the businesses table in CC (a simple dropdown with two options: Follow Up Later, Not Interested). When set in CC, the sync writes it to the Mastersheet. When a new correspondence entry arrives and the disposition is cleared, the sync reverts to the correspondence-derived status.

**This would make col C fully read-only in the Mastersheet** — no more manual updating needed.

### What needs to happen

1. **In CC (Supabase):** Add a `disposition` field (or similar) to the businesses table with options: null, 'follow_up_later', 'not_interested'. Surface it in the CC UI as a simple dropdown on the business record.

2. **In the Edge Function:** Export, per business, the direction and date of the most recent correspondence entry, plus the disposition value.

3. **In the Apps Script:** Derive the Outreach Status from the exported data using the logic above. Write it to col C. This column transitions from Mastersheet-owned to CC-controlled.

**Things to be careful about:**
- The existing `CC adds, never deletes` rule should still apply here — if CC has no correspondence data for a business, don't overwrite an existing Outreach Status value.
- The linked_business_ids column means a correspondence entry can appear on two business pages. For Outreach Status purposes, only the primary `business_id` owner should count — don't derive status from linked entries.
- The Edge Function currently doesn't exist in the codebase repo. Any changes to its export need to be made in the Supabase dashboard. Worth discussing whether to bring it into the repo as part of this work.

---

## Known Issues / Things to Watch

- **The Edge Function is not in the repo.** It was deployed via the Supabase dashboard directly. Changes to it require dashboard access, not a code deploy.
- **Fuzzy name matching in the Apps Script** has occasionally matched CC businesses to the wrong Mastersheet rows. The ~134 unexpected appends seen in a dryRunSync in early May 2026 were unresolved — worth investigating before extending the sync.
- **Don't use `SELECT *` in the Edge Function** — two new columns (`linked_business_ids`, `business_type`) are now in the businesses/correspondence tables and should not appear in the export unless explicitly intended.
- **Placeholder contracts** (is_current = TRUE, membership_type = NULL) must remain filtered out of any export query.
