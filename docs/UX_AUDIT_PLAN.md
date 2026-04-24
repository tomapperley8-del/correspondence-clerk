# UX Audit Implementation Plan

Based on full visual audit of the live app (April 2026). All 18 issues from the audit are captured here, grouped by the components they touch and ordered for implementation.

Screenshots are in `screenshots-audit/` in the project root. Filenames are referenced inline with each issue.

---

## Phase 0 — Bug Fix (do first, unblocks everything else)

### ✅ P0.1 — Unauthorized error on Actions page
**File:** `app/actions/page.tsx`  
**Screenshot:** `15-mobile-actions.png`  
**Issue:** A raw "Unauthorized" error string renders visibly on the Actions page (confirmed on mobile, may appear in edge cases on desktop too). One of the parallel server action fetches (`getNeedsReply`, `getOutstandingActions`, etc.) is throwing an auth error rather than returning an empty array, and the error is surfacing in the UI rather than being caught.  
**Fix:** Wrap each of the 5 parallel fetches in try/catch and return typed empty results on failure. The page should degrade gracefully — show sections as empty, not broken.

---

## Phase 1 — Navigation (touches every page)

### ✅ P1.1 — Nav is overcrowded and org name wraps
**File:** `components/Navigation.tsx`  
**Screenshot:** `01-dashboard.png` (top bar — org name wraps to 2 lines)  
**Issues:** 9 nav items + logo + 2-line org name. The "Info@ / The Chiswick Calendar" user pill wraps to two lines, breaking the nav bar height. Too many top-level items.  
**Fix:**
- Truncate the user/org display to a single line with `max-w-[160px] truncate`
- Move "Help" out of the main nav — put it in the user dropdown or a `?` icon at the far right
- The nav item order should reflect frequency of use: Dashboard · New Entry · Search · Inbox · Actions · Insights — then user/settings area

### ✅ P1.2 — Search nav item vs Ctrl+K overlay are redundant
**Files:** `components/Navigation.tsx`, `components/CommandSearch.tsx`  
**Screenshots:** `02-dashboard-empty-search.png` (Ctrl+K overlay), `05-search-empty.png` (dedicated /search page)  
**Issue:** The nav item reads "Search `Ctrl+K`" which implies the label is the keyboard shortcut. Clicking it navigates to `/search` (a full page). The Ctrl+K overlay does the same job faster. Two separate search surfaces with different behaviour.  
**Fix:** Make the "Search" nav item trigger the Ctrl+K overlay (`CommandSearch`) rather than navigate to `/search`. The `/search` page can remain for deep filtering (it has the Show Filters feature) but shouldn't be the default destination from the nav.

### ✅ P1.3 — Mobile nav is completely broken
**File:** `components/Navigation.tsx`  
**Screenshots:** `14-mobile-dashboard.png` (items overlap/truncate), `16-mobile-new-entry.png` (nav cut off right edge)  
**Issue:** At 375px, nav items overflow and overlap. No mobile nav pattern exists. The entire app is unusable on mobile.  
**Fix:** Implement a responsive nav:
- Below `md` breakpoint: show logo + hamburger button
- Hamburger opens a slide-out drawer (or a dropdown sheet) with all nav items stacked vertically
- Primary actions (New Entry, Actions) can optionally appear as a bottom bar on mobile
- All existing nav items fit in the drawer — no items removed, just restructured

---

## Phase 2 — Dashboard

### ✅ P2.1 — Onboarding banners persist for established users
**File:** `app/dashboard/page.tsx`  
**Screenshot:** `01-dashboard.png` (top of page — both banners visible above the business grid)  
**Issues:** The "You're new here" banner and the "Import Emails" strip both show permanently regardless of how established the user is. With 806 businesses these are pure noise.  
**Fix:**
- Suppress the "You're new here" banner when the org has more than 5 businesses (server-side check against count)
- Make the "Import Emails" strip dismissible — store a `hide_import_banner` flag in `user_profiles` (or `localStorage` as a lighter alternative)
- The onboarding checklist widget (the "Get started" card) should auto-hide once all three steps are complete — check if this is already gated

### ✅ P2.2 — Two onboarding elements on mobile dashboard
**File:** `app/dashboard/page.tsx`  
**Screenshot:** `14-mobile-dashboard.png` ("Get started" checklist + "Welcome to Correspondence Clerk" card both visible)  
**Issue:** On mobile, both the "Get started" checklist widget AND the "Welcome to Correspondence Clerk" full card render simultaneously. They're redundant — two different onboarding patterns saying the same thing.  
**Fix:** These should be mutually exclusive. The checklist widget is the right pattern (lightweight, dismissible). The full welcome card should only show when there are zero businesses, then disappear permanently. On mobile specifically, the checklist widget should stack cleanly below the page heading.

