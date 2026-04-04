---
name: Known Issues & Gotchas
description: Bugs, workarounds, and things to watch out for in the codebase
type: project
---

- **Google Docs export** needs user testing with real MCP setup
- **~27 lint errors** remain (intentionally skipped — react-hooks false positives, docx library `any` types)
- **CSS var gotcha** — `var(--brand-navy)` does NOT resolve in React inline styles. Use `#2C4A6E` directly.
- **`contacts!inner` in search** excludes Note-type entries (where contact_id is null) from search results. Existing bug, not yet fixed.
- **Contact extraction** needs 500ms debounce to avoid input lag
- **Duplicate detection** limited to recent 500 entries for performance
- **`businesses.contract_amount`** NOT `contract_value` — column name matters
- **Contract dates** (start/end) are the CURRENT period, not evidence of renewal
- **`action_needed` enum values** are: `none | prospect | follow_up | waiting_on_them | invoice | renewal` (NOT low/medium/high — that was a silent bug fixed 31/03/2026)
- **Markdown link rendering** in chat didn't work reliably — scrapped in favour of plain text
