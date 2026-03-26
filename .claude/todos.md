# Implementation Plan
Last updated: 26/03/2026

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

- [ ] **P4** — SessionStorage cache for businesses list in `CommandSearch.tsx` (5-min TTL, invalidate on `businesses:changed` event)
- [ ] **P5-Fix1** — Actions page all-clear: single centred panel when all four sections empty, instead of four collapsed empty sections
- [ ] **P5-Fix2** — Add `hasCorrespondence` to `NavData` in `organizations.ts`; hide Actions nav link until first entry exists
- [ ] **P6-Fix1** — Add `/onboarding/describe-your-business` step (textarea + industry field, saves to `organizations` table); update create-organization to redirect there first. Check DB columns exist before coding.
- [ ] **P6-Fix2** — Dashboard dynamic completion checklist: 3 steps (business → contact → entry), auto-hides when all done, uses `localStorage` to stay dismissed
- [ ] **P7-Fix1** — Add "Open Daily Briefing" button on mobile dashboard (below `md` breakpoint) that opens slide-out ChatPanel
- [ ] **P7-Fix2** — Replace default Vercel favicon with `app/icon.svg` (CC initials, #1E293B background); add `icons` to `layout.tsx` metadata
- [ ] **P8** — Visual & spacing audit: border radius (2-4px throughout, no `rounded-lg/xl/2xl` on buttons/inputs/cards), page container padding consistency, shadow CSS variables, three-pattern button system (primary/secondary/destructive). **Priority areas: actions page badges/tags (look cheap), nav notification pills.** Pages: dashboard, business page, new-entry, actions, search, settings, daily-briefing, nav, ChatPanel.
- [ ] **P9-Fix1** — Data Health section in settings: `getUnformattedCount()` + `formatAllUnformatted()` server actions; show only when count > 0
- [ ] **P9-Fix2** — Time field in edit form (`CorrespondenceEditForm.tsx`): populate from `entry_date` time portion, combine on save — currently loses time on edit (data loss bug)
- [ ] **P9-Fix3** — Edit unformatted entries: always show Edit button; fall back to `raw_text_original` when `formatted_text_current` is null; set `formatting_status = 'formatted'` on save

---

## Batch 4 — GDPR & Launch Requirements

- [ ] **P10-F1** — Data export: `app/api/export/route.ts` returning CSV for businesses/contacts/correspondence; three download buttons in settings
- [ ] **P10-F2** — Account deletion: "Delete Account" in settings (confirmation dialog, type DELETE, cascade delete, `auth.admin.deleteUser`, redirect to `/login?message=account-deleted`)
- [ ] **P10-F3** — Custom 404: `app/not-found.tsx` (server component, brand-consistent, link back to dashboard)
- [ ] **P11** — Pricing page: "Most Popular" badge on Pro card; monthly/annual toggle (annual = ×10, show "Save 17%" not "2 months"); all CTAs read "Start free trial — [Plan]"

---

## Batch 5 — AI Cost & Quality

- [ ] **P12** — Prompt caching: add `cache_control: { type: 'ephemeral' }` to static content in `app/api/chat/route.ts` (biggest win), `lib/ai/formatter.ts`, `ai-summary.ts`, `ai-action-detection.ts`. Use `anthropic.beta.promptCaching.messages.create`.
- [ ] **P13** — Single combined AI call: merge formatter + action detection into one structured output per entry. Update `lib/ai/types.ts` schema, `lib/ai/formatter.ts`, `app/actions/ai-formatter.ts`, `app/new-entry/page.tsx`. Keep `ai-action-detection.ts` with deprecation comment (still used for re-classification).
- [ ] **P14** — Quoted content stripping: wire existing `stripQuotedContent()` from `lib/inbound/utils.ts` into `lib/ai/formatter.ts` before building the prompt. Do NOT create a separate file — import from where it already lives. Store `quotedContent` in `ai_metadata`.

---

## Batch 6 — Infrastructure & Marketing

- [ ] **P15** — Inbound email forwarding: CODE IS COMPLETE. Blocked on Postmark account (needs `tom@correspondenceclerk.com` first). See MEMORY.md for exact remaining steps.
- [ ] **P16** — Landing page FAQ: create `components/marketing/FAQ.tsx` as `<details>/<summary>` accordion (no dependencies); add above CTA in `app/(public)/page.tsx`. Hero mockup is already done.
- [ ] **P17** — Sentry error monitoring: install `@sentry/nextjs`, create three config files, wrap `next.config.ts`, add `app/global-error.tsx`. **Needs Sentry account + DSN first** (free tier, 5k errors/month). Errors only — no replays, no performance tracing.

---

## Batch 7 — New Features

- [ ] **P18** — Business-contextual Daily Briefing: when on `/businesses/[id]`, pass `businessId` to chat API; filter context to that business's correspondence. Add "Ask about [Business Name]" chip or pre-fill. Minimum change to chat route — just an additional filter on context fetch.
- [ ] **P19** — File uploads on business pages: Supabase Storage bucket, `business_files` table (id, business_id, org_id, filename, storage_path, parsed_text, file_type, created_at), upload UI on business page, PDF text extraction (`pdf-parse`), include parsed text in Daily Briefing context for that business. Add per-org storage cap (50MB).

---

## Batch 8 — Final Pass (do last)

- [ ] **P20** — Friction audit: map click count for 5 common tasks (add entry, find business, check what needs doing, edit entry, check contact details). Find and eliminate unnecessary steps, confirmations, and navigation hops. No feature changes — UX tightening only.

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
