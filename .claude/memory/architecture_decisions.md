---
name: Architecture Decisions
description: Key technical choices and their rationale — AI patterns, streaming, data flow
type: project
---

- **Anthropic structured outputs** for AI formatting (100% JSON success rate)
- **Forced filing** — cannot save without business AND named contact
- **Preserve originals** — always keep raw_text_original and formatted_text_original
- **Graceful fallback** — AI outage never blocks saving
- **8K token budget** for formatter, **16K** for chat (needed for large "do it" workflows)
- **One-shot AI prompting** with pre-fetched data — no tool-calling for insights (confirmed by Opus review, 01/04/2026). SQL aggregation for context, not full text.
- **Prompt caching** enabled on system prompt + last tool definition (cache_control: ephemeral)
- **Chat streaming** — rAF render loop with local mutable vars (not shared refs — they go stale). Batch DOM updates at screen refresh rate, not per-token. Memo ChatMessage to prevent re-renders during streaming.
- **Shared Anthropic client** — singleton in `lib/ai/client.ts` (consolidated 04/04/2026, was duplicated in 10+ files)
- **Shared org context** — `lib/ai/org-context.ts` for AI prompt context
- **Insights replaced Daily Briefing** — 16 default AI summaries (8 org-wide, 8 business-specific) + 5 custom presets. Cached in `insight_cache` table.
- **Status field unreliable** — replaced with `membership_type` logic (`isEngaged`, `isLapsed`, `membershipLabel`, `MEMBERSHIP_LEGEND`)
