# Correspondence Clerk - Current State Summary
**Last Updated:** 30/03/2026

## ✅ Completed Steps (1-8)

### Step 1: Foundation and Auth ✅
- Next.js 15 with App Router
- Supabase Auth (email/password)
- Tailwind + shadcn/ui (NO rounded corners, NO shadows)
- Protected routes working
- Navigation component with auth state

### Step 2: Database Migrations ✅
All migrations in `supabase/migrations/`:
- `20250115_001_enable_extensions.sql` - UUID extension
- `20250115_002_create_businesses_table.sql` - Businesses with full-text search
- `20250115_003_create_correspondence_table.sql` - Correspondence with indexes
- `20250115_004_create_contacts_table.sql` - Contacts linked to businesses
- `20250115_005_rls_policies.sql` - Row-level security (all authenticated users can read/write)
- `20250115_006_add_direction_column.sql` - Direction field (received/sent)
- `20250116_001_add_formatting_status.sql` - **NEW: Formatting status tracking**

### Step 3: Dashboard and Business Pages ✅
- Dashboard shows all businesses with last contacted date (DD/MM/YYYY format)
- Business Detail page (letter file view) with:
  - **NEW: "New Entry" button** (pre-fills business)
  - Contact management section
  - **NEW: Two-section correspondence view:**
    - **Recent (Last 12 Months)**: Sorted oldest→newest (chronological reading)
    - **Archive (Older)**: Collapsible, sorted newest→oldest
  - **NEW: Direction arrows** (← Received / → Sent)
  - **NEW: Due dates displayed** (red if overdue, yellow if upcoming)

### Step 4: New Entry Flow ✅
- Forced filing: MUST select business AND contact
- **NEW: Entry date REQUIRED, time OPTIONAL** (defaults to noon if blank)
- **NEW: Direction field** (required for emails only)
- Entry Details section: Date, Time, Direction, Type
- Optional Details: Subject, Action Needed, Due Date
- Large text area for correspondence
- Add Business/Contact inline without losing state
- Smart prefill from query params (`?businessId=xxx`)
- Unsaved changes warning
- Success redirect with banner

### Step 5: AI Formatter and Thread Splitting ✅ **[UPDATED: Jan 22, 2026]**
- **Anthropic API Integration** with **structured outputs** (zero JSON parsing errors)
- **Model:** claude-sonnet-4-5 (latest, upgraded from claude-sonnet-4-20250514)
- **Token Budget:** 16,384 tokens (4x increase, handles 13KB+ threads)
- **Temperature:** 0 (deterministic, consistent output)
- **JSON Schema Enforcement:** Uses `output_format.schema` for guaranteed valid JSON
- **Beta Feature:** `structured-outputs-2025-11-13` enabled
- **Thread Detection:** Lightweight heuristics detect email chains
- **Split Toggle:** Auto-defaults ON for high-confidence threads
- **Strict JSON Contract:** AI returns only validated JSON (subject, type, date, formatted text)
- **Truncation Detection:** Checks `stop_reason === 'max_tokens'` and handles gracefully
- **Graceful Fallback:** AI outage never blocks saving
  - Save as "unformatted" if AI fails
  - Show clear error message with "Save Without Formatting" button
- **Format Later:** Unformatted entries show orange indicator with "Format Now" button
- **Retry Formatting:** Can attempt formatting again for unformatted entries
- **Preserves Originals:** Always stores raw_text_original and formatted_text_original
- **Hard Rules Enforced:** No rewriting, no invented content, preserves user wording exactly
- **Test Results:** 100% success rate (3/3 tests passed, no JSON errors)

### Step 6: Manual Editing (Correction Layer) ✅
- **Edit Button:** Each entry has an "Edit" button in normal view
- **Edit Mode:** Clicking Edit shows textarea with formatted_text_current
- **Save/Cancel:** Clear Save Changes and Cancel buttons
- **Preserves Originals:** Only edits formatted_text_current
  - raw_text_original stays intact
  - formatted_text_original stays intact
