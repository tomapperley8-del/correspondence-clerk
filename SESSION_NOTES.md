# Session Notes - Word Document Import Feature

**Date:** 2026-01-16
**Commit:** 1a09bbb - "feat: Word document import with contact extraction and enhanced thread splitting"

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

## Files Created

1. **lib/contact-extraction.ts** - Contact parsing logic
2. **components/ContactExtractionModal.tsx** - Contact review UI
3. **components/ui/checkbox.tsx** - Checkbox component
4. **components/ui/dialog.tsx** - Dialog component
5. **supabase/migrations/20250117_001_add_multiple_contacts.sql** - Database migration
6. **app/admin/run-migration/page.tsx** - Migration runner UI (optional)
7. **app/api/run-migration/route.ts** - Migration API endpoint (optional)
8. **scripts/apply-migration.mjs** - Migration script (optional)

## Files Modified

1. **lib/ai/thread-detection.ts** - Added Word format patterns
2. **lib/ai/formatter.ts** - Updated AI prompts for Word format
3. **lib/ai/types.ts** - Added extracted_names field
4. **app/actions/contacts.ts** - Fixed JSONB parsing
5. **app/new-entry/page.tsx** - Integrated contact extraction

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

## How to Use

1. Navigate to **New Entry** page
2. Paste Word document text (with contacts section and correspondence)
3. Yellow banner appears: "Detected N contacts"
4. Click **Review & Add Contacts**
5. Select/deselect contacts to add
6. Click **Add N Contacts**
7. Green confirmation: "✓ Added N contacts to [Business Name]"
8. Blue banner for thread detection appears
9. Toggle "Split into individual emails" (defaults ON for Word format)
10. Select business, contact, and save
11. AI creates separate entries with correct dates

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
- Commit: 1a09bbb
- 13 files changed, 1253 insertions, 33 deletions
- Ready for next session