### ✅ P2.3 — Dashboard is splitting attention between two jobs
**File:** `app/dashboard/page.tsx`  
**Screenshot:** `01-dashboard.png` (business grid left, Insights sidebar right — two competing panels)  
**Issue:** The page is simultaneously a business list (paginated grid, 806 entries, filters) and a command centre (Insights sidebar). These are different jobs and compete for attention.  
**Fix:** Make the Insights sidebar collapsible, defaulting to collapsed on first load. Store the expanded/collapsed state in `localStorage` so it remembers the user's preference. Users who want the insights panel can pin it open; users who just want to find businesses aren't forced to look past it.

---

## Phase 3 — Actions Page

### ✅ P3.1 — Actions badge count creates anxiety
**Files:** `components/Navigation.tsx`, `app/actions/page.tsx`  
**Screenshot:** `01-dashboard.png` (nav bar — red "64" badge visible)  
**Issue:** A bright red "64" badge in the nav looks like a system alert. It counts everything — including low-urgency "Gone Quiet" and "Reminder" items — which inflates the number.  
**Fix:**
- Only badge urgent items: overdue actions + replies older than 7 days + contract expiries within 7 days
- Cap display at `20+` so it doesn't keep climbing
- Consider making the badge amber rather than red for counts under a threshold (e.g., red only when something is genuinely overdue)

### ✅ P3.2 — Needs Reply section is a wall of text
**File:** `app/actions/page.tsx` + `_components/`  
**Screenshot:** `03-actions.png` (full page — long unbroken list of items with multi-line snippets)  
**Issue:** With 30+ items all fully expanded showing multi-line snippets, the Needs Reply section is overwhelming. Items blend into each other without clear visual boundaries.  
**Fix:**
- Truncate snippets to a single line (add `line-clamp-1` or `line-clamp-2`) with a subtle expand-on-click
- Add a more pronounced visual separator between items (a light card border or slightly more vertical padding)
- Consider showing a "Showing 10 of 32 — Show more" pattern rather than rendering all items at once, to make the page feel manageable

---

## Phase 4 — Business Page

### ✅ P4.1 — Correspondence filter bar has too many controls
**Files:** `app/businesses/[id]/_components/FilterBar.tsx` (or equivalent)  
**Screenshot:** `12-business-page-scrolled.png` (Correspondence section — full filter bar visible above entries)  
**Issue:** Sort (2 toggle buttons) + Direction (3 toggle buttons) + Show (4 buttons + Custom) + Contact dropdown = 10+ visible controls above the correspondence list on every page load.  
**Fix:** Collapse to a single "Filter & Sort" button that opens a compact dropdown/popover showing all the options. Show active filter state on the collapsed button (e.g., "Newest · All · 12 Months"). Most users never change these from defaults — they shouldn't dominate the UI.

### ✅ P4.2 — Export button is the wrong visual weight
**File:** `app/businesses/[id]/page.tsx` or `_components/`  
**Screenshot:** `12-business-page-scrolled.png` (Correspondence header — green Export button same weight as navy New Entry)  
**Issue:** The Export button uses the same olive/green accent fill as primary actions, making it visually compete with "New Entry". Export is a rare action.  
**Fix:** Change Export to a ghost/outline button style. The hierarchy in the Correspondence header should be: New Entry (primary, navy) → Insights (secondary outline) → Export (ghost/text).

### ✅ P4.3 — "Today" floating button is oddly positioned
**File:** `app/businesses/[id]/page.tsx` or `_components/`  
**Screenshot:** `12-business-page-scrolled.png` (bottom-left corner — "↑ Today" button)  
**Issue:** The floating `↑ Today` button sits bottom-left, which is unconventional (floating actions are usually bottom-right). Its purpose isn't immediately obvious.  
**Fix:** Either (a) move it to bottom-right, or (b) replace it with an inline anchor link near the correspondence date group headers ("Jump to today ↑") that only appears when the user has scrolled past today's entries. Option (b) is less intrusive.

---

## Phase 5 — Settings Page

