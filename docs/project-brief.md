# Correspondence Clerk — Full Project Brief

## What It Is

Correspondence Clerk is a correspondence management tool for small businesses and associations — somewhere between a lightweight CRM and a filing cabinet. The core idea: every business conversation (email, call, letter, meeting note) gets logged against a named business and contact, AI-formatted into a clean summary, and stored permanently. The result is a searchable, chronological record of all your business relationships.

It is NOT trying to be Salesforce. It doesn't do pipelines, deals, or automation. It does one thing: make sure nothing falls through the cracks, and give you the full picture of any relationship in seconds.

---

## The Problem

Small business owners, associations, publishers, and local organisations manage dozens of ongoing relationships across email, phone, and in person. These conversations exist in inboxes, voicemail, memory. There's no record of what was agreed. Follow-up is inconsistent. When you need to know "what was the last thing we said to X?" — you're searching through email for 10 minutes.

Traditional CRMs are too complex, too expensive, and designed for sales teams with pipelines. Most small operators don't have a pipeline — they have ongoing relationships that need nurturing and a paper trail.

---

## Current State: One User, Building Toward a Product

**Right now this is a personal tool.** Tom Apperley (the developer/founder) runs **The Chiswick Calendar**, a local community media and events business in West London. He manages ~130 businesses (advertisers, event venues, sponsors, local organisations). He is the only user. The app is being built to solve his own real problem first, with the intention of eventually turning it into a saleable SaaS product.

His Outlook rule forwards everything from `info@thechiswickcalendar.co.uk` → `info-utbz@correspondenceclerk.com`. The app extracts the original sender from the forwarded email body and files it.

This approach — build for yourself first, validate the core loop, then productise — is deliberate. The risk is building features for an audience of one that don't generalise. That's the tension to keep in mind.

---

## The Goal: A Saleable SaaS Product

The long-term goal is a commercial product. The SaaS foundation is already in place (Stripe, feature flags, invite-only signup, landing/pricing pages, terms/privacy) but billing isn't live and there are no paying customers yet.

**Intended market:** Small business owners, associations, local publishers, professional services — anyone who manages ongoing business relationships and correspondence but finds full CRMs like Salesforce or HubSpot overkill. Think: a local media company, a membership association, a small PR firm, a solicitor's practice.

**Planned tiers:**
- **Free** — limited entries, no AI insights
- **Pro** — full access, ~£20-30/month per user
- **Enterprise** — multi-user orgs, custom branding, SSO

**The core challenge before it's saleable:**
1. The value proposition ("correspondence management") is hard to explain and hard to search for. Better framing needed — closest comparable is "a relationship CRM for people who hate CRMs" or "your business memory".
2. No external validation yet — one user (the founder) is not a market signal.
3. The inbound email flow (forward all emails → auto-file known senders) is genuinely useful and differentiated, but requires setup friction (Outlook rule, forwarding address). This is the hook that needs to be smooth.
4. Insights feature is powerful but costs need controlling before scaling users.
5. The marketing engine is built but entirely dormant — hasn't generated a single lead.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| AI | Anthropic Claude (claude-sonnet-4-5) |
| Hosting | Vercel (auto-deploy from main) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Email | Forward Email ($3/month Enhanced Protection, no per-email limits) |
| Email sending | SendGrid (optional, for invitations) |

**Why these choices:**
- Next.js App Router + Server Actions: keeps DB logic server-side, no separate API layer needed for CRUD
- Supabase: Auth + Postgres in one, RLS for multi-tenancy, fast to work with
- Anthropic structured outputs: reliable JSON responses, schema validation, graceful fallback — AI never blocks saving
- Vercel: zero-config deploys, works perfectly with Next.js
- Forward Email: replaced Postmark after hitting 100/month free tier immediately. $3/month, unlimited emails, flat JSON payload

---

## Architecture

### Data Flow (core filing loop)
```
User pastes text
  → client-side thread detection (heuristics)
  → /app/new-entry/page.tsx
  → formatCorrespondence() [lib/ai/formatter.ts]
    → Anthropic API (structured output: formatted_text, subject_guess, entry_date_guess, action_needed, confidence)
    → graceful fallback: saves unformatted if AI fails
  → createCorrespondence() [app/actions/correspondence.ts]
    → SHA256 content_hash for dedup
    → insert to correspondence table
    → revalidatePath
```