- **Tracking:** Stores edited_at timestamp and edited_by user_id
- **Corrected Indicator:** Blue "Corrected" badge shows on edited entries
- **Manual Only:** Edits are human corrections, never AI rewrites

### Step 7: Full-Text Search ✅
- **Search Server Action:** `searchAll()` function in app/actions/search.ts
- **Business Name Prioritization:** Business name matches ranked higher (rank 1) than keyword matches (rank 2)
- **Correspondence Search:** Full-text search across subject, formatted_text_current, formatted_text_original, and raw_text_original
- **Search Page:** Dedicated /search page with search form and results display
- **Result Display:**
  - Business results show green "Business" badge with category and status
  - Correspondence results show blue "Correspondence" badge with business name, contact name, and entry date
  - All results link to appropriate pages (businesses or business detail)
  - Snippets shown for correspondence (first 150 characters)
- **Navigation:** Search link already present in main navigation
- **British Date Format:** DD/MM/YYYY in search results
- **Uses Existing Indexes:** Leverages existing database structure (no new indexes needed)

### Step 8: Mastersheet Import & Dashboard Enhancements ✅
- **Mastersheet CSV Import:**
  - Server action `importMastersheet()` in app/actions/import-mastersheet.ts
  - Reads Mastersheet.csv from project root
  - Detects duplicate businesses by normalized name
  - Merges Club Card + Advertiser duplicates into single records with both flags
  - Creates contacts from Primary Contact and Other Contacts columns
  - Idempotent (safe to run multiple times)
  - Generates detailed import report with counts and errors
  - Admin UI at /admin/import with import button and report display
- **Dashboard Search & Filters:**
  - Live search bar (filters as you type)
  - Filter by type: All, Club Card Only, Advertiser Only, Both, Prospects Only
  - Category dropdown filter (dynamically populated)
  - Sort options: Most/Least Recently Contacted, Name A-Z/Z-A
  - Results counter shows "X of Y businesses"
  - All filters work together (compound filtering)
- **Edit Business Functionality:**
  - EditBusinessButton component on business detail page
  - Modal form to edit: name, category, status, is_club_card, is_advertiser
  - Uses existing `updateBusiness()` server action
  - Refreshes page after save to show updated data
  - Cancel button resets form to original values
- **Data Protection:**
  - Mastersheet.csv added to .gitignore (contains sensitive business data)
- **Delete Functionality:**
  - Delete contacts (with confirmation)
  - Delete correspondence entries (with confirmation)
  - Delete businesses (with double confirmation - alert + type "DELETE")
- **Edit Contact Functionality:**
  - EditContactButton component with modal
  - Modal form to edit: name, email, role, phone
  - Refreshes page after save to show updated data

### Step 9: Export to Google Docs via MCP ✅
- **Export Server Action:**
  - `exportToGoogleDocs(businessId)` in app/actions/export-google-docs.ts
  - Fetches business, contacts, and all correspondence (up to 1000 entries)
  - Sorts correspondence chronologically (oldest first)
  - Builds formatted document content with:
    - Cover page: Business name, category, status, flags, export date
    - Contacts section: Name, role, email, phone for each contact
    - Correspondence section: Chronological entries with subject, date, direction, type, contact, formatted text, action needed
  - Uses British date format (DD/MM/YYYY) throughout
  - Uses `formatted_text_current` for entry text (preserves user edits)
  - Returns formatted content + metadata (entry count, contact count)
- **Export Button Component:**
  - ExportToGoogleDocsButton component on business detail page
  - Green "Export to Google Docs" button in Correspondence section header
  - Calls exportToGoogleDocs server action
  - Uses MCP tool `mcp__google_workspace__createDocument` to create actual Google Doc
  - Shows success message with link to open document in new tab
  - Shows error message if export fails
  - Loading state ("Exporting...") during export

### Step 10: Outlook Web Integration (Bookmarklet) ✅ **[UPDATED: Jan 26, 2026]**
- **Bookmarklet Install Pages:**
  - `/install-bookmarklet` - Public landing page with instructions
  - `/bookmarklet` - Alternate install page (dashboard linked)
  - **Settings > Tools** - Link to bookmarklet installer (for returning users)