### ✅ P5.1 — Blocked Senders dominates the page
**File:** `app/settings/page.tsx`  
**Screenshot:** `07-settings.png` (full page — blocked senders list occupies ~70% of the scroll)  
**Issue:** ~50 blocked sender entries take up roughly 70% of the Settings page, pushing all other settings far down.  
**Fix:** Collapse the Blocked Senders list by default. Show: "Blocked Senders (47) — Manage ▼". Expanding reveals the full list with Unblock buttons. Alternatively, move it into a separate "Email" tab alongside forwarding address and email addresses (these are all email-related settings anyway).

### ✅ P5.2 — Settings page needs proper sub-navigation
**File:** `app/settings/page.tsx`  
**Screenshot:** `07-settings.png` (full page scroll — unrelated settings grouped together under one tab)  
**Issue:** The existing three tabs (User Profile / Organisation / Billing) don't meaningfully chunk the content. The User Profile tab contains profile settings, email settings, daily briefing, email forwarding, email addresses, blocked senders, tools, exports, and account deletion — completely unrelated things grouped together because they're "user" settings.  
**Fix:** Restructure tabs:
- **Profile** — display name, email address, daily briefing toggle
- **Email** — forwarding address, my email addresses, blocked senders
- **Organisation** — org name, business description, industry, membership types (currently in Organisation tab)
- **Tools** — import tool, retro scan, export data
- **Billing** — existing billing tab
- **Account** — delete account (isolated, deliberate)

### ✅ P5.3 — Delete Account button is too accessible
**File:** `app/settings/page.tsx`  
**Screenshot:** `07-settings.png` (bottom of page — red Delete button in the main settings flow)  
**Issue:** The red "Delete my account" button sits at the bottom of the main settings scroll, one stray click away.  
**Fix:** Move into an "Account" tab or a collapsed "Danger Zone" section. Add a confirmation that requires the user to type something (e.g., their org name) before the button activates. This is a standard pattern for irreversible destructive actions.

---

## Phase 6 — Insights Page

### ✅ P6.1 — Insight cards are empty and inert
**File:** `app/daily-briefing/page.tsx` (Insights page)  
**Screenshot:** `08-daily-briefing.png` (8 identical blank cards, all showing "Generated Xd ago" with no content)  
**Issue:** All 8 cards look identical. Most show "Generated 5d ago" with no content preview — the card is completely blank until you generate. Users can't tell if the insights are stale or relevant without clicking Generate. The page has very low information density.  
**Fix:**
- Show the opening line (or a 1-sentence summary) of the last generated content directly on the collapsed card — this makes the page feel alive and worth visiting even before regenerating
- Add a visual indicator for staleness: green dot (generated today), amber (2–7 days), grey (7+ days)
- The "Generate" button should be renamed "Regenerate" when content exists, "Generate" when empty — this tells the user whether content is available

---

## Phase 7 — Import Pages

### ✅ P7.1 — Gmail and Outlook import pages are nearly empty
**Files:** `app/import/gmail/page.tsx`, `app/import/outlook/page.tsx`  
**Screenshots:** `09-import-gmail.png`, `10-import-outlook.png` (single button on a nearly empty page)  
**Issue:** A single "Connect Gmail/Outlook" button centred on a vast white page. No context about what happens after connecting — how many emails, what the review process looks like, whether it's reversible.  
**Fix:** Add a 3-step visual explainer below the button:
1. We scan your last 12 months of email headers (read-only, nothing sent or deleted)
2. You review and choose which emails to import
3. They're filed to the right business and contact

This is a trust-building moment — users are about to grant email access. Give them confidence about what they're agreeing to.

---

## Phase 8 — New Entry

### ✅ P8.1 — Step indicator is decorative and misleading
**File:** `app/new-entry/page.tsx`  
**Screenshot:** `04-new-entry.png` (top of form — step indicator above a fully-rendered single-page form)  
**Issue:** The "1 Business → 2 Contact → 3 Correspondence" step indicator at the top of New Entry implies a wizard/multi-step flow, but the entire form renders at once. For a first-time user this is confusing — they might think they need to complete step 1 before step 2 becomes available (Contact is indeed disabled until a business is selected, which reinforces this expectation).  
**Fix:** Either (a) remove the stepper entirely — it adds visual noise without function, the form is self-explanatory — or (b) make it functional: genuinely show only the Business selector first, then reveal Contact once a business is chosen, then reveal the rest. Option (a) is faster and cleaner.

---

## Phase 9 — Actions + Insights Overhaul

