# Correspondence Clerk - Product Requirements Document

## HARD RULES

**These rules override everything else. The AI must:**

1. ✅ **PRESERVE USER WORDING EXACTLY** - No rewriting, polishing, summarizing, or tone changes
2. ✅ **NEVER INVENT CONTENT** - No suggestions, reminders, auto follow-ups, or made-up next steps
3. ✅ **ENFORCE FORCED FILING** - Cannot save without business AND named contact selected
4. ✅ **SHOW CONTACT DETAILS** - Role, email, phone always visible when contact is selected/displayed
5. ✅ **FAIL GRACEFULLY** - AI outage never blocks saving (save as raw text marked unformatted)
6. ✅ **NO PLACEHOLDERS** - Must name a real person every time, no "Unknown" or "TBD"
7. ✅ **STRICT JSON ONLY** - AI returns validated JSON, never prose
8. ✅ **MANUAL EDITS ONLY** - Edits are human corrections, never AI rewrites
9. ✅ **CLEAR LABELS** - No icon-only buttons, all actions labeled
10. ✅ **PRESERVE ORIGINALS** - Always keep raw_text_original and formatted_text_original

---

## 1. Purpose

The Correspondence Clerk is a web app that turns messy real world correspondence into a clean, chronological letter file per business.

It replaces the manual workflow of copying and pasting emails and call notes into Word documents and folders.

**It is not a CRM.** It does not suggest, rewrite, or follow up. It files what happened.

## 2. Users and Permissions

- Multi-user from day one via Supabase Auth
- Everyone can see everything in v1
- Store `user_id` on each correspondence entry for attribution only
- No audit trail requirements in v1

## 3. Success Criteria

✓ Log an entry in under 30 seconds
✓ Cannot save without selecting a business and naming a contact
✓ Manual search is always available for business and contact selection
✓ Full text search finds keywords inside past entries quickly
✓ AI outage never blocks saving correspondence
✓ Export produces print-ready Google Docs that replace the Word document workflow
✓ Formatting preserves the user's wording and voice exactly
✓ The app feels clean, warm, and professional, with minimal training required
✓ Contact details and roles are always easy to view, add, and update, and every entry clearly shows who it relates to

## 4. Requirements and Feature Set

### 4.1 MVP Pages

- Auth and Users
- Dashboard
- Business Detail page (the Letter File)
- New Entry page (Inbox)
- Search

### 4.2 Core Features

#### A. Businesses and Contacts

- Businesses table seeded from Mastersheet.csv
- Contacts belong to a business
- "Add New" business and "Add New" contact available everywhere relevant

**Contact records must make the person's role in the business and their key contact details easy to access and maintain:**

- Each contact stores: role, email, phone
- Contact details should be visible wherever a contact is selected or displayed, without needing to navigate away
- Adding or updating role, email, or phone should be possible inline during filing, using a simple "Edit details" option that keeps the user in flow
- Business Detail page should include a clear Contacts section listing people, roles, and contact details, with an "Add Contact" button and a quick edit option

#### B. New Entry Flow

**Large input area** to paste emails or type call and meeting notes

**Forced filing:**
- Select Business (search dropdown + Add New)
- Select Contact within Business (search dropdown + Add New)
- **Must name a person every time, no placeholders in v1**

**Contact selection must make role and contact details easy to attach to correspondence:**
- When a contact is chosen, show their role and key contact details directly in the selection area
- If role, email, or phone are missing, provide a quick inline way to add them before saving the entry
- Every saved entry must store both `contact_id` and `business_id` so the correspondence remains clearly linked even if details change later

**Optional entry fields:**
- Entry type: Email, Call, Meeting
- Action needed tag
- Due date (optional)

**Smart defaults that reduce friction without removing control:**
- If pasted text contains an email domain matching a known contact, prefill business and contact suggestions
- If a business has only one contact, preselect it
- **User must still explicitly confirm before saving**

#### C. Thread Splitting

- If a paste looks like an email chain, show a toggle: "Split into individual emails"
- Default toggle ON only when confidence is high
- When split, create multiple entries in chronological order
- **Must not invent missing emails or content**

#### D. Letter File Page

Chronological feed of entries per business

**Each entry looks like a letter file page:**
- Title line (subject guess or first meaningful line, max 90 chars)
- Meta line: date, type, contact name, role
- Body: formatted text, original wording preserved
- Lazy load older entries for performance

#### E. Dashboard

Default view answers: **what needs doing.**

**Each business card shows:**
- Business name
- Category and status flags from Mastersheet
- Last contacted date
- "Action needed" badge
- "Overdue" badge if `due_at` exists and is in the past

**Sorting:**
1. Action needed ≠ none
2. Overdue first
3. Oldest `last_contacted` next

#### F. Search

**Must have:**
- Business name search as primary use case
- Full text search across correspondence entries in v1
- Search bar prioritizes business name matches, then keyword matches in entries