- **How it works:**
  - User drags bookmarklet button to browser bookmarks bar
  - When viewing email in Outlook Web, clicking bookmark extracts email data
  - Opens Correspondence Clerk `/new-entry` with form pre-filled
  - Uses `postMessage` API to bypass cross-domain restrictions
- **Email Data Extraction:**
  - Subject, body, from (name + email), to, date
  - Parses Outlook Web DOM for `[role="heading"]` elements
  - Handles British date format (DD/MM/YYYY HH:MM)
- **Supported Domains:**
  - outlook.com (consumer)
  - outlook.office.com (Office 365)
  - outlook.live.com
- **Bug Fixes (Jan 26, 2026):**
  - Fixed race condition where `href` wasn't set before user could drag
  - Added `isReady` state to prevent drag until `javascript:` href confirmed
  - Keeps anchor element always mounted (toggles visibility via className)
  - Shows "Preparing bookmarklet..." / "Loading bookmarklet..." until ready
  - **Fixed API to always use production URL** (not preview deployment URL)
  - API now returns self-contained postMessage bookmarklet (no external script)
- **Discoverability:**
  - New users: Prominent banner on Dashboard with "Install Email Import Tool" button
  - Returning users: Settings > Tools section with install link
  - User guide updated with bookmarklet instructions
- **Key Files:**
  - `app/install-bookmarklet/page.tsx` - Public install page
  - `app/bookmarklet/page.tsx` - Dashboard-linked install page
  - `app/api/bookmarklet-code/route.ts` - API endpoint (hardcoded production URL)
  - `app/settings/page.tsx` - Tools section with bookmarklet link
  - `docs/USER_GUIDE.md` - Updated with bookmarklet instructions

## 🗄️ Database Schema Summary

### businesses
- Core fields: name, category, status, membership_type (string, configurable per org), address, email, phone, notes, contract fields
- Tracking: last_contacted_at, mastersheet_source_ids
- Multi-tenant: org_id

### contacts
- Links to business_id
- Fields: name, **emails[] (array), phones[] (array)**, role, notes, is_active
- Unique per business + email combination

### correspondence
- Links to business_id, contact_id (nullable — Notes have no contact), user_id, org_id
- **CC/BCC:** cc_contact_ids (UUID[]), bcc_contact_ids (UUID[])
- **Text preservation:** raw_text_original, formatted_text_original, formatted_text_current
- **Metadata:** entry_date, subject, type (Email/Call/Meeting), direction (received/sent/null)
- **formatting_status:** formatted/unformatted/failed
- **Actions:** action_needed, due_at
- **Editing:** edited_at, edited_by
- **Deduplication:** content_hash (SHA256)
- Full-text search on formatted and raw text (tsvector + GIN)

### organizations
- id, name, business_description, industry
- business_description + industry used in Daily Briefing AI system prompt

### org_membership_types
- Per-org configurable membership labels (replaces hardcoded Club Card / Advertiser flags)
- Fields: id, org_id, label, value, sort_order, is_active

### user_profiles
- id, organization_id, display_name, role (member/admin)
- google/microsoft OAuth tokens for bulk email import
- inbound_email_token (unique token for inbound email forwarding address)
- own_email_addresses TEXT[] (for BCC/sent detection)

### import_queue
- Chunked email import job queue
- Fields: id, org_id, correspondence_id, status (pending/processing/done/failed), retry_count, error

### inbound_queue
- Queued inbound emails awaiting manual filing
- Fields include: direction, to_emails, body_text, from_email, subject, received_at

### domain_mappings
- Auto-filing rules for inbound email
- Fields: org_id, domain, business_id
- Populated on first manual file; used for subsequent auto-filing

### duplicate_dismissals
- Tracks dismissed duplicate pairs so they don't reappear
- Fields: business_id, entry_id_1, entry_id_2, dismissed_by, dismissed_at

