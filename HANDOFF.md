# Correspondence Clerk - Handoff Documentation for ChatGPT

**Date:** January 16, 2026
**Handoff from:** Claude Code
**Handoff to:** ChatGPT (GPT-4)
**Project status:** Production-ready MVP with all core features complete
**Last commit:** `698f057` - feat: add Outlook Web integration with auto-matching

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [The 10 Hard Rules](#the-10-hard-rules-critical)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [Completed Features](#completed-features)
6. [Code Organization](#code-organization)
7. [Key Design Patterns](#key-design-patterns)
8. [Development Workflow](#development-workflow)
9. [Recent Git History](#recent-git-history)
10. [Known Issues](#known-issues)
11. [Where to Go from Here](#where-to-go-from-here)

---

## Project Overview

### What is Correspondence Clerk?

Correspondence Clerk is a web application that turns messy real-world correspondence (emails, call notes, meeting notes) into clean, chronological letter files per business.

**It replaces:** The manual workflow of copying/pasting emails and notes into Word documents and folders.

**It is NOT:** A CRM. It does not suggest, rewrite, follow up, or manage sales pipelines. It only files what happened.

### Current Status

**Production-ready MVP** - All 9 build steps from CLAUDE.md are complete, plus several enhancements:

✅ Auth and multi-user support
✅ Dashboard with smart sorting
✅ Business detail page (letter file view)
✅ New Entry flow with forced filing
✅ AI formatting with graceful fallback
✅ Thread detection and splitting
✅ Manual editing layer
✅ Full-text search
✅ Mastersheet CSV import
✅ Google Docs export (print-ready)
✅ Word/Google Docs import
✅ **Outlook Web integration** (newest feature - Jan 16, 2026)
✅ Contact extraction from email signatures
✅ Duplicate detection

---

## The 10 Hard Rules (CRITICAL)

**These rules override everything else. They are non-negotiable.**

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

### Examples of Violations to Avoid

❌ **Violation of Rule 1:** AI reformats "Spoke to John. He said ok." → "I had a productive conversation with John, who confirmed his approval."
✅ **Correct:** Keep it as "Spoke to John. He said ok."

❌ **Violation of Rule 2:** AI adds "Next steps: Follow up in 1 week" when user didn't write that
✅ **Correct:** Only format what the user actually wrote

❌ **Violation of Rule 3:** Allow saving with "Unknown Contact" or empty contact field
✅ **Correct:** Force user to select or create a named contact before saving

❌ **Violation of Rule 5:** Show error dialog blocking save when Anthropic API is down
✅ **Correct:** Save as raw text with `formatted_text_original = null`, offer "Format later" button

---

## Tech Stack

### Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.2 | React framework (App Router) |
| **React** | 19.2.3 | UI library |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | v4 | Styling (no rounded corners, no shadows) |
| **shadcn/ui** | Latest | UI components |
| **Supabase** | 2.90.1 | PostgreSQL database + Auth + RLS |
| **Anthropic SDK** | 0.71.2 | Claude API for formatting/splitting |
| **Google APIs** | 170.1.0 | Google Docs export/import |
| **Lucide React** | 0.562.0 | Icons |

### APIs and Integrations

- **Anthropic Claude API:** AI formatting and thread splitting (Claude Sonnet)
- **Google Workspace MCP:** Export to Google Docs, import from Google Docs
- **Supabase Auth:** Email-based authentication
- **Outlook Web:** Bookmarklet integration for email import

---

## Database Schema

### Tables

#### `businesses`

```sql
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT UNIQUE NOT NULL,
  category TEXT,
  status TEXT,
  is_club_card BOOLEAN DEFAULT false,
  is_advertiser BOOLEAN DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  mastersheet_source_ids JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key points:**
- `normalized_name` ensures uniqueness (lowercase, trimmed)
- `is_club_card` and `is_advertiser` are flags from Mastersheet import
- `last_contacted_at` auto-updates when correspondence is created

#### `contacts`

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  role TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_business_email
    UNIQUE (business_id, normalized_email)
    WHERE normalized_email IS NOT NULL
);
```

**Key points:**
- Contacts belong to exactly one business
- Email uniqueness is per-business (same person can exist at multiple businesses)
- Role, email, phone are optional but encouraged (Hard Rule 4)

#### `correspondence`

```sql
CREATE TYPE entry_type AS ENUM ('Email', 'Call', 'Meeting');
CREATE TYPE action_status AS ENUM ('none', 'prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal');

CREATE TABLE correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,

  -- Three-version text storage (Hard Rule 10)
  raw_text_original TEXT NOT NULL,
  formatted_text_original TEXT,
  formatted_text_current TEXT,

  -- Metadata
  entry_date TIMESTAMPTZ,
  subject TEXT,
  type entry_type,
  action_needed action_status DEFAULT 'none',
  due_at TIMESTAMPTZ,
  ai_metadata JSONB,

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  edited_by UUID,

  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(formatted_text_current, raw_text_original)), 'A') ||
    setweight(to_tsvector('english', coalesce(subject, '')), 'B')
  ) STORED
);
```

**Key points:**
- **Three-version storage:** `raw_text_original` (never changes), `formatted_text_original` (AI output), `formatted_text_current` (user edits)
- **Full-text search:** Automatic tsvector with GIN index
- **Foreign key behavior:** CASCADE on business, RESTRICT on contact (prevent accidental contact deletion)

### Row Level Security (RLS)

**Current policy (v1):** All authenticated users can read/write everything.

```sql
-- Example policy (same pattern for all tables)
CREATE POLICY "Authenticated users can view all businesses"
  ON businesses FOR SELECT
  TO authenticated
  USING (true);
```

**Future consideration:** Per-business permissions or team-based access control.

---

## Completed Features

### 1. Authentication (Supabase)

- Email/password login
- Protected routes via middleware
- Session management with httpOnly cookies

### 2. Dashboard

- Business cards sorted by:
  1. Action needed ≠ none
  2. Overdue first (if `due_at` in past)
  3. Oldest `last_contacted_at` next
- Shows: business name, category, status, last contacted, action badge, overdue badge

**Location:** `app/dashboard/page.tsx`

### 3. Business Detail Page (Letter File)

- Chronological feed of correspondence entries
- Lazy loading (20 entries at a time)
- Each entry shows: subject, date, type, contact name/role, formatted text
- "Add Entry" button
- Contacts section (list of people with role, email, phone)

**Location:** `app/businesses/[id]/page.tsx`

### 4. New Entry Flow

**Forced filing with smart defaults:**

- Large text area for paste/type
- **Business selector** (required, searchable, "Add New" option)
  - Smart prefill: email domain matching, but requires explicit confirmation
- **Contact selector** (required, scoped to business, searchable, "Add New" option)
  - Smart prefill: single contact auto-suggests
  - Shows role, email, phone inline
  - Quick edit for missing details
- Optional fields: entry type, action needed, due date
- Thread split toggle (if email chain detected)
- Unsaved changes warning
- Success feedback + auto-scroll to new entry

**Location:** `app/new-entry/page.tsx`

### 5. AI Formatting with Graceful Fallback

**How it works:**
1. Server action calls Anthropic Claude API
2. Strict JSON contract (see CLAUDE.md section 12)
3. If API fails/invalid: save as `raw_text_original` only, mark unformatted
4. User can trigger "Format later" manually

**Formatting rules (Hard Rule 1):**
- Preserve wording exactly
- Only improve visual layout (spacing, lists, headers)
- Never invent next steps or summaries

**Location:** `lib/ai/formatter.ts`, `app/actions/ai.ts`

### 6. Thread Detection and Splitting

- Heuristic detection (looks for "From:", "Date:", signatures)
- Toggle: "Split into individual emails"
- Default ON if high confidence, OFF if uncertain
- Creates multiple entries in chronological order
- Must not invent missing emails (Hard Rule 2)

**Location:** `lib/ai/split-thread.ts`

### 7. Manual Editing Layer

- Only `formatted_text_current` is editable
- `raw_text_original` and `formatted_text_original` preserved (Hard Rule 10)
- Stores `edited_at` and `edited_by`
- Subtle "corrected" indicator shown

**Location:** `app/businesses/[id]/page.tsx` (edit modals)

### 8. Full-Text Search

- Uses PostgreSQL tsvector + GIN index
- Searches across `formatted_text_current` and `raw_text_original`
- Weighted: formatted text (A), subject (B)
- Global search bar prioritizes business names, then keyword matches

**Location:** `app/search/page.tsx`

### 9. Mastersheet CSV Import

- Idempotent import from Mastersheet.csv
- Merges duplicate businesses (Club Card + Advertiser rows)
- Creates contacts from Primary Contact and Other Contacts columns
- Produces import report (created, updated, errors)

**Location:** `app/actions/import.ts`

### 10. Google Docs Export

- One-click export per business
- Print-ready format:
  - Cover page with business metadata
  - Entries in chronological order
  - Page break after each entry
- Uses `formatted_text_current` only
- Integrates with Google Workspace MCP

**Location:** `app/actions/export.ts`, `lib/export/google-docs.ts`

### 11. Word/Google Docs Import

- Import historical correspondence from Word or Google Docs
- Contact extraction from email signatures
- Thread splitting for multi-email documents
- Smart matching to existing contacts

**Location:** `app/actions/import.ts`

### 12. Outlook Web Integration (NEWEST)

**Added:** January 16, 2026 (commit `698f057`)

- Bookmarklet for one-click email capture from Outlook Web
- Auto-matching business/contact from email addresses
- Pre-fills subject, body, date, type
- Direction detection (sent vs received)

**Files:**
- `public/outlook-bookmarklet.js` - Bookmarklet loader
- `public/outlook-extractor.js` - Email extraction logic
- `app/api/import-email/route.ts` - Import endpoint
- `OUTLOOK_INTEGRATION.md` - Installation and usage docs

### 13. Contact Extraction

- Extracts contact info from email signatures
- Detects: name, email, phone, role/title
- Offers to create new contacts inline

**Location:** `lib/contact-extraction.ts`

### 14. Duplicate Detection

- Detects when pasting same content twice
- Shows warning before creating duplicate entry
- Offers to scroll to existing entry instead

**Location:** `app/new-entry/page.tsx`

---

## Code Organization

```
correspondence-clerk/
├── app/
│   ├── actions/              # Server actions
│   │   ├── ai.ts            # AI formatting/splitting
│   │   ├── correspondence.ts # CRUD operations
│   │   ├── export.ts        # Google Docs export
│   │   └── import.ts        # Mastersheet/document import
│   ├── api/
│   │   ├── contacts/        # Contact search endpoints
│   │   └── import-email/    # Outlook email import
│   ├── businesses/[id]/     # Business detail page
│   ├── dashboard/           # Dashboard page
│   ├── new-entry/           # Entry form with email import
│   ├── search/              # Full-text search
│   └── layout.tsx           # Root layout
├── components/
│   ├── ui/                  # shadcn components (Button, Dialog, etc.)
│   ├── BusinessSelector.tsx
│   ├── ContactSelector.tsx
│   ├── AddBusinessModal.tsx
│   ├── AddContactModal.tsx
│   ├── EditContactModal.tsx
│   ├── DuplicateDetectionModal.tsx
│   └── ContactExtractionModal.tsx
├── lib/
│   ├── ai/
│   │   ├── formatter.ts     # AI formatting logic
│   │   ├── split-thread.ts  # Thread detection/splitting
│   │   └── validate.ts      # JSON validation
│   ├── supabase/
│   │   ├── client.ts        # Supabase client factory
│   │   └── server.ts        # Server-side client
│   ├── contact-extraction.ts
│   ├── contact-matching.ts
│   └── utils.ts
├── public/
│   ├── outlook-bookmarklet.js  # Bookmarklet loader
│   └── outlook-extractor.js    # Email extraction
├── supabase/
│   └── migrations/          # SQL migrations
├── CLAUDE.md                # Requirements and Hard Rules
├── ARCHITECTURE.md          # Technical architecture
├── USER_FLOW.md             # UX patterns
├── OUTLOOK_INTEGRATION.md   # Outlook setup guide
├── HANDOFF.md               # This file
├── CHATGPT_QUICK_START.md   # Quick reference
└── CHATGPT_INITIAL_PROMPT.txt
```

---

## Key Design Patterns

### 1. Forced Filing Pattern

**Principle:** Cannot save correspondence without business AND named contact.

**Implementation:**
- Business selector shown first (required)
- Contact selector shown only after business selected (required, scoped to business)
- "Add New" always available for both
- Save button disabled until both selected

**Hard Rules:** 3, 6

### 2. Smart Defaults + Explicit Confirmation

**Principle:** Reduce friction without removing control.

**Implementation:**
- Auto-suggest business from email domain
- Auto-suggest contact if only one exists
- Prefill suggestions highlighted in yellow
- User must click to confirm (no auto-selection)

**Hard Rules:** None violated (user always in control)

### 3. AI Failure Mode

**Principle:** AI outage must never block saving.

**Implementation:**
- Server action wraps Anthropic API in try/catch
- If fail: save with `formatted_text_original = null`
- Show "unformatted" badge on entry
- Offer "Format later" button for retry

**Hard Rules:** 5

### 4. Three-Version Text Storage

**Principle:** Preserve original, allow corrections, track changes.

**Implementation:**
- `raw_text_original`: User's exact paste/type (never changes)
- `formatted_text_original`: AI output (never changes)
- `formatted_text_current`: User edits (editable)
- Display uses `formatted_text_current` with fallback to `raw_text_original`

**Hard Rules:** 8, 10

### 5. No AI Invention

**Principle:** AI formats layout only, never invents content.

**Implementation:**
- AI prompt explicitly forbids: "Do not suggest next steps, do not add reminders, do not summarize"
- Validation checks for invented content
- Warnings shown to user if AI deviates

**Hard Rules:** 1, 2

---

## Development Workflow

### Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Server runs on http://localhost:3000 (or 3001 if port conflict)
```

### Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key

# Google (for export/import)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Common Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
```

### Database Migrations

```bash
# Apply migrations
npx supabase db push

# Create new migration
npx supabase migration new migration_name

# Reset database (dev only)
npx supabase db reset
```

---

## Recent Git History

```
698f057 - feat: add Outlook Web integration with auto-matching (Jan 16, 2026)
93c1547 - fix: detect duplicates when copying from formatted page display
ce6bdc2 - fix: improve duplicate detection and scroll-to-entry behavior
b04fe96 - fix: move useMemo hooks before early return to comply with Rules of Hooks
7e2f8a5 - feat: add four UI enhancements (search, business info, name display, duplicate detection)
11b1912 - docs: update session notes with automatic contact matching feature
81c5d86 - feat: automatic contact matching for email threads
6af51f8 - docs: add session notes for Word document import feature
1a09bbb - feat: Word document import with contact extraction and enhanced thread splitting
be54241 - feat: add Google Docs import for historical correspondence
```

**Progression:**
1. Core MVP complete (all 9 build steps)
2. Google Docs import (Dec 2025)
3. Word document import with contact extraction
4. Automatic contact matching for emails
5. UI enhancements (search, business info, duplicate detection)
6. Outlook Web integration (latest)

---

## Known Issues

**None critical** - The application is production-ready.

### Minor Issues

1. **Port 3000 conflict:** Sometimes port 3000 is in use. Fallback to 3001 works fine.
2. **Middleware deprecation warning:** Next.js shows a warning about middleware, but it's non-blocking and doesn't affect functionality.

### Browser Compatibility

- ✅ Chrome/Edge (fully supported)
- ✅ Firefox (fully supported)
- ✅ Safari (fully supported)
- ⚠️ IE11 (not supported, not tested)

---

## Where to Go from Here

### Essential Reading (Priority Order)

1. **CLAUDE.md** - Full requirements and Hard Rules
   - Read this first to understand the "why" behind every decision

2. **CHATGPT_QUICK_START.md** - Quick reference for common tasks
   - Keep this open while working

3. **ARCHITECTURE.md** - Technical deep dive
   - Database schema, RLS policies, module structure

4. **USER_FLOW.md** - UX patterns and flows
   - Understand how forced filing works
   - Thread split toggle behavior

5. **OUTLOOK_INTEGRATION.md** - Bookmarklet setup
   - How the newest feature works

### Navigating the Codebase

**Need to modify AI behavior?**
- Start at: `lib/ai/formatter.ts`
- Server action: `app/actions/ai.ts`
- Prompt engineering happens in `formatter.ts`

**Need to change database schema?**
- Create migration: `supabase/migrations/`
- Update types: `lib/types.ts` or type inference from Supabase

**Need to modify New Entry flow?**
- Main file: `app/new-entry/page.tsx`
- Business selector: `components/BusinessSelector.tsx`
- Contact selector: `components/ContactSelector.tsx`

**Need to change export format?**
- Export logic: `app/actions/export.ts`
- Google Docs formatting: Uses MCP tools (see ARCHITECTURE.md)

**Need to modify Outlook integration?**
- Bookmarklet loader: `public/outlook-bookmarklet.js`
- Email extraction: `public/outlook-extractor.js`
- Import endpoint: `app/api/import-email/route.ts`

### Common Development Tasks

**Add a new field to correspondence:**
1. Create migration in `supabase/migrations/`
2. Update `correspondence` table schema
3. Update TypeScript types
4. Update `app/new-entry/page.tsx` form
5. Update display in `app/businesses/[id]/page.tsx`

**Modify AI formatting prompt:**
1. Edit `lib/ai/formatter.ts`
2. Update `formatEntry()` function
3. Keep Hard Rules 1, 2, 7 in mind
4. Test with various email formats

**Add a new business field:**
1. Create migration
2. Update `businesses` table
3. Update `components/AddBusinessModal.tsx`
4. Update business card display in dashboard

### Testing Checklist

Before deploying changes, verify:

- [ ] Hard Rules are not violated (especially 1, 2, 3, 5, 10)
- [ ] Forced filing still works (business + contact required)
- [ ] AI failure gracefully falls back to raw text
- [ ] Contact details visible when contact selected
- [ ] No icon-only buttons (all actions labeled)
- [ ] Supabase connection works
- [ ] Anthropic API key valid (or fallback works)
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors: `npm run lint`

---

## Final Notes

### Design Constraints

- **No rounded corners** (Tailwind global override)
- **No box shadows** (Tailwind global override)
- Clean, warm, professional aesthetic
- Minimal training required

### User Experience Principles

1. **Forced filing is non-negotiable** - but make it fast and smart
2. **Smart defaults reduce clicks** - but never auto-save without confirmation
3. **Contact details always visible** - role, email, phone shown when contact selected
4. **Fail gracefully** - AI problems never block the user
5. **Preserve user intent** - never rewrite, only format
6. **Clear feedback** - confirm saves, highlight new entries, show errors inline

### Security Considerations

- SQL injection: Supabase client handles parameterized queries
- XSS: Sanitize formatted text before rendering (consider DOMPurify)
- CSRF: Server Actions have built-in protection
- API keys: Never expose in client code
- RLS: All tables protected by RLS policies

### Performance Optimizations

- Lazy loading: Correspondence entries load 20 at a time
- Debouncing: Search input debounced 300ms
- Indexes: All foreign keys + search vectors indexed
- Cursor-based pagination for correspondence feeds

---

**You are now fully briefed on Correspondence Clerk. Good luck with continued development!**

If you have questions about any aspect of the codebase, refer to:
- This file (HANDOFF.md) for comprehensive context
- CLAUDE.md for requirements and hard rules
- ARCHITECTURE.md for technical details
- CHATGPT_QUICK_START.md for quick answers