### Inbound Email Flow
```
Email arrives at {token}@correspondenceclerk.com (Forward Email)
  → Forward Email POSTs flat JSON to /api/inbound-email
  → HMAC-SHA256 signature verification
  → token → user_profiles lookup → get org_id
  → rate limit check (200/hour per org)
  → fromSelf check (own email addresses bypass spam filter)
  → extractForwardedSender() if fromSelf (extracts original sender from Outlook/Gmail forwarded body)
  → blocked_senders check
  → shouldDiscard() spam filter:
      - no-reply/mailer-daemon/postmaster senders
      - list-unsubscribe/list-id header + newsletter-y subject keyword
      - "unsubscribe" in subject
      - body < 20 chars
  → direction detection: token in mail.to/cc → 'received'; token only in session.recipient → 'sent' (BCC)
  → RECEIVED path:
      matchBusinessFromEmail() → contacts.emails[] → businesses.email → domain_mappings
      if match: AI format → insert correspondence (auto-filed, no user action)
      if no match: insert to inbound_queue (status=pending)
  → SENT path (BCC):
      matchBusinessFromRecipients() → contacts.emails[] first → then domain_mappings
      if match: AI format → insert correspondence
      if no match: insert to inbound_queue
```

### Key Architectural Patterns
- **Server actions** — all DB mutations go through `app/actions/`. Always: auth check → org_id check → mutation → revalidatePath
- **Two Supabase clients** — `createClient()` for server actions (uses session), `createServiceRoleClient()` for webhook/cron (no session)
- **Structured AI outputs** — Anthropic's structured outputs (JSON schema) for formatter and insights. Never parse prose.
- **Graceful AI fallback** — if Anthropic call fails, entry saves as `formatting_status = 'unformatted'`. AI never blocks the user.
- **Content dedup** — SHA256 hash of raw text, checked before insert. Prevents duplicate emails from multiple forwarding paths.
- **Domain learning** — after manual filing, the sender's domain is saved to `domain_mappings`. Future emails from that domain auto-file.

---

## Database Schema (key tables)

```
organizations         — id, name, business_description, industry, value_proposition,
                        ideal_customer_profile, services_offered, typical_deal_value,
                        email_writing_style

user_profiles         — id, organization_id, display_name, role (member/admin),
                        google/microsoft OAuth tokens, inbound_email_token,
                        own_email_addresses TEXT[]

businesses            — id, org_id, name, category, status, membership_type,
                        address, email, phone, notes, contract fields,
                        last_contacted_at

contacts              — id, business_id, name, emails TEXT[], phones TEXT[],
                        role, notes, is_active

correspondence        — id, org_id, business_id, contact_id (nullable — Notes have no contact),
                        cc_contact_ids UUID[], bcc_contact_ids UUID[],
                        raw_text_original, formatted_text_original, formatted_text_current,
                        entry_date, subject, type (Email/Call/Note/Letter),
                        direction (received/sent), formatting_status, action_needed,
                        due_at, edited_at, content_hash, ai_metadata JSONB,
                        is_pinned, thread_id

inbound_queue         — id, org_id, from_email, from_name, subject, body_preview,
                        body_text, to_emails JSONB, direction, raw_payload JSONB,
                        status (pending/filed/discarded), received_at

blocked_senders       — id, org_id, email (unique per org) — block list for inbound

domain_mappings       — org_id, domain, business_id (auto-filing, learned on manual file)

duplicate_dismissals  — business_id, entry_id_1, entry_id_2 — dismissed dedup pairs

insight_cache         — org_id, business_id (nullable), insight_type, content,
                        generated_at, expires_at

user_ai_presets       — id, user_id, org_id, business_id (nullable), label, prompt,
                        scope (org/business), max 5 per user

org_membership_types  — id, org_id, label, value, sort_order, is_active
                        (Tom's org: club_card, advertiser, former_club_card, former_advertiser, prospect)

import_queue          — bulk import job tracking
rate_limits           — endpoint rate limiting (org-keyed)
```

**RLS:** All authenticated users can read/write within their org (v1 policy — simplified for single-org MVP).

---

## Full Feature Set

### Core
1. **Forced filing** — cannot save without a named business AND contact (Notes exempt). No placeholders.
2. **AI formatting** — paste raw text → structured output → clean summary. Preserves originals. Manual edits tracked separately with "Corrected" badge.
3. **Thread detection** — client-side heuristics detect email chains, offers to split into individual entries
4. **Duplicate detection** — SHA256 content hash, warning banner, delete or dismiss pairs
5. **Full-text search** — tsvector + GIN index, business name prioritised, Cmd+K overlay with 5-min sessionStorage cache
6. **Actions page** — needs-reply, gone-quiet, flagged, overdue, keyboard shortcuts (j/k navigation, f/r/w/n actions)
7. **Business page** — all correspondence in chronological order, threads view, pinned entries, filter bar, DB pagination (Load More)