Background: full UX/UI re-audit of the Actions and Insights surfaces (April 2026). Decisions captured in `~/.claude/plans/right-full-review-what-expressive-quasar.md`. Conclusion: Actions is organised by *why* an item exists, not *when* you need to deal with it; the unified urgency score the code already computes is thrown away by the 5-section grouping. Insights is a 16-card menu, not a briefing — staleness dots exist but don't drive ordering.

This phase reshapes both pages so the answer to "what matters today?" is on the page when you land.

### ✅ P9.1 — Actions: drop Gone Quiet, merge Reminders, expose topPriority slice
**Files:** `app/actions/page.tsx`, `app/actions/_hooks/useActionsData.ts`, `app/actions/_hooks/useUnifiedList.ts`, `app/actions/_components/QuietRow.tsx` (delete)
**Why:** Gone Quiet isn't an action — it's an observation; the existing Reconnect List insight covers it. Reminders vs Actions Due is a technical distinction (action_needed flag set vs unset), not a user one. Top 5 needs a derived slice off the already-sorted unifiedList.
**Fix:**
- Drop `getGoneQuiet()` from `page.tsx` parallel fetch and from `useActionsData` (state, mapping, reload, removeItem).
- In `useUnifiedList.ts`: drop the `goneQuiet` parameter and the QUIET branch; drop the `quiet` slice from `sections`; merge REMINDER items into the `actions` slice filter (keep REMINDER badge — only the section grouping changes, not urgency colour).
- Expose `topPriority = unifiedList.slice(0, 5)` from the hook (no padding — actual count if <5).
- Delete `app/actions/_components/QuietRow.tsx`.
- Update `actionsSubtitle` to include reminder count.

### ✅ P9.2 — Actions: render Top Priorities hero block
**Files:** `app/actions/_components/ItemRow.tsx`, `app/actions/_components/ActionsClient.tsx`
**Why:** The page should lead with a single prioritised list across categories. Numbered 1-5 (or 1-N), same row style as below — priority is communicated by the number, not by changing row size.
**Fix:**
- `ItemRow.tsx`: add optional `priorityNumber?: string` prop. Render small "1." style prefix to the left of the badge area when present.
- `ActionsClient.tsx`: add a Top Priorities block above the existing sections. Heading reads "Top priorities" if 5+, else "Top {N} {priority|priorities}". Render `topPriority` items as `ItemRow` with `priorityNumber`. Show only when `topPriority.length > 0`.

### ✅ P9.3 — Actions: collapse all sections by default + persist subtitle on expand
**Files:** `app/actions/_components/ActionsClient.tsx`, `app/actions/_components/CollapsibleSection.tsx`
**Why:** Top Priorities is now the hero — sections become a reference catalogue beneath it. Section subtitles (e.g. "oldest 5 days · 2 overdue") currently vanish when the section opens, losing context exactly when the user needs it.
**Fix:**
- `ActionsClient.tsx`: Remove the entire Gone Quiet `CollapsibleSection`. Remove the standalone Reminders `CollapsibleSection` (items now live under Actions Due). Set `defaultExpanded={false}` on Needs Reply, Actions Due, and Renewals & Contracts (drop the `urgentRenewal` conditional).
- `CollapsibleSection.tsx`: render `subtitle` regardless of `open` state (move out of the `!open` conditional).

### ✅ P9.4 — Insights: grid → vertical tools-menu list, sort by staleness
**File:** `components/InsightsPanel.tsx`
**Why:** The 16-card 2-column grid is a menu of tools, not a briefing. Cards are ordered by type, not freshness — green-dot insights should float up. Recasting as a vertical list signals "these are run-on-demand analyses" rather than "look at all this".
**Fix:**
- Replace `grid grid-cols-2 gap-2` with a vertical tools-menu list. Each row: title (left) with one-line description below, staleness dot + age (right), Generate/Regenerate button on far right.
- Sort within each section (`ORG_WIDE_TYPES`, `BUSINESS_TYPES`, `presets`) by staleness then last-generated time — greens first, never-generated last. Reuse the existing `cacheStatus` data already loaded on mount.
- Keep the expanded card behaviour intact (history, refresh, action buttons, "Add to Actions"). Section headings (Org-Wide / For [Business] / Your Presets) stay.

### ✅ P9.5 — Dashboard: remove Insights sidebar entirely
**File:** `components/DashboardClient.tsx`
**Why:** Once the page is the tools menu (no longer "today's important stuff"), the 8px collapsed sidebar strip is dead weight. The mobile Insights button is also redundant. Insights live at `/insights` only; business-page slide-out remains for per-business context.
**Fix:**
- Remove the dashboard sidebar (both collapsed strip and expanded panel).
- Remove the `insights_sidebar_expanded` localStorage reads/writes (orphan key, no migration).
- Remove the mobile Insights button in the dashboard header.
- Leave `components/InsightsContext.tsx` and the business-page slide-out (`BusinessDetailClient.tsx`) untouched.

