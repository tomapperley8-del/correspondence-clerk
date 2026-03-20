# Project Memory

## Current Focus

Production SaaS - maintaining and iterating on correspondence-clerk.vercel.app

## Key Decisions

- **Anthropic structured outputs** for AI formatting (100% JSON success rate)
- **Forced filing** - cannot save without business AND named contact
- **Preserve originals** - always keep raw_text_original and formatted_text_original
- **Graceful fallback** - AI outage never blocks saving
- **8K token budget** for AI formatter responses
- **16K token budget** for chat responses (needed for large "do it" workflows)

## Learnings

- British date format (DD/MM/YYYY) throughout
- All buttons need text labels, not icon-only
- Warm, professional colour palette (off-white, slate, mature olive)
- Contact extraction needs 500ms debounce to avoid input lag
- Limit duplicate detection to recent 500 entries for performance
- Chat streaming: use rAF render loop with local mutable vars (not shared refs — they go stale)
- Chat streaming: batch DOM updates at screen refresh rate, not per-token
- Memo ChatMessage components to prevent re-rendering unchanged messages during streaming
- Markdown link rendering in chat didn't work reliably — scrapped in favour of plain text business names
- `businesses.contract_amount` NOT `contract_value` — column name matters
- Contract dates (start/end) are the CURRENT period, not evidence of renewal — system prompt must clarify this
- `get_unreplied_inbounds` must fetch BOTH directions to detect replies (fetching only received = never sees sent replies)
- `run_query` SQL validation: don't use overly aggressive regex (e.g. INTO pattern matched innocent queries)
- Prompt caching enabled on system prompt + last tool definition (cache_control: ephemeral)

## Open Questions

- Google Docs export needs user testing with real MCP setup
- ~27 lint errors remain (intentionally skipped - false positives)

## Session Log

### 05/03/2026
- Built AI Outreach Assistant chat panel (slide-out drawer from nav)
- 7 tools: unreplied inbounds, expiring contracts, stale chases, correspondence history, search businesses, business summary, run_query (raw SQL)
- SSE streaming with server-side tool loop (no new deps)
- DB migration `20260305_001_add_run_readonly_query.sql` — RUN AND LIVE
- Conversational by default; only drafts emails when explicitly asked or "do it"
- System prompt: general-purpose Claude focused on business data (not a narrow outreach bot)
- Fixed: unreplied inbounds was only fetching received entries (never saw sent replies)
- Fixed: contract_value → contract_amount column name
- Fixed: contract date misinterpretation (Claude assumed renewals from date ranges)
- Fixed: run_query validation too aggressive (INTO pattern, EXEC/EXECUTE false positives)
- Fixed: blank chat caused by stale shared ref — switched to local vars per send
- Smooth streaming: rAF render loop, slide-in animation, smart scroll
- Attempted business name links — didn't render reliably, removed
- Enabled Anthropic prompt caching (system prompt + tools)
- All deployed and live on Vercel

### Key Files (Chat Feature)
- `lib/ai/chat-system-prompt.ts` — system prompt
- `lib/ai/chat-tools.ts` — 7 tool definitions + execution (all read-only, org-scoped)
- `app/api/chat/route.ts` — SSE streaming with tool loop, prompt caching
- `components/ChatPanel.tsx` — slide-out drawer, rAF streaming
- `components/ChatMessage.tsx` — message rendering, email draft detection, memo'd
- `components/ChatContext.tsx` — open/close state context
- `supabase/migrations/20260305_001_add_run_readonly_query.sql` — DB function for run_query

### 05/02/2026
- Initial memory file created as part of workflow system setup
