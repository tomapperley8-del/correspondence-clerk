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
  organizations.ts       Org CRUD + getNavData() (single round-trip for nav state)
  membership-types.ts    Per-org configurable membership types
  files.ts               File upload/delete/download (Supabase Storage)

app/
  dashboard/page.tsx           Business list with search/filters/sort + onboarding checklist
  businesses/[id]/page.tsx     Letter file view + sub-components in _components/
  businesses/[id]/_components/ CorrespondenceEntry, EditForm, ThreadAssignPanel, AllEntriesView,
                               ThreadsView, FilterBar, DuplicatesWarningBanner, ContactsList,
                               BusinessFiles
  new-entry/page.tsx           Add correspondence (forced filing + AI formatting + draft autosave)
  actions/page.tsx             Unified smart list (replies first → overdue → due today → renewals → quiet → reminders)
  daily-briefing/page.tsx      Full-page inline ChatPanel
  search/page.tsx              Full-text search results
  import/gmail/page.tsx        Gmail bulk import wizard
  import/outlook/page.tsx      Outlook bulk import wizard
  inbox/page.tsx               Inbound email queue triage
  onboarding/                  4-step flow (create-org → describe-business → first-business → new-entry)
  settings/page.tsx            User settings + Tools + membership types
  install-bookmarklet/page.tsx Bookmarklet installer (public)
  admin/import/page.tsx        Mastersheet import UI

app/api/
  inbound-email/route.ts       Forward Email webhook → verify → spam filter → block check → match → AI format → auto-file or queue
  import/[provider]/scan       OAuth email scan (headers only, returns scanId)
  import/[provider]/execute    Chunked import (150/req, auto-loops client-side)
  chat/route.ts                Daily Briefing AI endpoint (uses org business_description + industry)

lib/ai/
  models.ts                Centralised AI model constants (PREMIUM=Sonnet, ECONOMY=Haiku)
  formatter.ts             Anthropic structured outputs + regex fast-path
  relationship-memory.ts   Post-insight Haiku call to distil 3-sentence relationship memory
  thread-detection.ts      Email chain heuristics
  types.ts                 AI response contracts

lib/
  inbound/utils.ts             isPersonalDomain, stripQuotedContent
  email-import/execute-chunk.ts  Shared Gmail+Outlook chunked import logic
  toast.ts                     Toast emitter (CustomEvent — call toast.success/error/info())
  supabase/service-role.ts     createServiceRoleClient() for cron/session-less contexts

components/
  CommandSearch.tsx        Cmd+K global overlay (sessionStorage cache 5min TTL, keyboard nav)
  Navigation.tsx           App nav + actions badge + Daily Briefing button
  ChatPanel.tsx            Daily Briefing AI panel (inline=true or slide-out overlay)
  Toast.tsx                Toast container (singleton in layout.tsx)
  BusinessSelector.tsx     Search dropdown + Add New
  ContactSelector.tsx      Scoped to business, shows details
  AddBusinessModal.tsx     Inline add, auto-select
  AddContactModal.tsx      Inline add, auto-select
  EditBusinessButton.tsx   Edit modal + delete
  EditContactButton.tsx    Edit contact modal
  ExportToGoogleDocsButton.tsx  Export button
  import/ReviewWizard.tsx  Editable business/contact review before bulk import execute