#### G. Editing and Corrections

Allow minor corrections without breaking the record of truth.

**Preserve:**
- `raw_text_original`
- `formatted_text_original`

**Allow editing:**
- `formatted_text_current` only

**Store:**
- `edited_at`
- `edited_by`

**No rewriting by AI during edits. Edits are manual.**

#### H. Export

One-click export per business to Google Docs via MCP.

- Print-ready formatting
- Page break per entry
- Cover section with business metadata
- Export uses `formatted_text_current` only
- No raw text appendix in v1
- Optional later: full database export for backup

#### I. Onboarding and Feedback

Tech-hesitant support without clutter:

- First-time optional walkthrough on New Entry page
- Clear "Entry saved" confirmation after save
- Auto-scroll or jump to the new entry in the business letter file after saving
- Warn before navigating away from unsaved entry text

## 5. Non-Goals

❌ No rewriting, polishing, summarizing, or tone changes
❌ No suggestions, reminders, or auto follow-up
❌ No CRM pipeline features
❌ No internal-only notes system in v1

## 6. Glossary

- **Mastersheet**: Chiswick Calendar spreadsheet of businesses, statuses, contacts, contract-related fields
- **Club Card**: membership category
- **Advertiser**: advertising partner category
- **MCP**: method used to generate Google Docs export

## 7. Architecture and Processing Plan

### 7.1 How Correspondence is Processed

1. User pastes text or types notes in New Entry
2. App runs lightweight thread detection locally using simple heuristics and offers split toggle
3. Server action calls Anthropic (Claude) with strict JSON output contract
4. AI returns either:
   - One formatted entry, or
   - Multiple entries if splitting
5. User confirms or manually selects Business and Contact (forced)
6. Save entries:
   - Store raw and formatted text
   - Store metadata and warnings
   - Update business `last_contacted_at`
7. Business page renders entries as letter file pages with lazy loading
8. Search uses Postgres full-text index
9. Export compiles entries into a print-ready Google Doc

### 7.2 AI Failure Mode

If Anthropic is unreachable or returns invalid JSON:
- User can still save the entry as raw text marked "unformatted"
- Show a "Format later" option on unformatted entries
- **This ensures nothing is lost**

### 7.3 Modularity Rules

Keep separate modules for:
- AI integration and JSON validation
- Export logic
- Data access layer

This limits ripple effects later.

## 8. Tech Stack

### 8.1 Chosen Stack

- **Next.js 15** (React, App Router)
- **Tailwind CSS**
- **shadcn/ui** with global overrides for no rounded corners and no shadows
- **Supabase** (Postgres, Auth, full-text search)
- **Anthropic API** (Claude Sonnet) for formatting and thread splitting
- **Google Docs export via MCP** (fallback: server-side Google API integration if needed)

### 8.2 Why This Stack

It is a full-stack setup in a single repo with strong defaults for auth, database, search, server actions, and clean UI. It supports multi-user and a shared record of truth.

## 9. Data Source

- **Primary input**: manual paste and typed notes
- **Seed data**: Mastersheet.csv import to Supabase for businesses and contacts
- **Output**: Google Docs exports per business

## 10. Deployment Target

Web-hosted app, not local only

**Recommended:**
- Vercel for Next.js
- Supabase hosted database and auth

**Alternative later:** self-host Next.js while keeping Supabase managed

## 11. Database Model and Integrity

### 11.1 Tables

**businesses**
```
id                    uuid pk
name                  text
normalized_name       text unique
category              text
status                text
is_club_card          boolean
is_advertiser         boolean
last_contacted_at     timestamptz
mastersheet_source_ids jsonb
created_at, updated_at
```

**contacts**
```
id                uuid pk
business_id       uuid fk references businesses(id)
name              text
email             text null
normalized_email  text null
role              text null
phone             text null
created_at, updated_at

Constraints:
unique (business_id, normalized_email) where normalized_email is not null
```

**correspondence**
```
id                       uuid pk
business_id              uuid fk
contact_id               uuid fk
user_id                  uuid fk
raw_text_original        text
formatted_text_original  text null
formatted_text_current   text null
entry_date               timestamptz null
subject                  text null
type                     enum (Email, Call, Meeting)
action_needed            enum (none, prospect, follow_up, waiting_on_them, invoice, renewal)
due_at                   timestamptz null
ai_metadata              jsonb
created_at, updated_at
edited_at                timestamptz null
edited_by                uuid null
```

### 11.2 Search Indexes

- Postgres `tsvector` computed from `formatted_text_current` and `raw_text_original`
- GIN index for fast full-text search
- Index on `business_id`, `entry_date`, `action_needed`, `due_at`

### 11.3 RLS

- Authenticated users can read and write all rows in v1
- Implement strict RLS policies and document them in ARCHITECTURE.md

## 12. AI Output Contract

**AI must return strict JSON only. No prose.**

