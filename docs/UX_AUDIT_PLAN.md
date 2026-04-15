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

### P3.2 — Needs Reply section is a wall of text
**File:** `app/actions/page.tsx` + `_components/`  
**Screenshot:** `03-actions.png` (full page — long unbroken list of items with multi-line snippets)  
**Issue:** With 30+ items all fully expanded showing multi-line snippets, the Needs Reply section is overwhelming. Items blend into each other without clear visual boundaries.  
**Fix:**
- Truncate snippets to a single line (add `line-clamp-1` or `line-clamp-2`) with a subtle expand-on-click
- Add a more pronounced visual separator between items (a light card border or slightly more vertical padding)
- Consider showing a "Showing 10 of 32 — Show more" pattern rather than rendering all items at once, to make the page feel manageable

---

## Phase 4 — Business Page

### P4.1 — Correspondence filter bar has too many controls
**Files:** `app/businesses/[id]/_components/FilterBar.tsx` (or equivalent)  
**Screenshot:** `12-business-page-scrolled.png` (Correspondence section — full filter bar visible above entries)  
**Issue:** Sort (2 toggle buttons) + Direction (3 toggle buttons) + Show (4 buttons + Custom) + Contact dropdown = 10+ visible controls above the correspondence list on every page load.  
**Fix:** Collapse to a single "Filter & Sort" button that opens a compact dropdown/popover showing all the options. Show active filter state on the collapsed button (e.g., "Newest · All · 12 Months"). Most users never change these from defaults — they shouldn't dominate the UI.

### P4.2 — Export button is the wrong visual weight
**File:** `app/businesses/[id]/page.tsx` or `_components/`  
**Screenshot:** `12-business-page-scrolled.png` (Correspondence header — green Export button same weight as navy New Entry)  
**Issue:** The Export button uses the same olive/green accent fill as primary actions, making it visually compete with "New Entry". Export is a rare action.  
**Fix:** Change Export to a ghost/outline button style. The hierarchy in the Correspondence header should be: New Entry (primary, navy) → Insights (secondary outline) → Export (ghost/text).

### P4.3 — "Today" floating button is oddly positioned
**File:** `app/businesses/[id]/page.tsx` or `_components/`  
**Screenshot:** `12-business-page-scrolled.png` (bottom-left corner — "↑ Today" button)  
**Issue:** The floating `↑ Today` button sits bottom-left, which is unconventional (floating actions are usually bottom-right). Its purpose isn't immediately obvious.  
**Fix:** Either (a) move it to bottom-right, or (b) replace it with an inline anchor link near the correspondence date group headers ("Jump to today ↑") that only appears when the user has scrolled past today's entries. Option (b) is less intrusive.

---

## Phase 5 — Settings Page

### P5.1 — Blocked Senders dominates the page
**File:** `app/settings/page.tsx`  
**Screenshot:** `07-settings.png` (full page — blocked senders list occupies ~70% of the scroll)  
**Issue:** ~50 blocked sender entries take up roughly 70% of the Settings page, pushing all other settings far down.  
**Fix:** Collapse the Blocked Senders list by default. Show: "Blocked Senders (47) — Manage ▼". Expanding reveals the full list with Unblock buttons. Alternatively, move it into a separate "Email" tab alongside forwarding address and email addresses (these are all email-related settings anyway).

### P5.2 — Settings page needs proper sub-navigation
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

### P5.3 — Delete Account button is too accessible
**File:** `app/settings/page.tsx`  
**Screenshot:** `07-settings.png` (bottom of page — red Delete button in the main settings flow)  
**Issue:** The red "Delete my account" button sits at the bottom of the main settings scroll, one stray click away.  
**Fix:** Move into an "Account" tab or a collapsed "Danger Zone" section. Add a confirmation that requires the user to type something (e.g., their org name) before the button activates. This is a standard pattern for irreversible destructive actions.

---

## Phase 6 — Insights Page

### P6.1 — Insight cards are empty and inert
**File:** `app/daily-briefing/page.tsx` (Insights page)  
**Screenshot:** `08-daily-briefing.png` (8 identical blank cards, all showing "Generated Xd ago" with no content)  
**Issue:** All 8 cards look identical. Most show "Generated 5d ago" with no content preview — the card is completely blank until you generate. Users can't tell if the insights are stale or relevant without clicking Generate. The page has very low information density.  
**Fix:**
- Show the opening line (or a 1-sentence summary) of the last generated content directly on the collapsed card — this makes the page feel alive and worth visiting even before regenerating
- Add a visual indicator for staleness: green dot (generated today), amber (2–7 days), grey (7+ days)
- The "Generate" button should be renamed "Regenerate" when content exists, "Generate" when empty — this tells the user whether content is available

---

## Phase 7 — Import Pages

### P7.1 — Gmail and Outlook import pages are nearly empty
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

### P8.1 — Step indicator is decorative and misleading
**File:** `app/new-entry/page.tsx`  
**Screenshot:** `04-new-entry.png` (top of form — step indicator above a fully-rendered single-page form)  
**Issue:** The "1 Business → 2 Contact → 3 Correspondence" step indicator at the top of New Entry implies a wizard/multi-step flow, but the entire form renders at once. For a first-time user this is confusing — they might think they need to complete step 1 before step 2 becomes available (Contact is indeed disabled until a business is selected, which reinforces this expectation).  
**Fix:** Either (a) remove the stepper entirely — it adds visual noise without function, the form is self-explanatory — or (b) make it functional: genuinely show only the Business selector first, then reveal Contact once a business is chosen, then reveal the rest. Option (a) is faster and cleaner.

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