## 🎨 Design Rules (Enforced Globally)

- Very subtle rounded corners (2-4px) — barely perceptible softness
- Subtle shadows allowed via CSS vars: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- All buttons have text labels (no icon-only)
- British date format: DD/MM/YYYY via `formatDateGB()`
- Fonts: Lora (serif) for h1/h2 headings, Inter (sans) for body text
- Gentle transitions: 0.2s ease-out on interactive elements
- Warm palette — **design tokens only, never raw hex:**
  - `bg-brand-dark` / `text-brand-dark` = #1E293B (slate header)
  - `bg-brand-navy` / `hover:bg-brand-navy-hover` = #2C4A6E (primary buttons/links)
  - `bg-brand-olive` = #7C9A5E (accents, secondary actions)
  - `bg-brand-paper` = #FAFAF8 (page background)
  - `bg-brand-warm` = #F8F7F4 (card backgrounds)
  - CSS vars for inline styles: `var(--link-blue)`, `var(--header-bg)`, `var(--main-bg)`
  - **⚠️ CSS vars (e.g. `var(--brand-navy)`) do NOT resolve in React inline styles — use hex directly**

## 📝 Key Implementation Details

### Date Handling
- Entry date: REQUIRED (type="date")
- Entry time: OPTIONAL (type="time")
- If time blank → defaults to 12:00 PM (noon)
- Combined as: `${date}T${time}:00` or `${date}T12:00:00`

### Direction Logic
- Only shown when Type = "Email"
- Required validation only for emails
- Radio buttons: "Received from them" / "Sent to them"
- Stored as: 'received' | 'sent' | null

### Two-Section Archive
- Split point: 12 months ago from current date
- Recent: oldest→newest (chronological reading like a letter file)
- Archive: newest→oldest within archive, collapsed by default
- Archive button shows count: "Archive (X older entries)"

### Forced Filing
- Cannot save without: Business + Contact selected
- For emails: also requires Direction
- Always requires: Entry Date + Entry Text

## 🔧 Server Actions

### `app/actions/businesses.ts`
- Business CRUD + delete (all org-scoped)

### `app/actions/contacts.ts`
- Contact CRUD + delete + update (emails/phones as arrays)

### `app/actions/correspondence.ts`
- Correspondence CRUD + manual edits + delete + duplicate detection
- `updateFormattedText` merges direction update in same call (single DB write)

### `app/actions/ai-formatter.ts`
- `formatCorrespondenceText(rawText, shouldSplit)` — single combined AI call (format + action detection)
- `createFormattedCorrespondence` / `createUnformattedCorrespondence` / `retryFormatting`
- Strips quoted/forwarded content before sending to AI (uses `stripQuotedContent` from `lib/inbound/utils.ts`)
- Prompt caching enabled on system prompts

### `app/actions/search.ts`
- `searchAll(query)` — full-text search, websearch type, business name prioritised

### `app/actions/organizations.ts`
- `getNavData()` — single round-trip for nav state (org + hasCorrespondence)
- Org CRUD + business_description/industry update

### `app/actions/membership-types.ts`
- Per-org configurable membership type CRUD

### `app/actions/import-mastersheet.ts`
- CSV import with duplicate merging (idempotent)

### `app/actions/export-google-docs.ts`
- Google Docs export via MCP

### `app/actions/duplicate-dismissals.ts`
- Dismiss duplicate pairs (stores in duplicate_dismissals)

## ✅ Features 11–19 (added since Jan 2026)

### 11. CC + BCC Contacts
- cc_contact_ids / bcc_contact_ids (UUID[]) stored on correspondence
- Included in full-text search

### 12. Duplicate Detection
- content_hash (SHA256) groups entries by identical content
- DuplicatesWarningBanner on business page
- Dismiss pairs — stored in duplicate_dismissals table

### 13. SaaS Foundation
- Feature flags (FEATURE_BILLING_ENABLED, FEATURE_PUBLIC_SIGNUP, FEATURE_LANDING_PAGE, etc.)
- Stripe billing integration (behind flag)
- Landing page, pricing page, terms/privacy

