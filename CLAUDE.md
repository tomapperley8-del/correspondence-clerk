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
npm run dev:setup                        # Seed dev database with test data
npm run db:migrate                       # Run migrations (dev only)
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
  correspondence.ts      Correspondence CRUD + manual edits + delete + duplicate detection
  duplicate-dismissals.ts  Dismiss duplicate pairs
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

lib/marketing/
  companies-house.ts       UK Companies House API client
  google-places.ts         Google Places API client
  smartlead.ts             Cold email API client
  email-generator.ts       AI-generated cold emails
  prospect-scorer.ts       Lead scoring algorithm
  sequence-runner.ts       Email sequence automation
  review-collector.ts      Review request automation
  content-generator.ts     AI social content generator
  linkedin.ts              LinkedIn API client
  twitter.ts               Twitter API client
  blog-generator.ts        AI blog post generator
  industry-data.ts         Programmatic SEO data

app/for/[industry]/page.tsx   Programmatic industry landing pages
app/(public)/tools/           Free tools (email cleaner, letter templates)
app/api/marketing/cron/       Automated marketing cron jobs

components/marketing/
  AIChatbot.tsx            Lead capture chatbot
```

### Database Tables

- **businesses** - name, category, status, membership_type (club_card/advertiser/former_club_card/former_advertiser), address, email, phone, notes, contract fields, last_contacted_at
- **contacts** - business_id, name, emails[], phones[], role, notes (unique per business+email)
- **correspondence** - business_id, contact_id, cc_contact_ids (UUID[]), bcc_contact_ids (UUID[]), raw_text_original, formatted_text_original, formatted_text_current, entry_date, subject, type, direction, formatting_status, action_needed, due_at, edited_at
- **duplicate_dismissals** - business_id, entry_id_1, entry_id_2, dismissed_by, dismissed_at (tracks user-dismissed duplicate pairs)
- **user_profiles** - id (references auth.users), organization_id, display_name, role (member/admin)
- **marketing_prospects** - Companies House data, SIC codes, score, status
- **marketing_leads** - Lead capture from tools/chatbot, source, score
- **referrals** - Referral codes, referrer/referee tracking
- **email_sequence_templates** - Nurture sequence definitions
- **email_sequence_enrollments** - Users in active sequences
- **social_content** - Scheduled social media posts
- **blog_posts** - Auto-generated blog content
- **review_requests** - Review request tracking
- **chatbot_conversations** - AI chatbot logs
- **RLS:** All authenticated users can read/write (v1 policy)

## Design Rules

- Very subtle rounded corners (2-4px) - barely perceptible softness for trustworthiness
- Subtle shadows allowed (use CSS variables: `--shadow-sm`, `--shadow-md`, `--shadow-lg`)
- British date format (DD/MM/YYYY)
- All buttons have text labels
- Warm color palette: off-white backgrounds (#FAFAF8), slate header (#1E293B), mature olive accents (#7C9A5E)
- Blues: deep navy-slate (#2C4A6E) not bright tech-blue - more legal/financial trustworthiness
- Fonts: Lora (serif) for h1/h2 headings, Inter (sans) for body text
- Gentle transitions (0.2s ease-out on interactive elements)
- Very soft borders: rgba(0,0,0,0.06) - confident, not cramped

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_APP_URL`

Optional (for production email):
- `SENDGRID_API_KEY` - SendGrid API key for sending invitation emails
- `SENDGRID_FROM_EMAIL` - Sender email address (default: noreply@correspondenceclerk.com)

Feature flags (all false by default):
- `FEATURE_BILLING_ENABLED` - Enable Stripe billing integration
- `FEATURE_PUBLIC_SIGNUP` - Allow public signups without invitation
- `FEATURE_LANDING_PAGE` - Show marketing landing page for unauthenticated users
- `FEATURE_CUSTOM_DOMAINS` - Enable custom domain support (Enterprise)
- `FEATURE_API_ACCESS` - Enable API access (Enterprise)
- `FEATURE_SSO` - Enable SSO integration (Enterprise)
- `FEATURE_BRANDING` - Enable custom branding (Enterprise)

