# Hardening & Decomposition Plan

**Audit date:** Apr 8 2026 | **Score:** 7.5/10 | **Goal:** 8.5+ via hardening, not features

---

## Phase 1 — Security (single PR, do first)

### 1.1 Account deletion cascade ✅ DONE
**File:** `supabase/migrations/20260408_002_fix_user_id_cascade.sql`
**Problem:** `correspondence.user_id ON DELETE RESTRICT` blocks user deletion at DB level.
**Fix:** Migration drops old FK, re-adds with `ON DELETE SET NULL`. Correspondence survives; org_id is the real owner.

### 1.2 Inbound email dead letter queue ⬜ TODO
**File:** `app/api/inbound-email/route.ts`
**Problem:** 5 silent failure points — errors swallowed, emails lost with no audit trail.
**Fix:**
1. New migration: `email_dead_letters(id, org_id, raw_payload, error_message, received_at, retry_count)`
2. Wrap each failure point in try/catch → insert to `email_dead_letters`
3. Inbox UI: "Failed (N)" tab showing dead letters with raw payload + retry button
4. `createServiceRoleClient()` for the insert (no session in webhook context)

**Failure points to wrap:**
- L~80: spam filter crash
- L~120: org lookup failure  
- L~160: contact match failure
- L~200: AI formatter failure
- L~240: `createFormattedCorrespondence` failure

### 1.3 Fire-and-forget checkAndResolveActions ✅ DONE
**File:** `app/actions/correspondence.ts` ~L300
**Fix:** Wrapped in `try { await ... } catch { console.error(...) }` — no longer silent.

### 1.4 Disable marketing crons ✅ DONE
**File:** `vercel.json`
**Removed 8 crons:** prospect-finder, send-cold-emails, generate-content, post-linkedin, post-twitter, request-reviews, run-sequences, generate-blog.
**Kept:** cleanup-temp-emails, cleanup-rate-limits, process-import-queue, daily-briefing.

### 1.5 Cap unbounded queries ✅ DONE
**Files:** `lib/ai/chat-tools.ts`, `app/actions/organizations.ts`
- `getUnrepliedInbounds`: 500 → 100
- `getStaleChases`: 500 → 100
- `getOrganizationMembers`: added `.limit(100)`

---

## Phase 2 — Business page decomposition ⬜ TODO
**Target:** `app/businesses/[id]/page.tsx` (1148 lines → <300)

**Extract hooks:**
- `useCorrespondenceData(businessId, orgId)` — fetches + refreshes correspondence
- `useCorrespondenceFilters(entries)` — filter/sort/search state
- `useDuplicates(businessId, orgId)` — duplicate detection state
- `useThreads(entries)` — thread grouping logic

**Extract context:**
- `BusinessPageContext` — eliminates 58-prop `AllEntriesView` interface

**Session prompt (paste into Claude Code):**
```
Read app/businesses/[id]/page.tsx and its _components/. Extract 4 hooks:
useCorrespondenceData, useCorrespondenceFilters, useDuplicates, useThreads.
Create BusinessPageContext. Do NOT wire up yet — just extract into new files.
Run npm run build when done.
```

---

## Phase 3 — New entry page decomposition ⬜ TODO
**Target:** `app/new-entry/page.tsx` (1722 lines → <400)

**Extract hooks:**
- `useEmailImport()` — bookmarklet postMessage handling
- `useDraftAutosave()` — localStorage draft logic
- `useAIFormatting()` — Anthropic call + state
- `useDuplicateCheck()` — hash check + modal state

**Extract components:**
- `FilingSection` — business + contact selectors
- `EntryDetailsSection` — date/type/direction/subject
- `TextInputSection` — textarea + AI format button
- `EmailSelectionDialog` — thread split review

---

## Phase 4 — Actions page decomposition ⬜ TODO
**Target:** `app/actions/page.tsx` (1192 lines → <350)

**Extract hooks:**
- `useActionsData()` — 5 parallel server action fetches
- `useUnifiedList()` — buildUnifiedList + keyboard nav state
- `useActionsKeyboard()` — ↑↓ D S L shortcuts
- `useActionHandlers()` — markDone, snooze, log

**Extract components:**
- `NeedsReplySection`, `ActionsDueSection`, `RenewalsSection`, `GoneQuietSection`, `RemindersSection` → own files

---

## Phase 5 — Data retention crons ⬜ TODO
- 90-day cleanup of `inbound_queue` (status=done/failed)
- 30-day cleanup of `email_dead_letters` (after Phase 1.2)
- 6-month cleanup of `insight_history`

Add as Vercel crons; run weekly at low-traffic hours.

---

## Phase 6 — Dead code cleanup ⬜ TODO
- Move `app/api/marketing/` → `app/api/marketing/_disabled/` (preserve, don't delete)
- Drop deprecated `contacts.email` and `contacts.phone` columns (replaced by `emails[]`/`phones[]`)
- Confirm no remaining references before dropping

---

## Session map

| Session | Task | Status |
|---------|------|--------|
| 1 | Phase 1a (1.1, 1.3, 1.4, 1.5) | ✅ Done |
| 2 | Phase 1b (dead letter queue) | ⬜ |
| 3 | UX & performance audit (read-only) | ⬜ |
| 4 | Business page — extract hooks/context | ⬜ |
| 5 | Business page — wire up | ⬜ |
| 6 | New entry page — extract | ⬜ |
| 7 | New entry page — wire up | ⬜ |
| 8 | Actions page — extract | ⬜ |
| 9 | Actions page — wire up | ⬜ |
| 10 | Data retention + dead code cleanup | ⬜ |

**Why this order:** UX audit before decomposition — don't reshape components twice. Each decomposition split into extract-then-wire so Sonnet doesn't lose context mid-rewrite.