### Email
8. **Inbound forwarding** — forward emails to personal inbound address, auto-filed if sender known, else queued for triage
9. **BCC capture** — BCC your inbound address on sent emails, auto-files as direction=sent
10. **Inbox triage** — pending queue with business/contact selector, auto-file on exact contact match, block sender
11. **Bulk email import** — Gmail + Outlook OAuth, scan headers, chunked execute (150/req), ReviewWizard for business/contact mapping

### AI
12. **Insights** — 16 pre-built AI summaries (8 org-wide, 8 business-specific) + 5 custom user presets. One-shot, cached, no tool-calling. Data pre-fetched server-side. Types include: Daily Briefing, Relationship Radar, State of Play, Reconnect List, Prospecting Targets, Data Health, Buried Gold, Call Prep, Relationship Story, What Did We Agree, Sentiment Analysis, etc.
13. **Insight caching** — `insight_cache` table, per-type expiry, cache status shown on load

### Infrastructure
14. **Multi-org/multi-user** — organizations table, user_profiles with roles, all queries org-id scoped
15. **Onboarding** — 4-step flow: org → describe business → first business+contact → first entry → email setup
16. **Configurable membership types** — per-org (Tom uses: Club Card, Advertiser, Former Club Card, Former Advertiser, Prospect)
17. **Mastersheet CSV import** — idempotent, duplicate merging
18. **Google Docs export** — via MCP integration
19. **SaaS foundation** — Stripe billing (not live), feature flags, invitation-only signup, landing page, pricing page, terms/privacy
20. **Marketing engine** — prospect discovery, cold email (Smartlead), social autopilot, programmatic SEO for industries, blog, AI chatbot, referral system, review automation. All built, all dormant.

---

## What's Working Well

- Core filing loop is fast and reliable
- AI formatting quality is good — structured outputs, clean JSON, graceful fallback
- Inbound email pipeline is solid after several debugging rounds (forwarded sender extraction, flat payload parsing, direction detection, email-based matching)
- Design is clean and consistent — warm palette, Lora serif headings, brand token system enforced (no raw hex)
- DB queries are efficient — GIN indexes, pagination, single-round-trip nav data

---

## Known Issues & Technical Debt

### Active Issues
1. **Insights API cost** — 16 large prompts per full refresh, potentially $1-2 per refresh. No cost control. Needs: smarter cache TTLs, cheaper model for low-value insights, or on-demand-only generation.
2. **~27 lint errors** — intentionally deferred. Mostly react-hooks false positives and `any` types from the docx library.
3. **Google Docs export untested** — requires MCP setup with Google auth. Not user-tested in production.
4. **BCC capture not confirmed working** — needs end-to-end test (BCC inbound address on a sent email, verify direction=sent in inbox).
5. **FORWARD_EMAIL_WEBHOOK_SECRET not set** — low-priority security hardening, signature verification falls back to allow-all in dev.

### Architectural Concerns
- **Single real user** — entire product shaped by one person's workflow. Unknown if it generalises.
- **No viral loop** — filing is private. No sharing, collaboration, or network effect.
- **Marketing engine is dead weight** — large amount of code for outreach features that aren't generating anything. May need culling.
- **`contact_id` nullable** — Notes have no contact. Every place that accesses contact fields must guard against null. Several places probably don't.
- **Business page is still long** — refactored from 2,180 to 1,200 lines but could go further.
- **RLS is MVP-grade** — all org members can read/write everything. No row-level permissions within org.

### Design Debt
- direction badges on business page still use raw Tailwind blue/green classes (not brand tokens) — flagged but not fixed
- Mobile not optimised — desktop-first, usable but not great on phone

---

## Costs (monthly, current scale)

| Service | Cost |
|---|---|
| Vercel | Free |
| Supabase | Free |
| Forward Email | $3 |
| Anthropic (email formatting) | ~$1 (≈$0.01/email at current volume) |
| Anthropic (Insights) | Variable — up to $2 per full refresh, cached so infrequent |
| **Total** | **~$5-10/month** |

Scaling note: email formatting is cheap (claude-sonnet-4-5, ~1,500 tokens/email). Insights is the expensive part — 16 calls with large prompts. Needs addressing before scaling users.