### 14. Automated Marketing Engine
- Prospect discovery, cold email, social autopilot, programmatic SEO
- Blog, free tools, AI chatbot, referral system, review automation
- Tables: marketing_prospects, leads, referrals, email_sequence_*, social_content, blog_posts, etc.

### 15. Bulk Email Import Wizard
- Gmail + Outlook OAuth bulk import
- Chunked execute (150 emails/request, auto-loops client-side)
- ReviewWizard: editable business/contact review before execute
- Pages: `/import/gmail`, `/import/outlook`

### 16. Daily Briefing / AI Assistant
- Full-page inline ChatPanel at `/daily-briefing`
- Slide-out overlay triggered from nav
- Uses org business_description + industry as system prompt context
- Chat route: `app/api/chat/route.ts` (prompt caching enabled)

### 17. Configurable Membership Types
- Per-org: replaces hardcoded Club Card/Advertiser flags
- Settings UI to add/edit/reorder/deactivate types
- Table: org_membership_types

### 18. Onboarding Flow (4 steps)
- `/onboarding/create-organization` → `/onboarding/describe-business` → `/onboarding/first-business` → `/new-entry`
- describe-business step saves business_description + industry to organizations table

### 19. Inbound Email Forwarding + BCC Capture
- Postmark webhook at `/api/inbound-email` (live since 27/03/2026)
- Inbound domain: `in.correspondenceclerk.com`
- Auto-files to known domain via domain_mappings; queues unknowns to inbound_queue
- BCC capture: detect from OriginalRecipient header; sent emails matched from To/Cc
- Direction stored on queue insert; auto-matched from sender/recipient email
- Inbox UI at `/inbox` with SENT/RECEIVED badge, expandable body, contact auto-match
- Settings: "My email addresses" section for BCC detection

### 20. Actions Page
- Priority list, needs-reply, gone-quiet, flagged, reminders sections
- Keyboard shortcuts (j/k navigation, space to expand)
- All-clear panel when all sections empty
- Hidden from nav until first correspondence entry exists

