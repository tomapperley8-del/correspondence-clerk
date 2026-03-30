# Implementation Plan
Last updated: 30/03/2026

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
- [ ] **P11** — Pricing page: "Most Popular" badge on Pro card; monthly/annual toggle (annual = ×10, show "Save 17%" not "2 months"); all CTAs read "Start free trial — [Plan]"

---

## Batch 5 — AI Cost & Quality

- [x] **P12** — Prompt caching: `cache_control: { type: 'ephemeral' }` on system prompts in `lib/ai/formatter.ts` + `ai-action-detection.ts`. Chat route was already cached. ai-summary.ts skipped (no static system prompt). (30/03/2026)
- [x] **P13** — Single combined AI call: merge formatter + action detection into one structured output per entry. `lib/ai/types.ts` + `lib/ai/formatter.ts` schema + prompts updated; `new-entry/page.tsx` pre-fills actionNeeded from medium/high confidence suggestions; `ai-action-detection.ts` kept with deprecation note. (30/03/2026)
- [x] **P14** — Quoted content stripping: wire existing `stripQuotedContent()` from `lib/inbound/utils.ts` into `lib/ai/formatter.ts` before building the prompt. Do NOT create a separate file — import from where it already lives. Store `quotedContent` in `ai_metadata`. (30/03/2026)

---

## Batch 6 — Infrastructure & Marketing

- [x] **P15** — Inbound email forwarding: LIVE. Postmark configured, BCC capture live, inbox UI polished (27/03/2026)
- [x] **P15b** — Inbox direction fix + UX overhaul: direction stored in queue, SENT/RECEIVED badge, expandable body, auto-match contact, own email addresses in settings (30/03/2026)
- [ ] **P16** — Landing page FAQ: create `components/marketing/FAQ.tsx` as `<details>/<summary>` accordion (no dependencies); add above CTA in `app/(public)/page.tsx`. Hero mockup is already done.
- [ ] **P17** — Sentry error monitoring: install `@sentry/nextjs`, create three config files, wrap `next.config.ts`, add `app/global-error.tsx`. **Needs Sentry account + DSN first** (free tier, 5k errors/month). Errors only — no replays, no performance tracing.
- [ ] **P24** — Inbound email debug + logging: add structured logging to `app/api/inbound-email/route.ts` (log every receive event: timestamp, sender, token extracted, result); add "Send test email" button in settings; document correct Outlook forwarding rule setup (forward to `{token}@in.correspondenceclerk.com`). Use Postmark activity log to trace missing emails.
- [ ] **P25** — Docs audit: read every file in `docs/`, update stale sections (inbound email, AI features, onboarding flow all changed significantly), fill gaps. No greenfield writes — update what exists.

---

## Batch 7 — New Features

- [ ] **P26** *(was P18, expanded)* — AI Assistant rename + call prep: rename "Daily Briefing" → "AI Assistant" in nav and throughout. When opened from `/businesses/[id]`, pass `businessId` to chat API and auto-run a "Call prep" preset (full context: correspondence history, contract status, deal terms, contacts). Minimum chat route change — additional businessId filter. Files: `components/Navigation.tsx`, `components/ChatPanel.tsx`, `app/api/chat/route.ts`.
- [ ] **P27** — AI preset templates: new `user_ai_presets` table (id, user_id, org_id, label, prompt_text, sort_order); replace ChatPanel freeform textarea with preset chip grid (suggested defaults: "Daily briefing", "What needs chasing", "Expiring contracts", "Call prep"); manage presets UI (edit/delete/add, cap 10 per user). Builds on P26.
- [ ] **P19** — File uploads on business pages: Supabase Storage bucket, `business_files` table (id, business_id, org_id, filename, storage_path, parsed_text, file_type, created_at), upload UI on business page, PDF text extraction (`pdf-parse`), include parsed text in AI Assistant context for that business. Add per-org storage cap (50MB).
- [ ] **P29** — Email import copy review: audit inbound forwarding setup page (`app/settings/page.tsx`), bulk Gmail/Outlook wizard (`app/import/gmail/page.tsx`, `app/import/outlook/page.tsx`), bookmarklet installer (`app/install-bookmarklet/page.tsx`), and onboarding step 5. Rewrite unclear copy, flag any feature changes needed to make each path obviously useful to a new user.
- [ ] **P30** — In-app email sending: compose + reply modals on business page and correspondence entries; auto-log sent email as correspondence entry (direction='sent', no AI formatting — user wrote it). New: `app/actions/send-email.ts` (SendGrid send + createCorrespondence), `components/ComposeEmailModal.tsx`, `components/ReplyEmailModal.tsx`. Add "Compose email" button to business page header; "Reply" button to each correspondence entry. Uses existing `SENDGRID_API_KEY`.

---

## Batch 8 — Final Pass (do last)

- [ ] **P21** — Direction bug fix: merge `updateCorrespondenceDirection` into `updateFormattedText` (eliminate separate call, fixes edit form revert). Audit new-entry form for post-submit state reset. Audit other forms for similar patterns (separate save calls, state re-initialising from stale props). Files: `app/businesses/[id]/page.tsx`, `app/actions/correspondence.ts`, `app/new-entry/page.tsx`, `app/businesses/[id]/_components/CorrespondenceEditForm.tsx`.
- [ ] **P22** — Old contracts expiry: pass `is_current` to `ContractStatusBadge`; when `false`, render a static "Historical" label instead of a countdown. Files: `components/ContractDetailsCard.tsx`, `components/ContractStatusBadge.tsx`.
- [ ] **P23** — Monthly billing flag: migration to add `billing_frequency ENUM('monthly','annual') DEFAULT 'annual'` to contracts table; add Monthly/Annual toggle to contract add/edit form; display frequency next to contract amount. File: `components/ContractDetailsCard.tsx`.
- [ ] **P28** *(replaces P20)* — Full UX audit + fixes: walk every page as a new user (browser automation), document all issues (broken, confusing, disconnected features), then fix the most significant ones. Goes well beyond the old click-count audit.

---

## Done

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
