# Correspondence Clerk - Current State Summary
**Last Updated:** 2026-01-16

## ✅ Completed Steps (1-6)

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

### Step 5: AI Formatter and Thread Splitting ✅
- **Anthropic API Integration** (Claude Sonnet 4) for formatting correspondence
- **Thread Detection:** Lightweight heuristics detect email chains
- **Split Toggle:** Auto-defaults ON for high-confidence threads
- **Strict JSON Contract:** AI returns only validated JSON (subject, type, date, formatted text)
- **Graceful Fallback:** AI outage never blocks saving
  - Save as "unformatted" if AI fails
  - Show clear error message with "Save Without Formatting" button
- **Format Later:** Unformatted entries show orange indicator with "Format Now" button
- **Retry Formatting:** Can attempt formatting again for unformatted entries
- **Preserves Originals:** Always stores raw_text_original and formatted_text_original
- **Hard Rules Enforced:** No rewriting, no invented content, preserves user wording exactly

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

## 🗄️ Database Schema Summary

### businesses
- Core fields: name, category, status, is_club_card, is_advertiser
- Tracking: last_contacted_at, mastersheet_source_ids
- Full-text search on name and category

### contacts
- Links to business_id
- Fields: name, email, role, phone
- Normalized email for uniqueness

### correspondence
- Links to business_id, contact_id, user_id
- **Text preservation:** raw_text_original, formatted_text_original, formatted_text_current
- **Metadata:** entry_date, subject, type (Email/Call/Meeting)
- **NEW: direction** (received/sent) - only for emails
- **NEW: formatting_status** (formatted/unformatted/failed) - tracks AI formatting
- **Actions:** action_needed, due_at
- **Editing:** edited_at, edited_by
- Full-text search on formatted and raw text

## 🎨 Design Rules (Enforced Globally)

From `app/globals.css`:
```css
* {
  border-radius: 0 !important;
  box-shadow: none !important;
}
```

- NO rounded corners anywhere
- NO shadows
- All buttons have text labels (no icon-only)
- British date format: DD/MM/YYYY (`toLocaleDateString('en-GB')`)
- System fonts for performance
- Sharp borders, clean hierarchy

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
- `getBusinesses()` - Returns all businesses
- `getBusinessById(id)` - Single business lookup
- `createBusiness(data)` - Add new business

### `app/actions/contacts.ts`
- `getContactsByBusiness(businessId)` - Scoped to business
- `createContact(data)` - Add new contact

### `app/actions/correspondence.ts`
- `getCorrespondenceByBusiness(businessId, limit, offset)` - Paginated
- `createCorrespondence(data)` - Includes direction field
- `updateFormattedText(correspondenceId, formattedTextCurrent)` - ✨ NEW: Manual edits
- Updates `businesses.last_contacted_at` on save

### `app/actions/ai-formatter.ts` ✨ NEW
- `formatCorrespondenceText(rawText, shouldSplit)` - Calls Anthropic API for formatting
- `createFormattedCorrespondence(formData, aiResponse)` - Saves with AI formatting
- `createUnformattedCorrespondence(formData)` - Saves without formatting (fallback)
- `retryFormatting(correspondenceId)` - Attempts to format unformatted entries

## 🚀 What's Next (PRD Steps 7-9)

### Step 7: Full-Text Search
- Use existing tsvector + GIN index
- Global search bar
- Prioritize business name, then keyword hits

### Step 8: Mastersheet Import
- Import from Mastersheet.csv
- Merge duplicates (Club Card + Advertiser flags)
- Create contacts from Primary/Other Contacts
- Idempotent with import report

### Step 9: Export to Google Docs via MCP
- One-click per business
- Print-ready formatting
- Cover section + entries with page breaks
- Uses `formatted_text_current` only

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

### 🔲 Not Yet Tested
- [ ] Full-text search
- [ ] Mastersheet import
- [ ] Google Docs export

## 📂 Critical Files

```
app/
  actions/
    businesses.ts          # Business CRUD
    contacts.ts            # Contact CRUD
    correspondence.ts      # Correspondence CRUD + direction field
    ai-formatter.ts        # ✨ NEW: AI formatting + retry logic
  dashboard/
    page.tsx              # Business cards with last contacted
  businesses/[id]/
    page.tsx              # TWO-SECTION VIEW + unformatted indicators + Format Now
  new-entry/
    page.tsx              # AI FORMATTING + thread detection + fallback
  api/
    businesses/route.ts   # GET all businesses
    contacts/route.ts     # GET contacts by business

components/
  BusinessSelector.tsx    # Search dropdown + Add New
  ContactSelector.tsx     # Scoped to business, shows details
  AddBusinessModal.tsx    # Inline add, auto-select
  AddContactModal.tsx     # Inline add, auto-select
  SuccessBanner.tsx       # Auto-dismiss success message

lib/
  ai/
    formatter.ts          # ✨ NEW: Anthropic API integration
    types.ts              # ✨ NEW: AI response type contracts
    thread-detection.ts   # ✨ NEW: Email thread heuristics

supabase/migrations/
  20250115_001 - 006      # Migrations 1-6 (through direction field)
  20250116_001            # ✨ NEW: formatting_status column

CLAUDE.md                 # Full PRD + Hard Rules
ARCHITECTURE.md           # Schema, RLS, search, modules
USER_FLOW.md              # Forced filing flow
GLOSSARY.md               # Mastersheet, Club Card, etc.
MIGRATION_INSTRUCTIONS.md # ✨ NEW: Migration guide
.env.local.example        # ✨ NEW: Environment template with ANTHROPIC_API_KEY
```

## 🎯 Current Position

**We are between Step 6 and Step 7.**

Everything through manual editing is complete and working. The next piece is full-text search using the existing tsvector + GIN index.

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

## 🐛 Known Issues

None currently! Everything implemented is working as expected.

## 📝 Notes for Next Session

- Migration 007 (formatting_status column) has been run in Supabase ✅
- AI formatting integration complete with Anthropic API ✅
- Thread detection using client-side heuristics ✅
- Graceful fallback ensures AI outage never blocks workflow ✅
- Manual editing (correction layer) complete ✅
- ANTHROPIC_API_KEY is configured in .env.local ✅
- Ready to proceed with Step 7 (Full-Text Search) when ready

---

**To continue:** Start fresh conversation and reference this file + CLAUDE.md
