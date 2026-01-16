# Session Notes - Word Document Import & Contact Matching

**Date:** 2026-01-16
**Commits:**
- 1a09bbb - "feat: Word document import with contact extraction and enhanced thread splitting"
- 81c5d86 - "feat: automatic contact matching for email threads"

## What Was Built

### 1. Contact Extraction from Word Documents
Users can now paste Word documents containing contact lists and the app will:
- Automatically detect contacts in the pasted text
- Extract name, role, email, and phone for each person
- Show a yellow banner: "Detected N contacts in pasted text"
- Allow reviewing and selecting which contacts to add
- Create contacts in the database with one click

### 2. Enhanced Thread Detection
The thread detection now recognizes Word document format:
- Dotted line separators (………………)
- "Email from X to Y, DD/MM/YYYY" format
- British date format parsing
- High confidence scoring for Word format

### 3. Multiple Contacts Support
Database schema updated to support multiple emails/phones per contact:
- New `emails` JSONB column (stores array of emails)
- New `phones` JSONB column (stores array of phones)
- Backward compatible with old `email` and `phone` columns
- Migration applied successfully

### 4. Automatic Contact Matching (NEW!)
When pasting email threads with multiple people, the system now:
- Automatically matches each email to the correct contact
- Uses fuzzy name matching with nickname support
- Matches sender for received emails, recipient for sent emails
- Shows preview modal before saving
- Allows manual adjustment of matches
- Each email saves with its correct contact

**Example:** Thread with emails from Freddie Mitchell, Jon Fuller, and you → automatically assigns:
- Freddie's emails to Freddie contact
- Jon's emails to Jon contact
- Your sent emails to the recipient contact

## Files Created

1. **lib/contact-extraction.ts** - Contact parsing logic
2. **lib/contact-matching.ts** - **NEW:** Fuzzy name matching for auto-contact assignment
3. **components/ContactExtractionModal.tsx** - Contact review UI
4. **components/ContactMatchPreviewModal.tsx** - **NEW:** Preview auto-matched contacts
5. **components/ui/checkbox.tsx** - Checkbox component
6. **components/ui/dialog.tsx** - Dialog component
7. **supabase/migrations/20250117_001_add_multiple_contacts.sql** - Database migration
8. **app/admin/run-migration/page.tsx** - Migration runner UI (optional)
9. **app/api/run-migration/route.ts** - Migration API endpoint (optional)
10. **scripts/apply-migration.mjs** - Migration script (optional)

## Files Modified

1. **lib/ai/thread-detection.ts** - Added Word format patterns
2. **lib/ai/formatter.ts** - Updated AI prompts for Word format
3. **lib/ai/types.ts** - Added extracted_names field
4. **app/actions/contacts.ts** - Fixed JSONB parsing
5. **app/actions/ai-formatter.ts** - **UPDATED:** Accepts contact matches, assigns per entry
6. **app/new-entry/page.tsx** - Integrated contact extraction + matching

## Current Status

✅ **WORKING:**
- Contact extraction from Word documents (tested with ASAHI BEER)
- All 12 contacts extracted correctly
- Thread splitting with dotted separators
- British date format (DD/MM/YYYY)
- Multiple emails/phones per contact
- Contact modal with select/deselect
- Database migration applied
- JSONB parsing fixed
- **Automatic contact matching for email threads**
- **Fuzzy name matching (handles nicknames)**
- **Preview modal showing all matched contacts**
- **Each email saved with correct contact**

## How to Use

### Contact Extraction (optional):
1. Navigate to **New Entry** page
2. Paste Word document text (with contacts section and correspondence)
3. Yellow banner appears: "Detected N contacts"
4. Click **Review & Add Contacts**
5. Select/deselect contacts to add
6. Click **Add N Contacts**
7. Green confirmation: "✓ Added N contacts to [Business Name]"

### Saving Correspondence with Auto-Contact Matching:
8. Blue banner for thread detection appears
9. Toggle "Split into individual emails" (defaults ON for Word format)
10. Select business and a default contact
11. Click **Save Entry**
12. **NEW:** If multiple emails detected, preview modal shows:
    - Each email with its auto-matched contact
    - Ability to adjust matches manually
    - Preview of email content
13. Review matches and click **Save N Emails**
14. Each email saved with its correct contact!

## Testing Completed

- ✅ Extracted 12 contacts from ASAHI BEER document
- ✅ All names, roles, emails, phones parsed correctly
- ✅ Thread splitting recognized dotted separators
- ✅ British dates parsed correctly (14/12/2025 → 2025-12-14)
- ✅ Direction detection worked ("me" → sent)
- ✅ Contacts added to database successfully
- ✅ Business page displays contacts with emails/phones
- ✅ Correspondence saved successfully

## Known Issues

None identified.

## Database Migration Applied

**Migration:** `20250117_001_add_multiple_contacts.sql`

Applied via Supabase SQL Editor. Adds:
- `emails` JSONB column with default `[]`
- `phones` JSONB column with default `[]`
- Migrates existing email/phone data to arrays
- Keeps old columns for backward compatibility

## Next Steps (if needed)

1. **Optional:** Remove old `email` and `phone` columns after confirming all code uses arrays
2. **Optional:** Add bulk contact import from CSV
3. **Optional:** Add contact merge/duplicate detection
4. **Optional:** Add contact tags or categories

## CLAUDE.md Compliance

All features comply with hard rules:
- ✅ Preserves user wording (contact extraction doesn't modify text)
- ✅ Never invents content (only extracts what's present)
- ✅ Manual edits only (user reviews all extracted contacts)
- ✅ Fails gracefully (contact extraction is optional, doesn't block)
- ✅ Strict JSON only (AI returns validated JSON)
- ✅ No placeholders (extracted_names can be null)

## Dependencies Added

- `@radix-ui/react-checkbox` (via shadcn/ui)
- `@radix-ui/react-dialog` (via shadcn/ui)

## Server Status

Development server running on:
- **http://localhost:3000** (or 3001 if 3000 in use)

## Git Status

Committed to master branch:
- Commit: 1a09bbb - Word document import with contact extraction
  - 13 files changed, 1253 insertions, 33 deletions
- Commit: 81c5d86 - Automatic contact matching for email threads
  - 4 files changed, 479 insertions, 27 deletions
- **Total: 17 files changed, 1732 insertions, 60 deletions**
- Ready for next session
