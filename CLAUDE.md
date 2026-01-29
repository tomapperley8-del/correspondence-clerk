# CLAUDE.md

Single source of truth for Claude Code sessions on Correspondence Clerk.

## Production

- **URL:** https://correspondence-clerk.vercel.app
- **Vercel:** tom-apperleys-projects / correspondence-clerk (prj_TLkqSYexjPOdnZNKJGGcq3AGpSO9)
- **Auto-deploys** from `main` branch

## Commands

```bash
npm run dev                              # Dev server (localhost:3000)
npm run build                            # Production build
npm run lint                             # ESLint
npx tsx scripts/test-ai-formatting.ts    # Test AI formatting
git push origin main                     # Deploy (auto via Vercel)
vercel --prod --yes                      # Manual deploy
```

## Hard Rules

These 10 rules override everything else:

1. **PRESERVE USER WORDING EXACTLY** - No rewriting, polishing, summarizing
2. **NEVER INVENT CONTENT** - No suggestions, reminders, auto follow-ups
3. **ENFORCE FORCED FILING** - Cannot save without business AND named contact
4. **SHOW CONTACT DETAILS** - Role, email, phone always visible
5. **FAIL GRACEFULLY** - AI outage never blocks saving
6. **NO PLACEHOLDERS** - Must name real person every time
7. **STRICT JSON ONLY** - AI returns validated JSON, never prose
8. **MANUAL EDITS ONLY** - Edits are human corrections, not AI rewrites
9. **CLEAR LABELS** - No icon-only buttons, all actions labeled
10. **PRESERVE ORIGINALS** - Keep raw_text_original and formatted_text_original

## Architecture

**Stack:** Next.js 15 (App Router, React 19) | Supabase (PostgreSQL + Auth) | Anthropic Claude (claude-sonnet-4-5) | Tailwind CSS v4 + shadcn/ui | Vercel

**Data flow:** User pastes text -> thread detection (client) -> Anthropic API (structured outputs) -> validate JSON -> save to Supabase. If AI fails -> save unformatted (never blocks).

### Key Files

```
app/actions/
  businesses.ts          Business CRUD + delete
  contacts.ts            Contact CRUD + delete + update
  correspondence.ts      Correspondence CRUD + manual edits + delete
  ai-formatter.ts        Anthropic API (structured outputs, retry, fallback)
  search.ts              Full-text search (tsvector + GIN)
  import-mastersheet.ts  CSV import with duplicate merging
  export-google-docs.ts  Google Docs export via MCP

app/
  dashboard/page.tsx           Business list with search/filters/sort
  businesses/[id]/page.tsx     Letter file view (two-section: Recent + Archive)
  new-entry/page.tsx           Add correspondence (forced filing + AI formatting)
  search/page.tsx              Full-text search results
  settings/page.tsx            User settings + Tools (bookmarklet link)
  install-bookmarklet/page.tsx Bookmarklet installer (public)
  admin/import/page.tsx        Mastersheet import UI

lib/ai/
  formatter.ts             Anthropic structured outputs
  thread-detection.ts      Email chain heuristics
  types.ts                 AI response contracts

components/
  BusinessSelector.tsx     Search dropdown + Add New
  ContactSelector.tsx      Scoped to business, shows details
  AddBusinessModal.tsx     Inline add, auto-select
  AddContactModal.tsx      Inline add, auto-select
  EditBusinessButton.tsx   Edit modal + delete
  EditContactButton.tsx    Edit contact modal
  ExportToGoogleDocsButton.tsx  Export button
```

### Database Tables

- **businesses** - name, category, status, membership_type (club_card/advertiser/former_club_card/former_advertiser), address, email, phone, notes, contract fields, last_contacted_at
- **contacts** - business_id, name, emails[], phones[], role, notes (unique per business+email)
- **correspondence** - business_id, contact_id, cc_contact_ids (UUID[]), bcc_contact_ids (UUID[]), raw_text_original, formatted_text_original, formatted_text_current, entry_date, subject, type, direction, formatting_status, action_needed, due_at, edited_at
- **RLS:** All authenticated users can read/write (v1 policy)

## Design Rules

- NO rounded corners (`border-radius: 0`)
- NO shadows
- British date format (DD/MM/YYYY)
- All buttons have text labels
- System font stack

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_APP_URL`

## Screenshot Workflow

User takes screenshot (Win+Shift+S) -> double-clicks "Save Screenshot for Claude.bat" on Desktop -> pastes file path here. Saves to `C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\`.

## Feature Status

All features complete and deployed:

1. Foundation + Auth (Supabase email/password)
2. Database migrations (10 migrations, all run)
3. Dashboard + Business pages (search, filters, sort, flexible date range filter)
4. New Entry flow (forced filing, date required/time optional, direction for emails)
5. AI Formatter (Anthropic structured outputs, 0 JSON errors, 16K token budget, graceful fallback)
6. Manual Editing (correction layer, preserves originals, "Corrected" badge)
7. Full-text Search (business name prioritization, tsvector + GIN)
8. Mastersheet Import (CSV, duplicate merging, idempotent)
9. Google Docs Export (MCP integration, print-ready)
10. Outlook Bookmarklet (email import from Outlook Web, postMessage API)
11. Gmail Bookmarklet (email import from Gmail, postMessage API)
12. CC Contacts (optional additional contacts per correspondence entry)
13. BCC Contacts (hidden recipients, tracked for search)
14. Membership Type in Contract Details (club_card, advertiser, former_club_card, former_advertiser)
15. Business Notes (in Business Details section)
16. Flexible Date Range Filter (1m, 6m, 12m, custom range)

## Recent Changes

- **Jan 29, 2026 (PM):** Added BCC contacts, membership_type in Contract Details (replaces is_club_card/is_advertiser checkboxes), business notes in Business Details, flexible date range filter (1m/6m/12m/custom). Fixed notes deletion (nullable schema), contact deletion now checks for linked correspondence and shows helpful error. Simplified help page.
- **Jan 29, 2026 (AM):** Bug fixes (delete contact dialog, notes cursor jump, contact notes visibility, contact selection error). Added Gmail bookmarklet support, CC contacts feature, rewrote USER_GUIDE.md.
- **Jan 28, 2026:** Lint cleanup - fixed 52 issues (54→27 errors, 36→11 warnings). Removed unused code, replaced `any` types, fixed JSX entities.
- **Jan 26, 2026:** Bookmarklet race condition fix (href set before drag), API uses production URL, Settings > Tools section added
- **Jan 22, 2026:** Eliminated AI JSON errors with Anthropic structured outputs, 100% test success rate

## Known Issues

- Google Docs export requires MCP setup with Google authentication (not yet user-tested)
- ~27 lint errors remain (react-hooks false positives, docx library `any` types) - intentionally skipped

## Reference Docs

Detailed docs live in `docs/` (architecture, PRD, user flow, glossary, deployment guides, migration guides, deployment reports). Only consult when needed for deep dives.