**Single entry:**
```json
{
  "subject_guess": "...",
  "entry_type_guess": "Email" | "Call" | "Meeting",
  "entry_date_guess": "2024-01-15T10:30:00Z" | null,
  "formatted_text": "...",
  "warnings": []
}
```

**Thread split:**
```json
{
  "entries": [
    {
      "subject_guess": "...",
      "entry_type_guess": "Email",
      "entry_date_guess": "2024-01-15T10:30:00Z",
      "formatted_text": "...",
      "warnings": []
    }
  ],
  "warnings": []
}
```

**Formatting rules:**
- Preserve wording exactly
- Only improve visual layout, spacing, lists, and obvious headers
- Do not invent next steps
- If uncertain, include a warning and avoid splitting

## 13. Mastersheet Import

Import businesses and contacts from Mastersheet.csv

**Key handling:**
- Businesses appear separately in the Mastersheet if they are both Club Card AND Advertiser
- Import must merge these into one business record with flags:
  - `is_club_card`
  - `is_advertiser`

**Import requirements:**
- Idempotent
- Produce an import report:
  - created businesses
  - updated businesses
  - created contacts
  - duplicates flagged
  - row errors

## 14. Acceptance Criteria

✓ Cannot save without business selected and a named contact
✓ Manual search and "Add New" always available
✓ Contact role and contact details are always visible and easy to add or update, and are clearly attached to saved correspondence
✓ Thread paste can split into multiple entries with correct ordering
✓ Full text search works and is fast
✓ AI outage does not block saving
✓ Export produces print-ready Google Docs with page breaks per entry
✓ App provides clear feedback on save and protects against accidental data loss
✓ No rewriting, no suggestions, no AI personality

## Step-by-Step Build Plan for Claude Code

### Step 0. Pre-build files ✓

Create in root:
- ✓ CLAUDE.md containing this PRD plus a bold "Hard Rules" list
- ARCHITECTURE.md covering schema, RLS, search, export, modules
- USER_FLOW.md describing the forced filing flow and thread split toggle
- GLOSSARY.md with Mastersheet, Club Card, Advertiser, MCP
- .cursorrules with typography and interaction consistency rules

### Step 1. Foundation and auth

**Prompt:**
"Read CLAUDE.md and ARCHITECTURE.md. Create a Next.js 15 app router project with Tailwind and shadcn/ui configured globally to remove rounded corners and shadows. Implement Supabase Auth with email login and protected routes. Only build auth, layout shell, and navigation. Do not build business features yet."

### Step 2. Database migrations, constraints, and RLS

**Prompt:**
"Create Supabase SQL migrations for businesses, contacts, correspondence with foreign keys, unique constraints, and indexes including tsvector + GIN full-text index. Add RLS policies so any authenticated user can read and write all rows. Document policies in ARCHITECTURE.md."

### Step 3. Dashboard and Business letter file pages

**Prompt:**
"Build the Dashboard sorted by action needed, overdue, then last contacted. Build the Business Detail page with a letter file style feed. Implement lazy loading for older entries and clear labelled actions. No icon-only buttons. Add a Contacts section on the Business page listing contact name, role, email, phone, with Add Contact and quick edit."

### Step 4. New Entry flow with forced filing and smart defaults

**Prompt:**
"Build the New Entry page with large input area. Add forced Business selector with search and Add New. After business selection, show forced Contact selector scoped to that business with search and Add New. When a contact is selected, show their role, email, and phone inline. If details are missing, allow inline add or edit before saving. Implement smart prefill using email domain and single contact logic but require explicit confirmation. Add unsaved changes warning. After save, show 'Entry saved' feedback and jump to the new entry in the business feed."

### Step 5. AI formatter and thread splitting with fallback

**Prompt:**
"Integrate Anthropic API via server action. Enforce strict JSON output contract and validate responses. Implement thread detection and split toggle. If AI fails or returns invalid JSON, allow saving raw text marked unformatted and provide 'Format later' action."

### Step 6. Editing as correction layer

**Prompt:**
"Allow manual edits of formatted_text_current only. Preserve raw_text_original and formatted_text_original. Store edited_at and edited_by and show a subtle corrected indicator."

### Step 7. Full text search

**Prompt:**
"Implement full text search using Postgres tsvector and GIN index across formatted_text_current and raw_text_original. Add global search bar that prioritizes business name matches then keyword hits."

### Step 8. Mastersheet import

**Prompt:**
"Write an idempotent import script for Mastersheet.csv. Merge duplicate business rows where one is Club Card and one is Advertiser into a single business record with boolean flags. Create contacts from Primary Contact and Other Contacts. Produce an import report with counts and errors."

### Step 9. Export to Google Docs via MCP

**Prompt:**
"Implement one-click export per business to Google Docs via MCP. Create a cover section and then entries in chronological order with page break per entry. Use formatted_text_current only. Make it print ready."
