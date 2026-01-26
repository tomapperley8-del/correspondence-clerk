# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
npm start            # Start production server
```

### Testing
```bash
npx tsx scripts/test-ai-formatting.ts    # Test AI formatting
```

### Deployment
```bash
git push origin main             # Auto-deploys to Vercel
vercel --prod --yes              # Manual Vercel deploy
```

## Hard Rules

These 10 rules override everything else when building features:

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

### Tech Stack
- Next.js 15 (App Router, React 19)
- Supabase (PostgreSQL + Auth)
- Anthropic Claude (claude-sonnet-4-5) for AI formatting
- Tailwind CSS v4 + shadcn/ui
- Vercel deployment

### Key Modules

**Server Actions** (`app/actions/`)
- `businesses.ts` - Business CRUD
- `contacts.ts` - Contact CRUD
- `correspondence.ts` - Correspondence CRUD + manual edits
- `ai-formatter.ts` - Anthropic API integration
- `search.ts` - Full-text search
- `export-google-docs.ts` - Google Docs export via MCP

**AI Integration** (`lib/ai/`)
- `formatter.ts` - Anthropic structured outputs
- `thread-detection.ts` - Email chain heuristics
- `types.ts` - AI response contracts

**Database** (`supabase/migrations/`)
- businesses, contacts, correspondence tables
- Full-text search with tsvector + GIN index
- RLS: all authenticated users can read/write

### Data Flow
1. User pastes text -> thread detection (client-side)
2. Server action -> Anthropic API (structured outputs)
3. AI returns JSON -> validate -> save to Supabase
4. If AI fails -> save unformatted (never blocks)

## Design Rules

- NO rounded corners (`border-radius: 0`)
- NO shadows
- British date format (DD/MM/YYYY)
- All buttons have text labels
- System font stack

## Key Pages

- `/dashboard` - Business list with search/filters
- `/businesses/[id]` - Letter file view (correspondence)
- `/new-entry` - Add correspondence (forced filing)
- `/search` - Full-text search

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_APP_URL`

## Documentation

- `PRD.md` - Full product requirements and acceptance criteria
- `ARCHITECTURE.md` - Detailed database schema and RLS policies
- `SESSION_START.md` - Quick start guide for new sessions
- `CURRENT_STATE.md` - Implementation status
- `.cursorrules` - Design and code style rules