### Additional hardening
- Cmd+K global search overlay (sessionStorage cache, 5min TTL)
- Draft autosave in new-entry
- DB pagination on business page (Load More)
- Data Health section in settings (format all unformatted)
- Structured logging in inbound webhook (JSON log lines at every decision point)
- Prompt caching on all AI system prompts
- Single combined AI call: format + action detection merged
- Quoted content stripping before AI processing
- Custom favicon (CC initials, #1E293B background)

---

## 🚀 Deployment

Fully functional and **deployed to production**.

### 🌐 Live Deployment
- **Production URL:** https://correspondence-clerk.vercel.app
- **Deployment Platform:** Vercel
- **Auto-Deploy:** Enabled (pushes to `main` branch trigger deployments)
- **Manual Deploy:** `vercel --prod --yes`
- **Organization:** tom-apperleys-projects
- **Project ID:** prj_TLkqSYexjPOdnZNKJGGcq3AGpSO9

### 📸 Screenshot Workflow
- **Desktop Shortcut:** `C:\Users\Bridg\Desktop\Save Screenshot for Claude.bat`
- **User Workflow:**
  1. Take screenshot (Fn + Shift + PrtSc)
  2. Double-click Desktop shortcut
  3. Paste file path in terminal (Ctrl+V)
- **Storage:** `C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\`
- **Format:** `screenshot_YYYY-MM-DD_HH-MM-SS.png`
- **Documentation:** `SCREENSHOT_WORKFLOW.md`

## ⚠️ Hard Rules (From CLAUDE.md)

1. ✅ **PRESERVE USER WORDING EXACTLY** - No rewriting
2. ✅ **NEVER INVENT CONTENT** - No suggestions or made-up next steps
3. ✅ **ENFORCE FORCED FILING** - Cannot save without business AND named contact
4. ✅ **SHOW CONTACT DETAILS** - Role, email, phone always visible
5. ✅ **FAIL GRACEFULLY** - AI outage never blocks saving
6. ✅ **NO PLACEHOLDERS** - Must name a real person every time
7. ✅ **STRICT JSON ONLY** - AI returns validated JSON, never prose
8. ✅ **MANUAL EDITS ONLY** - Edits are human corrections, not AI rewrites
9. ✅ **CLEAR LABELS** - No icon-only buttons
10. ✅ **PRESERVE ORIGINALS** - Always keep raw_text_original and formatted_text_original

## 🧪 Testing Checklist

### ✅ Completed & Working
- [x] Auth flow (login, signup, logout)
- [x] Dashboard displays businesses
- [x] Business detail page shows contacts and correspondence
- [x] New Entry form with forced filing
- [x] Date/time split (date required, time optional)
- [x] Direction field (conditional on email type)
- [x] Two-section view (Recent + Archive)
- [x] Direction arrows display
- [x] Due dates display with color coding
- [x] British date format (DD/MM/YYYY)
- [x] "New Entry" button on business page with pre-fill
- [x] Add business/contact inline without losing form state
- [x] AI formatting integration with Anthropic API
- [x] Thread detection and split toggle
- [x] Graceful fallback (save without formatting)
- [x] "Format Later" button for unformatted entries
- [x] Unformatted entry indicators
- [x] Manual editing with Edit button
- [x] "Corrected" indicator on edited entries
- [x] Preserves originals when editing
- [x] Full-text search across businesses and correspondence
- [x] Business name prioritization in search results
- [x] Search page with result badges and snippets
- [x] Mastersheet CSV import with duplicate merging
- [x] Import report with counts and errors
- [x] Dashboard search bar (live filtering)
- [x] Dashboard filter by type (Club Card, Advertiser, Both, Prospect)
- [x] Dashboard category filter dropdown
- [x] Dashboard sort options (recent, oldest, name A-Z/Z-A)
- [x] Edit business modal with name, category, status, and flags
- [x] Delete contacts with confirmation
- [x] Delete correspondence entries with confirmation
- [x] Delete businesses with double confirmation
- [x] Edit contact modal with name, email, role, phone

### ✅ Outlook Integration (Bookmarklet)
- [x] Bookmarklet install page with drag-and-drop button
- [x] Bookmarklet extracts email data from Outlook Web
- [x] Pre-fills new entry form with extracted data
- [x] Works on outlook.com, outlook.office.com, outlook.live.com
- [x] Fixed: Bookmarklet href set before allowing drag (Jan 26, 2026)

### 🔲 Ready for User Testing
- [ ] Google Docs export (requires MCP setup with Google authentication)

## 📂 Critical Files

```
app/
  actions/
    businesses.ts           Business CRUD + delete
    contacts.ts             Contact CRUD + delete + update
    correspondence.ts       Correspondence CRUD + manual edits + delete + duplicate detection
    duplicate-dismissals.ts Dismiss duplicate pairs
    ai-formatter.ts         Anthropic API (structured outputs, retry, fallback, prompt caching)
    search.ts               Full-text search (tsvector + GIN, websearch type)
    import-mastersheet.ts   CSV import with duplicate merging
    export-google-docs.ts   Google Docs export via MCP
    organizations.ts        Org CRUD + getNavData() (single round-trip for nav state)
    membership-types.ts     Per-org configurable membership types
  dashboard/page.tsx        Business list with search/filters/sort + onboarding checklist
  businesses/[id]/page.tsx  Letter file view + sub-components in _components/
  businesses/[id]/_components/
                            CorrespondenceEntry, EditForm, ThreadAssignPanel, AllEntriesView,
                            ThreadsView, FilterBar, DuplicatesWarningBanner, ContactsList
  new-entry/page.tsx        Add correspondence (forced filing + AI formatting + draft autosave)
  actions/page.tsx          Priority list + needs-reply + gone-quiet + flagged + reminders
  daily-briefing/page.tsx   Full-page inline ChatPanel
  search/page.tsx           Full-text search results
  import/gmail/page.tsx     Gmail bulk import wizard
  import/outlook/page.tsx   Outlook bulk import wizard
  inbox/page.tsx            Inbound email queue triage
  onboarding/               4-step flow
  settings/page.tsx         User settings + Tools + membership types
  install-bookmarklet/page.tsx  Bookmarklet installer (public)
  admin/import/page.tsx     Mastersheet import UI
  api/
    inbound-email/route.ts  Postmark webhook → verify → match domain → AI format → auto-file or queue
    import/[provider]/scan  OAuth email scan (headers only, returns scanId)
    import/[provider]/execute Chunked import (150/req, auto-loops client-side)
    chat/route.ts           Daily Briefing AI endpoint

components/
  CommandSearch.tsx         Cmd+K global overlay (sessionStorage cache 5min TTL, keyboard nav)
  Navigation.tsx            App nav + actions badge + Daily Briefing button
  ChatPanel.tsx             Daily Briefing AI panel (inline=true or slide-out overlay)
  Toast.tsx                 Toast container (singleton in layout.tsx)
  BusinessSelector.tsx      Search dropdown + Add New
  ContactSelector.tsx       Scoped to business, shows details
  AddBusinessModal.tsx      Inline add, auto-select
  AddContactModal.tsx       Inline add, auto-select
  EditBusinessButton.tsx    Edit modal + delete
  EditContactButton.tsx     Edit contact modal
  ExportToGoogleDocsButton.tsx  Export button
  import/ReviewWizard.tsx   Editable business/contact review before bulk import execute

lib/
  ai/
    formatter.ts            Anthropic structured outputs (format + action detection, prompt caching)
    thread-detection.ts     Email chain heuristics
    types.ts                AI response contracts
  inbound/utils.ts          isPersonalDomain, stripQuotedContent
  email-import/execute-chunk.ts  Shared Gmail+Outlook chunked import logic
  toast.ts                  Toast emitter (CustomEvent — toast.success/error/info())
  supabase/service-role.ts  createServiceRoleClient() for cron/session-less contexts
```

## 🎯 Current Position (30/03/2026)

All 19 features complete and deployed. Active development continues (see `.claude/todos.md`).

**Next priorities:** P26 (AI Assistant rename + call prep), P27 (AI preset templates), P28 (full UX audit).

## 💡 Key Decisions Made

1. **Direction only for emails** - Calls and meetings don't need sent/received
2. **12-month split** - Recent vs Archive based on entry date
3. **Chronological reading** - Recent entries oldest→newest (boss's preference)
4. **British dates** - DD/MM/YYYY format everywhere
5. **Noon default** - When time omitted, use 12:00 PM not midnight
6. **Forced filing** - No placeholders, must name real people
7. **Client-side sorting** - Two-section split happens in browser (fine for <200 entries)
8. **AI never blocks saving** - Fallback to unformatted always available
9. **Thread splitting optional** - User controls split toggle, AI only suggests
10. **Claude Sonnet 4** - Using latest model for best formatting quality
11. **Client-side filtering** - Dashboard filters and search happen in browser (fine for thousands of businesses)
12. **Idempotent import** - Mastersheet import can be run multiple times safely

## 🐛 Known Issues

- Google Docs export requires MCP setup with Google authentication (not yet user-tested)
- ~27 lint errors remain (react-hooks false positives, docx library `any` types) — intentionally skipped
- Sentry error monitoring blocked: needs Sentry account + DSN first (P17)
- **⚠️ MICROSOFT_CLIENT_SECRET expires 19/09/2026** — rotate at portal.azure.com

## 🔐 Credentials

- Postmark: `tom@correspondenceclerk.com` / `tapperley96`, server "My First Server"
- Inbound email: `in.correspondenceclerk.com` (MX → inbound.postmarkapp.com, priority 10)
- Google OAuth: Cloud project `decisive-talon-484209-i9`
- Microsoft OAuth: Azure app "Correspondence Clerk"
- Full details: `project_oauth_credentials.md` in project root

---

**To continue:** Start fresh conversation and reference this file + CLAUDE.md
