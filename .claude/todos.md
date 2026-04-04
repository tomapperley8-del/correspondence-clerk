# Implementation Plan
Last updated: 04/04/2026

This is the single source of truth for what needs doing, in order.
Pick up from the first incomplete item each session.

---

## CRITICAL — Do before anything else

- [x] **P3-Fix4** — Add `organization_id` filter to `/api/businesses/route.ts` — currently returns ALL orgs' businesses (security bug) (26/03/2026)
- [x] **P3-Fix3** — Add recursion depth guard to `lib/rate-limit.ts` — infinite loop risk on 23505 conflict (26/03/2026)

---

## Batch 1 — Bug Fixes

- [x] **P2-Fix1** — Call direction badge: show "CALLED" / "CALL FROM" not "SENT TO" / "RECEIVED FROM" in `CorrespondenceEntry.tsx` (26/03/2026)
- [x] **P2-Fix2** — Pinned entries: already implemented — entries appear in both Pinned section and chronological position (recent/archive), with "Pinned" badge in CorrespondenceEntry (26/03/2026)
- [x] **P2-Fix3** — Remove `'conversation'` from direction filter in `CorrespondenceFilterBar.tsx` and union type in `page.tsx` (26/03/2026)
- [x] **P2-Fix4** — Note formatting bug: `handleConfirmPreview` was silently returning early due to `!selectedContactId` guard — Notes don't require a contact (26/03/2026)
- [x] **P2-Fix5** — Keyboard shortcuts: all sections collapsed by default meant allItems was empty; fixed by including all items in allItems regardless of collapsed state + auto-expand section on navigation (26/03/2026)

---

## Batch 2 — Hardening

- [x] **P3-Fix1** — Wrap `JSON.parse` calls in `contacts.ts` (emails, phones) in try-catch, return `[]` on failure (26/03/2026)
- [x] **P3-Fix2** — Replace module-level Anthropic client in `ai-summary.ts` with lazy singleton (26/03/2026)
- [x] **P3-Fix5** — Switch `search.ts` to `websearch` type for `textSearch` (more robust query parsing) (26/03/2026)
- [x] **P3-Fix6** — Add `viewport` export to `app/layout.tsx` (26/03/2026)
- [x] **P3-Fix7** — Add Supabase preconnect `<link>` hint to `app/layout.tsx` (26/03/2026)
- [x] **P3-Fix8** — Replace raw error strings in `ChatPanel.tsx` with friendly messages (26/03/2026)

---

## Batch 3 — Features (stability)

