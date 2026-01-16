# Correspondence Clerk - Current State Summary
**Last Updated:** 2026-01-16

## ✅ Completed Steps (1-4)

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
- `20250115_006_add_direction_column.sql` - **NEW: Direction field (received/sent)**

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
- `createCorrespondence(data)` - **Includes direction field**
- Updates `businesses.last_contacted_at` on save

## 🚀 What's Next (PRD Steps 5-9)

### Step 5: AI Formatter and Thread Splitting
- Integrate Anthropic API (Claude Sonnet)
- Strict JSON output contract
- Thread detection and split toggle
- Fallback: save as unformatted if AI fails
- "Format later" option

### Step 6: Manual Editing (Correction Layer)
- Edit `formatted_text_current` only
- Preserve originals
- Track `edited_at` and `edited_by`
- Show "corrected" indicator

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

### 🔲 Not Yet Tested
- [ ] AI formatting integration
- [ ] Thread splitting
- [ ] Manual editing of formatted text
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
  dashboard/
    page.tsx              # Business cards with last contacted
  businesses/[id]/
    page.tsx              # TWO-SECTION VIEW + direction + due dates
  new-entry/
    page.tsx              # CONDITIONAL DIRECTION + date/time split
  api/
    businesses/route.ts   # GET all businesses
    contacts/route.ts     # GET contacts by business

components/
  BusinessSelector.tsx    # Search dropdown + Add New
  ContactSelector.tsx     # Scoped to business, shows details
  AddBusinessModal.tsx    # Inline add, auto-select
  AddContactModal.tsx     # Inline add, auto-select
  SuccessBanner.tsx       # Auto-dismiss success message

supabase/migrations/
  20250115_001 - 006      # All 6 migrations (direction added in 006)

CLAUDE.md                 # Full PRD + Hard Rules
ARCHITECTURE.md           # Schema, RLS, search, modules
USER_FLOW.md              # Forced filing flow
GLOSSARY.md               # Mastersheet, Club Card, etc.
```

## 🎯 Current Position

**We are between Step 4 and Step 5.**

Everything through forced filing and correspondence display is complete and working. The next major piece is AI integration for formatting and thread splitting.

## 💡 Key Decisions Made

1. **Direction only for emails** - Calls and meetings don't need sent/received
2. **12-month split** - Recent vs Archive based on entry date
3. **Chronological reading** - Recent entries oldest→newest (boss's preference)
4. **British dates** - DD/MM/YYYY format everywhere
5. **Noon default** - When time omitted, use 12:00 PM not midnight
6. **Forced filing** - No placeholders, must name real people
7. **Client-side sorting** - Two-section split happens in browser (fine for <200 entries)

## 🐛 Known Issues

None currently! Everything implemented is working as expected.

## 📝 Notes for Next Session

- Migration 006 (direction column) has been run in Supabase ✅
- All date displays use 'en-GB' format ✅
- Direction validation only applies to email entries ✅
- Ready to proceed with Step 5 (AI Integration) when user is ready
- Consider whether to implement Steps 5-9 or if there are other priorities

---

**To continue:** Start fresh conversation and reference this file + CLAUDE.md