**MICROSOFT_CLIENT_SECRET expires 19/09/2026** — rotate at portal.azure.com.

---

## Key Files

```
app/
  actions/
    businesses.ts            Business CRUD
    contacts.ts              Contact CRUD
    correspondence.ts        Correspondence CRUD + manual edits + dedup
    inbound-email.ts         Inbound queue actions + findEmailMatch + blockSenderEmail
    ai-formatter.ts          Anthropic API wrapper
    organizations.ts         Org CRUD + getNavData() single round-trip
  api/
    inbound-email/route.ts   Forward Email webhook (HMAC verify → spam filter → match → AI → file/queue)
    insights/route.ts        Cache check → prefetch → Claude → upsert
    chat/route.ts            (Legacy — Daily Briefing chat, now mostly superseded by Insights)
  inbox/
    page.tsx                 Inbox page (server)
    _components/InboxCard.tsx  Card with auto-file, block sender, business/contact selector
    _components/AutoFiledSection.tsx  Recently auto-filed (open by default, Edit links)
    _components/DiscardedSection.tsx  Filtered emails + Rescue
  businesses/[id]/
    page.tsx                 Business page (2,180 → 1,200 lines after refactor)
    _components/             8 sub-components (CorrespondenceEntry, EditForm, ThreadAssignPanel, etc.)
  dashboard/page.tsx         Business list + InsightsPanel inline + onboarding checklist
  actions/page.tsx           Priority action list

lib/
  ai/
    formatter.ts             Anthropic structured outputs + retry + fallback
    insight-prompts.ts       All 16 insight types — data fetching + prompt building
    thread-detection.ts      Email chain heuristics
    types.ts                 AI response contracts
  inbound/
    utils.ts                 extractForwardedSender, isPersonalDomain, stripQuotedContent
  supabase/
    server.ts                createClient() — session-based
    service-role.ts          createServiceRoleClient() — webhook/cron contexts

components/
  CommandSearch.tsx          Cmd+K global overlay
  Navigation.tsx             App nav
  InsightsPanel.tsx          Slide-out or inline insights grid
  BusinessSelector.tsx       Search dropdown + Add New
  ContactSelector.tsx        Scoped to business
  AddBusinessModal.tsx       Inline add + auto-select
  AddContactModal.tsx        Inline add + auto-select

docs/
  project-brief.md           This file
  project_forward_email_migration.md  Full inbound email setup + bugs fixed
```

---

## Roadmap (prioritised)

| Item | What | Why |
|---|---|---|
| **P-NOW** | Fix Insights API cost | Before any new users — currently unbounded cost per refresh |
| **P31** | Daily briefing email (cron → SendGrid) | Proactive delivery = far higher perceived value, same AI cost |
| **P32** | Actionable insight buttons | Act directly from insight results (log call, set reminder, flag) |
| **P19** | File uploads | Attach contracts/documents to businesses, include in AI context |
| **P28** | Full UX audit (browser automation) | Walk every page as a new user, fix what's confusing |
| **P30** | In-app email sending | Compose + reply from business page, auto-log as correspondence |
| **P17** | Sentry error monitoring | Blocked — needs Sentry account + DSN |

---

## Important Context for Any AI Working on This

- **Never invent content** — the app's core promise is it only captures what the user gives it. AI formats, never invents.
- **Forced filing is sacred** — cannot save without business + named contact (Notes exempt). This is a hard rule, not a UX preference.
- **Design tokens only** — never raw hex. Token classes: `bg-brand-navy` (#2C4A6E), `bg-brand-olive` (#7C9A5E), `bg-brand-paper` (#FAFAF8), `bg-brand-dark` (#1E293B). CSS vars for inline styles: `var(--link-blue)`, `var(--header-bg)`. **CSS vars do NOT resolve in React inline styles** — use hex directly there.
- **Supabase project ID:** `ayoiibrzkllerrwbhvda`
- **Forward Email payload is flat** — fields at top level (`payload.from`, `payload.text`, etc.), NOT nested under `payload.mail`. Always use flat paths first with defensive fallbacks.
- **`fromSelf` bypass** — emails where the sender is one of the user's own email addresses skip the spam filter entirely (handles Outlook forwarding where the outer From = the user's own address).
- **British English + DD/MM/YYYY dates** throughout the UI.
- **Membership types** (Tom's org): `club_card`, `advertiser`, `former_club_card`, `former_advertiser`, `prospect`. isEngaged = club_card|advertiser. isLapsed = former_club_card|former_advertiser. These replace the unreliable `status` field in all AI prompts.
