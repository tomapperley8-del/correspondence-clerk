---
name: Recent Work Log
description: Rolling log of significant changes — keeps context across sessions
type: project
---

### 04/04/2026 — Spring Clean (Phases 1-6)
- **Security:** Added org_id guards to 9 files (4 API routes, 5 server actions) that were missing multi-tenant isolation
- **Shared utilities:** Created `lib/result.ts` (ActionResult type), `lib/validation.ts` (email validation, contact parsing), `lib/events.ts` (centralised custom events). Extended `lib/auth-helpers.ts` with `requireOrgId()` and `requireOrgIdForRoute()`.
- **AI consolidation:** Created `lib/ai/client.ts` (shared singleton) and `lib/ai/org-context.ts`. Replaced 10+ independent Anthropic client instantiations. Added max-iteration guard (10) to chat tool loop.
- **Consistency:** Migrated API routes to use shared auth helpers. Replaced duplicated email validation and contact parsing. Removed duplicate UserProfile type from organizations.ts. Centralised custom events across 5 components.
- **DB types:** Auto-generated from Supabase (was manually maintained and outdated — missing tables, wrong enums)
- **Docs:** Updated ARCHITECTURE.md (Postmark → Forward Email). Restructured memory into topic files.

### 04/04/2026 ��� Contact Email Case-Sensitivity Fix
- Auto-file was missing matches because contact emails stored with original casing. PostgreSQL JSONB `@>` is case-sensitive. Fix: lowercase all emails on create/update. Commit: 20e17d6.

### 02/04/2026 — P31 Daily Briefing Email
- Resend cron at 8am, smart cache, opt-out toggle in settings. Replaced SendGrid with Resend across all email sending.

### 01/04/2026 — Insights Feature
- Replaced Daily Briefing chatbot with 16 structured cached AI summaries + 5 custom presets. 3 bug fixes (Buried Gold, Briefing context, status→membership_type).

### 30/03/2026 — Inbox Direction + UX Overhaul
- `inbound_queue` now has direction, to_emails, body_text. Forward-of-sent detection. InboxCard UX improvements.