Stripe (required when FEATURE_BILLING_ENABLED=true):
- `STRIPE_SECRET_KEY` - Stripe secret API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `STRIPE_PRO_PRICE_ID_MONTHLY` - Stripe price ID for Pro monthly
- `STRIPE_PRO_PRICE_ID_YEARLY` - Stripe price ID for Pro yearly
- `STRIPE_ENTERPRISE_PRICE_ID_MONTHLY` - Stripe price ID for Enterprise monthly
- `STRIPE_ENTERPRISE_PRICE_ID_YEARLY` - Stripe price ID for Enterprise yearly
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key (client-side)

Marketing automation (optional):
- `COMPANIES_HOUSE_API_KEY` - UK Companies House API key (free)
- `GOOGLE_PLACES_API_KEY` - Google Places API key
- `SMARTLEAD_API_KEY` - Smartlead cold email API key
- `LINKEDIN_ACCESS_TOKEN` - LinkedIn Marketing API access token
- `TWITTER_BEARER_TOKEN` - Twitter API v2 bearer token
- `CRON_SECRET` - Secret for authenticating Vercel cron jobs

## Screenshot Workflow

User takes screenshot (Win+Shift+S) -> double-clicks "Save Screenshot for Claude.bat" on Desktop -> pastes file path here. Saves to `C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\`.

## Feature Status

All features complete and deployed:

1. Foundation + Auth (Supabase email/password)
2. Database migrations (10 migrations, all run)
3. Dashboard + Business pages (search, filters, sort, flexible date range filter)
4. New Entry flow (forced filing, date required/time optional, direction for emails)
5. AI Formatter (Anthropic structured outputs, 0 JSON errors, 8K token budget, graceful fallback)
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
17. Duplicate Detection (warning banner on business page, delete or dismiss duplicates)
18. SaaS Foundation (feature flags, Stripe billing, landing page, pricing page, terms/privacy)
19. Automated Marketing Engine (prospect discovery, cold email, social autopilot, programmatic SEO, blog automation, free tools, AI chatbot, referral system, review automation)

## Recent Changes

- **Feb 02, 2026 (PM):** Fully automated marketing engine complete. Added prospect discovery (Companies House + Google Places), cold email automation (Smartlead integration with AI-generated emails), social media autopilot (LinkedIn + Twitter), programmatic SEO (15+ industry landing pages at /for/[industry]), blog automation, free tools (email cleaner, letter templates), AI chatbot for lead capture, referral system, email nurture sequences, review request automation. Target ICP: freelance consultants, small agencies (2-5 people), independent accountants/bookkeepers. 8 Vercel cron jobs configured for full automation.

- **Feb 02, 2026:** SaaS productization Phase 1 complete. Added feature flags system, Stripe billing integration (subscriptions, webhooks, billing portal), landing page with marketing components, pricing page, features page, terms of service, privacy policy. Updated middleware for trial expiry checks. Organization creation now sets up 14-day trial when billing enabled. Signup page now includes terms agreement checkbox.

- **Jan 31, 2026 (PM):** Additional performance optimizations: added 500ms debounce to contact extraction (new-entry page), optimized getCorrespondenceByBusiness/getContactsByBusiness/getBusinessById/getContactById to select specific columns instead of SELECT *, added GIN index for cc_contact_ids and indexes for temporary_email_data (token, expires_at), optimized email import contact matching with query-side filter (eliminates loop over 100 contacts).
- **Jan 31, 2026:** Performance optimizations: added 300ms debounce to thread detection (eliminates input lag), reduced AI max_tokens to 8192 (reduced latency), optimized getBusinesses to fetch only required columns (30-40% less data), combined contact delete queries (3x fewer round-trips), added GIN index for bcc_contact_ids, limited duplicate detection to recent 500 entries, added useMemo to dashboard filtering.
- **Jan 30, 2026 (PM):** Added duplicate detection with warning banner on business page (uses content_hash). Users can delete newer entry or mark as "not duplicate". Added loading indicators across site (ConfirmDialog, modals, delete buttons show "Deleting...", "Saving..." etc.).
- **Jan 30, 2026 (AM):** Pre-launch security fixes: removed unauthenticated /api/run-migration endpoint (CRITICAL), added user roles (member/admin) with admin-only protection on /admin/* routes and import actions, implemented SendGrid email delivery for invitations, added rate limiting to AI formatter (20/min), search (30/min), and email import (60/min) endpoints.
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