lib/marketing/ + app/(public)/ + app/for/[industry]/  Marketing engine (see Feature Status #19)
```

### Key Patterns

- **Server actions**: always auth check + org_id check first → `revalidatePath` after mutations
- **Supabase client**: `createClient()` from `@/lib/supabase/server` (server actions/routes); `createServiceRoleClient()` for cron or session-less contexts
- **Design tokens**: NEVER raw hex. Use token classes: `bg-brand-navy`, `text-brand-dark`, `bg-brand-olive`, `bg-brand-paper`, `hover:bg-brand-navy-hover`. CSS vars for inline styles: `var(--link-blue)`, `var(--header-bg)`, `var(--main-bg)`
- **Duplicate detection**: `content_hash` (SHA256) — groups by hash, excludes dismissed pairs from `duplicate_dismissals`
- **Thread split**: AI splits → ContactMatchPreviewModal (user reviews contacts) → createFormattedCorrespondence; use `isThreadSplitResponse()` type guard
- **contact_id nullable**: Note type entries have no contact — guard before accessing contact fields
- **Toast**: `import { toast } from '@/lib/toast'` then `toast.success('message')` — works anywhere client-side

### Actions Architecture

The Actions page (`app/actions/page.tsx`) uses **5 collapsible sections**. Needs Reply + Actions Due are expanded by default; Renewals, Gone Quiet, Reminders are collapsed. Data flows through `buildUnifiedList()` → `unifiedList` (also drives keyboard nav); sections are visual groupings filtering from `unifiedList`. Gone Quiet uses compact `QuietRow` components (not full cards).

**Signal sources (5 server action fetches in parallel on load):**
1. `getNeedsReply()` — received correspondence where Tom has sent nothing to that business since; client-side `likelyNeedsReply()` heuristic filters closers/OOO/signatures
2. `getOutstandingActions()` — `action_needed != 'none'` entries, ordered by due_at
3. `getPureReminders()` — `action_needed = 'none'` but `due_at IS NOT NULL`
4. `getGoneQuiet()` — businesses with `last_contacted_at < 60 days ago` and 3+ entries
5. `getContractExpiries()` — businesses where `contract_end IS NOT NULL` and within 30 days (null-safe — only fires when data exists)

**"Needs Reply" logic:** fetches last 90 days; for each received entry checks `entries.some(other => other.direction === 'sent' && other.business_id === entry.business_id && otherDate > entryDate)` — any sent correspondence clears it. Also excludes: `reply_dismissed_at IS NOT NULL` (Done), `due_at > NOW()` (snoozed), `action_needed = 'waiting_on_them'`.

**Done persistence:** `correspondence.reply_dismissed_at TIMESTAMPTZ` (migration 20260408_001). `markCorrespondenceDone()` sets it; `getNeedsReply()` filters it at DB level. Done = permanently done.

**Badge urgency order:** REPLY (7+ days) → REPLY (3–6 days) → OVERDUE → DUE_TODAY → DUE_TOMORROW → DUE_SOON → RENEWAL (<7d) → FLAG → RENEWAL (7–30d) → QUIET → REMINDER

**How items enter the system (three paths):**
1. **Manual one-click flag** — "Follow-up" button on `CorrespondenceEntry.tsx` calls `setCorrespondenceAction(id, 'follow_up', dueAt)` where `dueAt = today + 7 days`. `setCorrespondenceAction` in `app/actions/correspondence.ts` accepts optional `dueAt`.
2. **AI auto-flag on inbound email** — `app/api/inbound-email/route.ts`: if `ai_result.action_suggestion.confidence === 'high'`, `action_needed` and `due_at` are set on the correspondence row at insert time. Completely automatic. If AI fails, falls back to `action_needed: 'none'` — never blocks.
3. **Insights push** — "Add to Actions" button in `components/InsightsPanel.tsx` (shown for `call_prep`, `next_best_action`, `what_did_we_agree`, `outreach_draft`, `risk_check` insight types) calls `createCorrespondence` with `action_needed: 'follow_up'` on the business.

**Actions vs Insights distinction:**
- **Actions** = tactical, time-sensitive, clearable. Answers: "what do I do TODAY?"
- **Insights** = strategic intelligence, relationship context. Answers: "what should I KNOW?"
- Insights can push into Actions (one-way). Actions does not pull from Insights automatically.

**Keyboard shortcuts:** `↑ ↓` navigate · `D` done · `S` snooze 7d · `L` reply/log

### Database Tables

- **businesses** - name, category, status, membership_type (string, now configurable per org), address, email, phone, notes, contract fields, last_contacted_at, relationship_memory (AI-distilled 3-sentence summary), relationship_memory_updated_at
- **contacts** - business_id, name, emails[], phones[], role, notes, is_active (unique per business+email)
- **correspondence** - business_id, contact_id (nullable — Notes have no contact), cc_contact_ids (UUID[]), bcc_contact_ids (UUID[]), raw_text_original, formatted_text_original, formatted_text_current, entry_date, subject, type, direction, formatting_status, action_needed, due_at, reply_dismissed_at, edited_at, content_hash
- **duplicate_dismissals** - business_id, entry_id_1, entry_id_2, dismissed_by, dismissed_at
- **organizations** - id, name, business_description, industry (used in Daily Briefing system prompt)
- **org_membership_types** - id, org_id, label, value, sort_order, is_active (per-org configurable types)
- **user_profiles** - id, organization_id, display_name, role (member/admin), google/microsoft OAuth tokens, inbound_email_token
- **import_queue** - id, org_id, correspondence_id, status (pending/processing/done/failed), retry_count, error
- **inbound_queue** - queued inbound emails awaiting manual filing
- **domain_mappings** - org_id, domain, business_id (auto-filing for inbound email, populated on first manual file)
- **insight_history** - id, org_id, business_id (nullable), insight_type, content, generated_at (archive of all generated insights, populated on each generation)
- **business_files** - id, business_id, organization_id, user_id, filename, storage_path, file_type, file_size_bytes, parsed_text, created_at (Supabase Storage bucket: `business-files`)
- **marketing_prospects/leads/referrals/email_sequence_*/social_content/blog_posts/review_requests/chatbot_conversations** - marketing engine tables
- **RLS:** All authenticated users can read/write (v1 policy)

## Design Rules

- Very subtle rounded corners (2-4px) - barely perceptible softness for trustworthiness
- Subtle shadows allowed (use CSS variables: `--shadow-sm`, `--shadow-md`, `--shadow-lg`)
- British date format (DD/MM/YYYY) via `formatDateGB()`
- All buttons have text labels (no icon-only)
- Warm palette — token classes only, never raw hex:
  - `bg-brand-dark` / `text-brand-dark` = #1E293B (slate header)
  - `bg-brand-navy` / `hover:bg-brand-navy-hover` = #2C4A6E (primary buttons/links)
  - `bg-brand-olive` = #7C9A5E (accents, secondary actions)
  - `bg-brand-paper` = #FAFAF8 (page background)
  - `bg-brand-warm` = #F8F7F4 (card backgrounds)
  - CSS vars for inline styles: `var(--link-blue)`, `var(--header-bg)`, `var(--main-bg)`
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
- `RESEND_API_KEY` - Resend API key for sending emails (invitations, daily briefing)
- `RESEND_FROM_EMAIL` - Sender email address (default: noreply@correspondenceclerk.com)

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

All features complete and deployed (unless noted):

1. Foundation + Auth (Supabase email/password, user roles member/admin)
2. Dashboard + Business pages (search, filters, sort, flexible date range, DB pagination)
3. New Entry flow (forced filing, date required/time optional, direction for emails, draft autosave)
4. AI Formatter (Anthropic structured outputs, Haiku model, 4K token budget, regex fast-path for short emails, graceful fallback)
5. Manual Editing (correction layer, preserves originals, "Corrected" badge)
6. Full-text Search (business name prioritization, tsvector + GIN)
7. Mastersheet Import (CSV, duplicate merging, idempotent)
8. Google Docs Export (MCP integration, print-ready)
9. Outlook + Gmail Bookmarklets (email import via postMessage API)
10. CC + BCC Contacts (tracked for search)
11. Duplicate Detection (content_hash, warning banner, delete or dismiss)
12. SaaS Foundation (feature flags, Stripe billing, landing page, pricing page, terms/privacy)
13. Automated Marketing Engine (prospect discovery, cold email, social autopilot, programmatic SEO, blog, free tools, AI chatbot, referral system, review automation)
14. Bulk Email Import Wizard (Gmail + Outlook OAuth, chunked execute, ReviewWizard)
15. Daily Briefing (AI chat panel — inline page + slide-out overlay, org business context)
16. Configurable Membership Types (per-org settings UI)
17. Onboarding flow (4-step: org → describe business → first business+contact → first entry)
18. Actions page (priority list, needs-reply, gone-quiet, flagged, reminders, keyboard shortcuts)
19. Inbound Email Forwarding + BCC Capture — **live** (Forward Email $3/month, migrated from Postmark. Flat payload format — see project_forward_email_migration.md)
20. Daily Briefing Email — **live** (Resend cron at 8am, opt-out toggle in Settings, smart cache reuse)
21. API Cost Reduction — **live** (model tiering: Haiku for 9/11 call sites, Sonnet for Chat + strategic Insights only. Centralised in `lib/ai/models.ts`. Cache TTLs doubled. Prompt caching added to 6 endpoints. Regex bypass for trivial emails.)
22. Actionable Insight Buttons — contextual actions on 7 insight types (Log call, Copy draft, View Actions, etc.)
23. File Uploads — **live** (Supabase Storage, 10MB/file, 50MB/org cap, upload/download/delete on business pages.)
24. UX Audit — **live** (P28: modal save mechanics, consistency pass, toast dismiss, onboarding steps, empty states, design token sweep across 25+ files)
25. Insight History — **live** (P33: `insight_history` table, "View history" in expanded InsightCard, timeline of past snapshots, click to view previous versions)
26. Relationship Memory — **live** (P34: Haiku distils 3-sentence summary per business after each insight, stored in `businesses.relationship_memory`. Reduces correspondence context 50→30 entries. Fire-and-forget.)
27. Actions Page Redesign — **live** (P35: unified smart list. Replies always first. Contract expiries auto-surface (30-day window). AI high-confidence action suggestions applied on inbound auto-file. One-click flag on business page sets due_at +7 days. Enhanced quick log panel (type/date/time + mark done checkbox). Insights "Add to Actions" push button on 5 business insight types.)
28. Actions Page v2 — **live** (P36: 5 collapsible sections replace flat list. Smarter "Needs Reply": checks if any sent correspondence to that business exists after the received email — no 7-day cap, direction-aware. Done = permanently done via `reply_dismissed_at` column. Snooze persists via `due_at` check. Signature stripping in likelyNeedsReply(). Gone Quiet uses compact rows. Header shows urgent counts only.)

## Recent Changes

- **Apr 09, 2026:** Session 4 — Business page server component conversion: `page.tsx` is now an async server component (40 lines) that fetches business/contacts/duplicates/threads/membershipTypes server-side. `BusinessDetailClient.tsx` extracted for all interactive state. `CorrespondenceSummary` + `ActionSuggestions` no longer auto-fire — show "Generate"/"Detect" button instead (saves 2 Anthropic calls per page visit). "Back to Actions" breadcrumb when navigating from Actions page (`?from=actions`). `EditBusinessDetailsButton` no longer calls `window.location.reload()`. Empty state now has "Add First Entry" link.
- **Apr 08, 2026:** P36 — Actions page v2: 5 collapsible sections (Needs Reply + Actions Due expanded; Renewals / Gone Quiet / Reminders collapsed). "Needs Reply" now direction-aware — any sent correspondence to a business after receiving their email clears it (no 7-day cap). `reply_dismissed_at` column makes Done permanent. Snooze persists via due_at check. likelyNeedsReply() strips signatures before word count. Gone Quiet uses compact rows. Header shows urgent counts only. Migration: `20260408_001_add_reply_dismissed.sql`.
- **Apr 07, 2026:** P35 — Actions page redesign: unified smart list (single sorted feed). Replies always first. Added contract expiry signals (30-day window, null-safe). AI high-confidence action suggestions now applied when inbound emails are auto-filed. One-click flag on business page entries sets follow_up + due_at +7 days. Enhanced quick log panel (type/date/time + mark-done checkbox). Insights "Add to Actions" push button for 5 business insight types. Keyboard shortcut R→L.
- **Apr 07, 2026:** P34 — Relationship memory: after each business-specific insight generation, Haiku distils a 3-sentence relationship summary (`businesses.relationship_memory`). Injected into all business insight prompts as context. Correspondence limit reduced from 50→30 when memory exists. Fire-and-forget (doesn't block response). Migration: `20260407_002_add_relationship_memory.sql`. New: `lib/ai/relationship-memory.ts`.
- **Apr 07, 2026:** P33 — Insight history: new `insight_history` table archives every generated insight. "View history" button in expanded InsightCard shows timeline of past snapshots with content preview. Click any entry to view that version's content, "Back to current" to return. Migration: `20260407_001_add_insight_history.sql`.
- **Apr 05, 2026:** P28 — Full UX audit: replaced `window.location.reload()` with `router.refresh()` in edit modals, success toasts on all modals, standardised modal styling (errors, buttons, autofocus, close buttons), toast dismiss button, onboarding step numbering fix (5→4), filtered empty state on business page, duplicate detection explainer, Ctrl+K hint in nav, design token sweep (60+ raw blue-600 → brand-navy across 25+ files).
- **Apr 04, 2026:** P32 + P19 — Actionable insight buttons (7 types with contextual actions in expanded cards). File uploads on business pages (Supabase Storage, server actions, BusinessFiles component, 50MB org cap). API cost reduction — 9/11 AI call sites switched to claude-haiku-4-5 (3x cheaper). Centralised model constants in `lib/ai/models.ts`. Token budgets reduced (formatter 8K→4K, chat 16K→8K). Insight cache TTLs doubled (org 48h, biz 12h). Prompt caching added to 6 endpoints. Regex bypass skips AI for short structured emails.
- **Apr 02, 2026:** P31 — daily briefing email via Resend cron (8am, smart cache, opt-out toggle in settings). Replaced SendGrid with Resend across all email sending. Domain verified on Resend (eu-west-1).
- **Apr 02, 2026:** Inbox UX pass — auto-file on definite contact match, block sender (new `blocked_senders` table), fix sent path for personal-domain contacts, remove over-aggressive auto-submitted spam rule, auto-filed section open by default with Edit links. Migrated inbound from Postmark → Forward Email ($3/month Enhanced Protection, no per-email limits).
- **Apr 01, 2026:** Insights feature — replaced Daily Briefing chatbot with 16 structured cached AI summaries + 5 custom presets. Org profile expanded (5 AI context fields). 3 bug fixes: Buried Gold dedicated fetcher, Briefing context enriched (recent activity + quiet businesses), status field replaced with membership_type logic throughout.
- **Mar 27, 2026:** P8 complete — all border-2/blue-600 eliminated, replaced with brand tokens across 11 files. P5: Actions nav hidden until first entry. P6: describe-your-business onboarding step + dashboard completion checklist. P7: mobile Daily Briefing button + custom favicon (CC initials). Inbound email DB migrated + inbox UI polished.
- **Mar 26, 2026:** Security fix (org_id guard on /api/businesses). Bug fixes (call direction badge, note formatting, keyboard shortcuts). Cmd+K sessionStorage cache (5min TTL). Actions all-clear panel. Inbound email code complete + DB migrated.
- **Mar 25, 2026:** Code audit — design token system (7 brand tokens, 200+ hex replacements). Business page refactor (2180→1200 lines, 8 sub-components). DB pagination (limit/offset, Load More, refreshCorrespondence helper). Actions priority list + direction badges + snippets.
- **Mar 24, 2026:** Bulk email import (Gmail + Outlook OAuth, chunked execute, ReviewWizard). Unified Actions page. Daily Briefing page + ChatPanel (inline + slide-out). Landing page full rewrite. UX polish (toasts, Cmd+K, draft autosave, optimistic actions, new entries badge, jump to today).
- **Mar 23, 2026:** Configurable membership types per org. Organisation profile (business_description + industry for AI context). 4-step onboarding flow.
- **Feb 02, 2026:** Marketing engine + SaaS productization (Stripe billing, feature flags, landing page, pricing page).

## Known Issues

- Google Docs export requires MCP setup with Google authentication (not yet user-tested)
- ~27 lint errors remain (react-hooks false positives, docx library `any` types) - intentionally skipped

## Reference Docs

Detailed docs live in `docs/` (architecture, PRD, user flow, glossary, deployment guides, migration guides, deployment reports). Only consult when needed for deep dives.
