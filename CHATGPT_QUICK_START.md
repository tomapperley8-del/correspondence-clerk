# ChatGPT Quick Start - Correspondence Clerk

**One-page cheat sheet for common tasks**

---

## Project Identity

**Name:** Correspondence Clerk

**Purpose:** Turn messy correspondence (emails, calls, meetings) into clean letter files per business

**NOT a CRM:** Files what happened. Never suggests, rewrites, or follows up.

---

## The 10 Hard Rules (Summary)

These override everything else. Never violate them.

1. **Preserve user wording exactly** - No rewriting, polishing, summarizing
2. **Never invent content** - No suggestions, reminders, auto follow-ups
3. **Enforce forced filing** - Business + contact required to save
4. **Show contact details** - Role, email, phone always visible
5. **Fail gracefully** - AI outage → save as raw text (never block)
6. **No placeholders** - Must name real person, no "Unknown"/"TBD"
7. **Strict JSON only** - AI returns validated JSON, never prose
8. **Manual edits only** - Edits are human corrections, never AI rewrites
9. **Clear labels** - No icon-only buttons
10. **Preserve originals** - Keep `raw_text_original` and `formatted_text_original`

---

## Tech Stack

**Framework:** Next.js 16.1.2 (App Router) + React 19.2.3 + TypeScript 5

**Database:** Supabase (PostgreSQL + Auth + RLS)

**AI:** Anthropic Claude API (formatting, thread splitting)

**UI:** Tailwind CSS v4 + shadcn/ui (no rounded corners, no shadows)

**Export:** Google Workspace MCP

**Integrations:** Outlook Web (bookmarklet)

---

## Common Commands

```bash
npm run dev          # Dev server (localhost:3000 or 3001)
npm run build        # Production build
npm run lint         # ESLint check
npm install          # Install dependencies
```

---

## File Locations

### Pages
- New entry form: `app/new-entry/page.tsx`
- Business detail (letter file): `app/businesses/[id]/page.tsx`
- Dashboard: `app/dashboard/page.tsx`
- Search: `app/search/page.tsx`

### Server Actions
- AI formatting: `app/actions/ai.ts`
- Correspondence CRUD: `app/actions/correspondence.ts`
- Import/export: `app/actions/import.ts`, `app/actions/export.ts`

### AI Logic
- Formatter: `lib/ai/formatter.ts`
- Thread splitting: `lib/ai/split-thread.ts`
- Validation: `lib/ai/validate.ts`

### Components
- Business selector: `components/BusinessSelector.tsx`
- Contact selector: `components/ContactSelector.tsx`
- Modals: `components/Add*Modal.tsx`, `components/Edit*Modal.tsx`
- UI primitives: `components/ui/`

### Outlook Integration
- Bookmarklet: `public/outlook-bookmarklet.js`
- Extractor: `public/outlook-extractor.js`
- Import endpoint: `app/api/import-email/route.ts`

### Database
- Migrations: `supabase/migrations/`
- Types: `lib/types.ts` (or inferred from Supabase)

---

## Database Schema Quick Reference

### `businesses`
- `id`, `name`, `normalized_name` (unique)
- `category`, `status`
- `is_club_card`, `is_advertiser` (boolean flags)
- `last_contacted_at` (auto-updates on new entry)

### `contacts`
- `id`, `business_id` (FK), `name`
- `email`, `normalized_email`, `role`, `phone`
- Unique: `(business_id, normalized_email)`

### `correspondence`
- `id`, `business_id` (FK), `contact_id` (FK), `user_id`
- **Three versions:** `raw_text_original`, `formatted_text_original`, `formatted_text_current`
- `subject`, `entry_date`, `type` (Email|Call|Meeting)
- `action_needed`, `due_at`
- `edited_at`, `edited_by`
- `search_vector` (tsvector, auto-generated)

---

## Common Tasks

### Modify AI Formatting Prompt

**File:** `lib/ai/formatter.ts`

**Function:** `formatEntry(rawText: string)`

**Remember:**
- Preserve user wording exactly (Hard Rule 1)
- Never invent content (Hard Rule 2)
- Return strict JSON only (Hard Rule 7)