---

## Phase 10 — Actions Intelligence Upgrade

Detailed implementation notes: `~/.claude/plans/thoughts-on-the-below-synchronous-newell.md`

Background: after reviewing a proposal for an "Autonomous Executive Command Center", the genuinely new work was distilled to four items. Roughly 60% of the proposal already exists; the four items below are what's missing. Build in order — each is self-contained and safe to ship independently.

**Hard rules for this phase:** read every file before editing, one file at a time, never rewrite existing behaviour — only extend. Commit after every sub-item.

### ✅ P10.1 — Actions: presentation polish
**Files:** `app/actions/_components/ItemRow.tsx`
**What:** CSS/layout only — no AI, no new data, no schema changes.
- Business name → `font-semibold text-base` (currently too light — it's the primary identifier)
- Contact name + role → same line as business name, separated by `·`, `text-sm text-gray-500`
- Subject → `text-sm text-gray-600 italic` (tertiary, visually distinct)
- Timestamp chip → compact right-aligned context: "Received 8d ago" / "Due 3d ago" / "Expires in 12d" — derive from existing `badgeLabel` / `daysAgo` fields, no new fetches
- Left border → `border-l-2` → `border-l-[3px]`, keep existing colour logic
- Row padding → `py-3` → `py-3.5`
- Snippet → confirm always `line-clamp-2` with click-to-expand
**Do NOT change:** badge logic, action buttons, LogPanel, DraftPanel, keyboard nav, urgency scoring.
**Commit:** `UX: richer card layout and typography polish on Actions items`

### ✅ P10.2 — Actions: 100ms polish pass
**Files:** action component CSS + `app/actions/_hooks/useActionHandlers.ts` (or wherever `handleDone`/`handleSnooze` live)

**Layer A — CSS timings:**
- Log/Draft panel open: → 150ms ease-out
- Snooze dropdown: remove transition, instant
- Keyboard focus highlight: remove transition, instant bg swap
- Section expand/collapse: → 150ms
- (Rationale panel added in P10.4 will use 150ms)

**Layer B — Optimistic mutations (bigger win):** Done/Snooze currently wait for server action before removing the item — UI freezes 300–800ms per keypress.
Pattern:
1. Immediately `removeItem(id)` from local list
2. Fire server action in background (no await in UI thread)
3. On failure: `restoreItem(item)` + `toast.error('Could not mark done')`
Check if `removeItem`/`restoreItem` already exist in `useUnifiedList` or `useActionsData` before adding.
Do NOT apply optimistic updates to Log/Draft (those open input panels).
**Commits:**
- `UX: tighten Actions page transitions to ≤150ms`
- `UX: optimistic Done and Snooze so mutations feel instant`

### P10.3 — Actions: surface buried commitments in the feed
**Goal:** `insight_history` rows with `insight_type = 'what_did_we_agree'` generated within 14 days appear as actionable cards in the Actions feed. If none exist, page looks exactly as before.

**New type** (add to `app/actions/_types.ts`):
```typescript
export interface CommitmentItem {
  id: string            // insight_history.id
  type: 'commitment'
  business_id: string
  business_name: string
  content_preview: string   // first 120 chars, markdown stripped
  generated_at: string
}
```

**New server action** `getCommitmentAlerts()`:
- Query: `insight_history WHERE org_id=? AND insight_type='what_did_we_agree' AND generated_at > now()-'14 days' AND business_id IS NOT NULL`
- Group by business_id, most recent per business; join businesses for name
- Return `CommitmentItem[]`
- Add to parallel fetch in `app/actions/page.tsx`, add `commitments` to `InitialActionsData`

**Wire into `useUnifiedList.ts`:** badge `'COMMITMENT'`, urgencyScore `7.5`, badgeLabel `"Outstanding commitments"`, included in `sections.actions` slice.

**Wire into `ItemRow.tsx`:** handle `item.type === 'commitment'`: business name bold, badge `bg-amber-100 text-amber-800`, content preview 2-line clamp italic, "Generated Xd ago" chip, no direction/contact indicator. Actions: Done + Snooze + Log. Dismissal: localStorage `dismissed_insights` key (no DB migration — items age out of 14-day window naturally).

**Commit:** `Feature: surface outstanding commitment alerts in Actions feed`

### P10.4 — Actions: rationale slide-out panel
**Goal:** click any item → 380px right panel slides in with plain-English explanation of *why* it's urgent. No AI calls — rule-based + cached insight content + lazy relationship_memory fetch.

**New component** `app/actions/_components/RationalePanel.tsx`:
- Props: `item`, `insightCache` (business_id→content), `relationshipMemory` (business_id→string), `onClose`, `onDone`, `onSnooze`, `onLog`, `onDraft`
- Animation: `translate-x-full` → `translate-x-0`, `transition-transform duration-150 ease-out`
- Mobile (< md): full-width bottom sheet

**Rationale text by badge:**
- REPLY: "You received a message from [contact] at [business] [X] days ago. No reply sent since."
- OVERDUE: "Flagged as [action type], due [date]. Now [X] days overdue."
- DUE_TODAY/SOON: "This [action type] is due [today / in X days]."
- FLAG: "Flagged for follow-up on [date]."
- RENEWAL/EXPIRED: "Contract [expires/expired] [date] — [X] days [away/ago]. Value: [amount]."
- COMMITMENT: render `insightCache[business_id]` content (markdown, scrollable)
- REMINDER: "Reminder set — due [date]."
- Source link for correspondence: `→ '[subject]' on [date]` → `/businesses/[id]`
- Relationship memory: show below as subtle "Context" block with faint border-left (lazy fetch, cached in state Map)

**New server action** `getRelationshipMemory(businessId)` in `app/actions/rationaleContext.ts`:
- `SELECT relationship_memory FROM businesses WHERE id=? AND org_id=?`
- Called lazily on panel open; result cached in `relationshipMemoryCache` state Map

**Changes to `ActionsClient.tsx`:**
- Add state: `rationalePanelId`, `relationshipMemoryCache`
- `insightCache` = `useMemo` over commitments array
- `ItemRow` gets new `onSelect` prop → sets `rationalePanelId`
- Opening Log/Draft closes rationale panel; opening rationale does NOT close Log/Draft
- Wrap list in `<div className="flex">` with `mr-[380px]` when panel open (150ms transition)
- Keyboard: `Escape` closes panel; `↑↓` navigate + update panel content; `Enter` opens panel for focused item

**Do NOT change:** Log panel, Draft panel, Snooze menu, D/S/L shortcuts, section collapse, urgency scoring, existing data fetches.

**Commit:** `Feature: rationale slide-out panel on Actions page`

---

## Implementation Order Summary

| Phase | What | Why first |
|-------|------|-----------|
| P0 | Bug fix — Unauthorized error | Affects real users now |
| P1 | Navigation (all 3 tasks) | Touches every page; do once |
| P2 | Dashboard (all 3 tasks) | Highest-traffic page |
| P3 | Actions (badge + density) | Second most-used page |
| P4 | Business page (filter bar, export, today) | Core daily-use page |
| P5 | Settings (blocked senders, structure, danger zone) | High pain, self-contained |
| P6 | Insights (card content preview) | Relatively self-contained |
| P7 | Import pages (explainer copy) | Quick copy additions |
| P8 | New Entry (stepper) | Low risk, small change |

Total estimated sessions: 4–6, depending on how deep the mobile nav work goes (P1.3 is the biggest single item).

---

## Working Practices

These apply throughout all phases:

**Commits** — commit after every completed item (not every phase). Prefix: `Fix:` for bug fixes, `Feature:` for new behaviour, `UX:` for visual/layout changes, `Refactor:` for structural changes with no behaviour change. Push to `origin main` after each commit so Vercel auto-deploys and changes can be verified live.

**Memory** — after each session, update `CLAUDE.md` Recent Changes and relevant memory files in `.claude/projects/.../memory/` to reflect what was done, any patterns established, and any decisions made. If a new component pattern is introduced (e.g. mobile nav drawer), note it so future sessions don't re-derive it.

**Context** — each phase should ideally be its own session. If a session runs long, `/clear` and re-orient from the plan doc + CLAUDE.md before continuing. Do not carry stale context from one phase into the next.

**Verify on live** — after each push, check the Vercel deployment (`https://correspondence-clerk.vercel.app`) before marking an item done. Don't rely solely on local dev to sign off.

**Screenshot updates** — when a phase is complete, re-run `npx tsx scripts/screenshot-audit.ts` for the affected pages and save updated screenshots alongside the originals (e.g. `01-dashboard-after.png`) so before/after is visible in the project.