- [x] **P4** — SessionStorage cache for businesses list in `CommandSearch.tsx` (5-min TTL, invalidate on `businesses:changed` event) (26/03/2026)
- [x] **P5-Fix1** — Actions page all-clear: single centred panel when all four sections empty, instead of four collapsed empty sections (26/03/2026)
- [x] **P5-Fix2** — Add `hasCorrespondence` to `NavData` in `organizations.ts`; hide Actions nav link until first entry exists (26/03/2026)
- [x] **P6-Fix1** — Add `/onboarding/describe-your-business` step (textarea + industry field, saves to `organizations` table); update create-organization to redirect there first. Check DB columns exist before coding. (26/03/2026)
- [x] **P6-Fix2** — Dashboard dynamic completion checklist: 3 steps (business → contact → entry), auto-hides when all done, uses `localStorage` to stay dismissed (26/03/2026)
- [x] **P7-Fix1** — Add "Open Daily Briefing" button on mobile dashboard (below `md` breakpoint) that opens slide-out ChatPanel (26/03/2026)
- [x] **P7-Fix2** — Replace default Vercel favicon with `app/icon.svg` (CC initials, #1E293B background); add `icons` to `layout.tsx` metadata (27/03/2026)
- [x] **P8** — Visual & spacing audit: eliminated all border-2/blue-600 across 11 files, replaced with brand-navy tokens; actions page badge colours, dashboard filter buttons, all modals, new-entry, search, settings (27/03/2026)
- [x] **P9-Fix1** — Data Health section in settings: `getUnformattedCount()` + `formatAllUnformatted()` server actions; show only when count > 0 (27/03/2026)
- [x] **P9-Fix2** — Time field in edit form: preserve original time when only date changed — `handleSaveEdit` now combines new date + original time via `setFullYear` (27/03/2026)
- [x] **P9-Fix3** — Edit unformatted entries: `updateFormattedText` now sets `formatting_status = 'formatted'` on save, clearing orange warning banner (27/03/2026)

---

## Batch 4 — GDPR & Launch Requirements

- [x] **P10-F1** — Data export: `app/api/export/route.ts` returning CSV for businesses/contacts/correspondence; three download buttons in settings (27/03/2026)
- [x] **P10-F2** — Account deletion: "Delete Account" in settings (confirmation dialog, type DELETE, cascade delete, `auth.admin.deleteUser`, redirect to `/login?message=account-deleted`) (27/03/2026)
- [x] **P10-F3** — Custom 404: `app/not-found.tsx` (brand-consistent, link back to dashboard) (27/03/2026)
- [x] **P21** — Direction bug fix: merged `updateCorrespondenceDirection` into `updateFormattedText` (single DB call, deleted separate function). new-entry audited — navigates away on submit, no stale state. (30/03/2026)
- [x] **P22** — Old contracts expiry: pass `is_current` to `ContractStatusBadge`; historical contracts now show a static "Historical" label instead of an "Expired N days ago" countdown. (30/03/2026)

---

## Batch 5 — AI Cost & Quality

- [x] **P12** — Prompt caching: `cache_control: { type: 'ephemeral' }` on system prompts in `lib/ai/formatter.ts` + `ai-action-detection.ts`. Chat route was already cached. ai-summary.ts skipped (no static system prompt). (30/03/2026)
- [x] **P13** — Single combined AI call: merge formatter + action detection into one structured output per entry. `lib/ai/types.ts` + `lib/ai/formatter.ts` schema + prompts updated; `new-entry/page.tsx` pre-fills actionNeeded from medium/high confidence suggestions; `ai-action-detection.ts` kept with deprecation note. (30/03/2026)
- [x] **P14** — Quoted content stripping: wire existing `stripQuotedContent()` from `lib/inbound/utils.ts` into `lib/ai/formatter.ts` before building the prompt. Do NOT create a separate file — import from where it already lives. Store `quotedContent` in `ai_metadata`. (30/03/2026)

---

## Batch 6 — Infrastructure & Marketing

- [x] **P15** — Inbound email forwarding: LIVE. Migrated from Postmark → Forward Email ($3/month, no limits). BCC capture live, inbox UI polished (27/03/2026)
- [x] **P15b** — Inbox direction fix + UX overhaul: direction stored in queue, SENT/RECEIVED badge, expandable body, auto-match contact, own email addresses in settings (30/03/2026)
- [x] **P15c** — Inbox UX pass: auto-file on definite contact match, block sender, fix sent path for personal-domain contacts, remove over-aggressive auto-submitted spam rule, auto-filed section open by default with Edit links (02/04/2026)
- [x] **P16** — Landing page FAQ: `components/marketing/FAQ.tsx` — 6 questions, native `<details>/<summary>`, inserted above CTASection. (30/03/2026)
- [x] **P17** — ~~Sentry monitoring~~ **Dropped** — not worth it at current scale. Revisit when 10+ orgs. (04/04/2026)
- [x] **P24** — Inbound email structured logging: JSON log lines at every decision point in webhook handler (received, discarded, direction, auto-filed, queued, formatting). Send test button + Outlook docs were already in place. (30/03/2026)
- [x] **P25** — Docs audit: updated CURRENT_STATE.md (features 1-19, schema, file list, design rules), ARCHITECTURE.md (schema, modules, env vars), USER_GUIDE.md (inbound email, Actions, AI Assistant, bulk import), USER_FLOW.md (onboarding + inbound email flows). (30/03/2026)

---

## Batch 7 — New Features

- [x] **P26** — Insights feature: replaced "Daily Briefing" chatbot with 16 structured cached AI summaries (8 org-wide, 8 business-specific) + 5 custom presets. Org profile expanded (5 new AI context fields). Full app consistency pass (Daily Briefing → Insights throughout). (01/04/2026)
- [x] **P26-fixes** — Insights bug-fix pass: Buried Gold dedicated fetcher for old entries; Briefing now injects recent activity + quiet businesses; status field removed entirely, replaced with membership_type logic throughout (isEngaged/isLapsed/membershipLabel/MEMBERSHIP_LEGEND). (01/04/2026)
- [x] **P26-fixes-2** — Insights context enrichment: briefing enum bug fixed (action_needed='medium' never existed); body text now included in actionsDue/needsReply; 2-day recency gate; business names resolved; Buried Gold gets recent activity aggregation + subjects per candidate so Claude can distinguish missed vs resolved. (31/03/2026)
- [x] **P27** — Superseded by P26. Custom presets (label, prompt, scope, 5 per user) delivered as part of Insights feature.
- [x] **P31** — Proactive delivery: daily cron job generates the Briefing insight for each active user at ~8am and emails it (SendGrid). "X things need your attention today" subject line with insight content inline. Opt-out toggle in settings. One AI call per user per day — same cost as manual generation, far higher perceived value. Files: new `app/api/cron/daily-briefing/route.ts`, `lib/email/briefing-email.ts`, settings opt-out toggle. (02/04/2026)
- [ ] **P32** — Actionable insights: add contextual action buttons to insight results. After Call Prep → "Log this call" (pre-fills new entry). After What Did We Agree → "Set reminder" on each commitment. After Briefing → "Chase this" creates a flagged action. After Reconnect List → "Add to outreach" marks businesses for follow-up. Pure UI work, zero AI cost. Files: `components/InsightsPanel.tsx` + new action handlers.
- [ ] **P33** — Insight history: store all generated insights (not just latest cache) in an `insight_history` table. UI shows "View history" on each card — timeline of past snapshots. Especially powerful for Call Prep and Relationship Story (see how a relationship evolved). Migration: new table with org_id, business_id, insight_type, content, generated_at. Display: collapsible history list below current insight.
- [ ] **P34** — Relationship memory: after each insight generation, distil a 3-sentence "relationship memory" per business and store it. Future insights include this memory as context instead of re-reading all raw correspondence — smarter outputs, lower token counts over time. New `business_memory` column on businesses table (or separate table). Update `fetchBusinessInsightData` to include memory, update `buildInsightPrompt` to regenerate memory after each run.
- [ ] **P19** — File uploads on business pages: Supabase Storage bucket, `business_files` table (id, business_id, org_id, filename, storage_path, parsed_text, file_type, created_at), upload UI on business page, PDF text extraction (`pdf-parse`), include parsed text in AI Assistant context for that business. Add per-org storage cap (50MB).
- [ ] **P29** — Email import copy review: audit inbound forwarding setup page (`app/settings/page.tsx`), bulk Gmail/Outlook wizard (`app/import/gmail/page.tsx`, `app/import/outlook/page.tsx`), bookmarklet installer (`app/install-bookmarklet/page.tsx`), and onboarding step 5. Rewrite unclear copy, flag any feature changes needed to make each path obviously useful to a new user.
- [ ] **P30** — In-app email sending: compose + reply modals on business page and correspondence entries; auto-log sent email as correspondence entry (direction='sent', no AI formatting — user wrote it). New: `app/actions/send-email.ts` (SendGrid send + createCorrespondence), `components/ComposeEmailModal.tsx`, `components/ReplyEmailModal.tsx`. Add "Compose email" button to business page header; "Reply" button to each correspondence entry. Uses existing `SENDGRID_API_KEY`.

---

## Batch 8 — Final Pass (do last)

- [ ] **P11** — Pricing page: "Most Popular" badge on Pro card; monthly/annual toggle (annual = ×10, show "Save 17%" not "2 months"); all CTAs read "Start free trial — [Plan]" *(hold — pricing not finalised)*
- [ ] **P23** — Monthly billing flag: migration to add `billing_frequency ENUM('monthly','annual') DEFAULT 'annual'` to contracts table; add Monthly/Annual toggle to contract add/edit form; display frequency next to contract amount. File: `components/ContractDetailsCard.tsx`.
- [ ] **P28** *(replaces P20)* — Full UX audit + fixes: walk every page as a new user (browser automation), document all issues (broken, confusing, disconnected features), then fix the most significant ones. Goes well beyond the old click-count audit.

---

## Done

- [x] **Spring Clean** — Security (org_id guards on 9 files), shared utilities (result types, validation, events, auth helpers), AI consolidation (shared client across 10+ files, max-iteration guard), consistency sweep (API routes, error shapes, custom events), auto-generated DB types, memory restructure, doc updates (04/04/2026)
- [x] Inbound email webhook code + inbox UI + domain mappings (26/03/2026)
- [x] Business page performance — CorrespondenceEditForm state isolation + React.memo on 8 sub-components (26/03/2026)
- [x] Business page refactor — 8 sub-components extracted, page.tsx 2,180 → 1,200 lines (25/03/2026)
- [x] Design token system — all hex values replaced with brand tokens (25/03/2026)
- [x] Business page DB pagination — limit/offset, Load More, refreshCorrespondence() helper (25/03/2026)
- [x] Actions page — priority list, direction badges, snippets (25/03/2026)
- [x] Unified Actions page (24/03/2026)
- [x] Daily Briefing page (24/03/2026)
- [x] Landing page full rewrite + marketing components (24/03/2026)
- [x] Bulk email import wizard — Gmail + Outlook OAuth, chunked execute (24/03/2026)
- [x] UX plan execution — toasts, optimistic actions, Cmd+K, draft save, new entries badge, jump to today (24/03/2026)
- [x] Onboarding 3-step flow (25/03/2026)
- [x] Hero Daily Briefing mockup — Richmond Kitchen + Hartley & Sons examples (24/03/2026)
- [x] SaaS productization Phase 1 — feature flags, Stripe billing, landing page (02/02/2026)
- [x] Automated marketing engine (02/02/2026)
- [x] Performance optimizations + GIN indexes (31/01/2026)
- [x] Duplicate detection (30/01/2026)
- [x] Pre-launch security fixes (30/01/2026)