### Add Field to Correspondence

1. Create migration: `supabase/migrations/00XX_add_field.sql`
2. Update TypeScript types
3. Update form: `app/new-entry/page.tsx`
4. Update display: `app/businesses/[id]/page.tsx`
5. Update export if needed: `app/actions/export.ts`

### Modify New Entry Flow

**Main file:** `app/new-entry/page.tsx`

**Key components:**
- Business selection (forced, searchable, "Add New")
- Contact selection (forced, scoped to business, "Add New")
- Smart defaults (email domain matching, single contact prefill)
- Thread split toggle (if email chain detected)
- Unsaved changes warning

**Hard Rules:** 3, 4, 6, 9

### Modify Dashboard Sorting

**File:** `app/dashboard/page.tsx`

**Current sort:**
1. Action needed ≠ none
2. Overdue (if `due_at < now`)
3. Oldest `last_contacted_at`

### Add New Export Format

**File:** `app/actions/export.ts`

**Uses:** Google Workspace MCP tools

**Format:**
1. Cover page (business metadata)
2. Entries in chronological order
3. Page break per entry
4. Uses `formatted_text_current` only (Hard Rule 10)

### Debug AI Failures

**Check:**
1. `ANTHROPIC_API_KEY` in `.env.local`
2. API rate limits (50 req/min on Tier 1)
3. Fallback working? Should save as raw text (Hard Rule 5)
4. JSON validation in `lib/ai/validate.ts`

**Common issue:** Invalid JSON from API → should gracefully save as unformatted

### Modify Outlook Integration

**Bookmarklet loader:** `public/outlook-bookmarklet.js`

**Email extractor:** `public/outlook-extractor.js`

**Import endpoint:** `app/api/import-email/route.ts`

**See:** `OUTLOOK_INTEGRATION.md` for setup and troubleshooting

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Google (for export/import)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Debug Checklist

- [ ] Supabase connection working? (check `.env.local`)
- [ ] Anthropic API key valid? (check `.env.local`)
- [ ] RLS policies enabled? (should allow authenticated users full access)
- [ ] Port 3000 available? (or use 3001 as fallback)
- [ ] Dev server running? (`npm run dev`)
- [ ] No TypeScript errors? (`npm run lint`)
- [ ] Build succeeds? (`npm run build`)

---

## Design Constraints

- **No rounded corners** (global Tailwind override)
- **No box shadows** (global Tailwind override)
- **No icon-only buttons** (Hard Rule 9)
- Clean, warm, professional aesthetic
- Minimal training required

---

## Recent Features (Last 10 Commits)

1. **Outlook Web integration** with auto-matching (Jan 16, 2026) ← NEWEST
2. Duplicate detection when copying from formatted page
3. Improved duplicate detection and scroll-to-entry
4. React Hooks compliance fix
5. Four UI enhancements (search, business info, names, duplicates)
6. Automatic contact matching for email threads
7. Word document import with contact extraction
8. Enhanced thread splitting
9. Google Docs import for historical correspondence

---

## Full Documentation

**For comprehensive details, read:**

- **CLAUDE.md** - Requirements and Hard Rules (read this first!)
- **HANDOFF.md** - Complete technical context and history
- **ARCHITECTURE.md** - Database schema, RLS, modules, search
- **USER_FLOW.md** - UX patterns (forced filing, thread split)
- **OUTLOOK_INTEGRATION.md** - Bookmarklet setup and troubleshooting

---

## Key Principles

1. **This is NOT a CRM** - It files correspondence, nothing more
2. **Never suggest, rewrite, or invent** - AI formats layout only
3. **Forced filing is non-negotiable** - Business + contact required
4. **AI outage never blocks saving** - Always allow raw text save
5. **Preserve user's original wording** - No polishing or summarizing
6. **Contact details always visible** - Role, email, phone shown when selected
7. **No placeholders** - Must name a real person every time
8. **Three-version storage** - Original, AI formatted, user edited

---

**Questions?** Read HANDOFF.md for comprehensive answers or ask ChatGPT for help.
