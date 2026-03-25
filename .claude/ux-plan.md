# UX Plan — 8 Items

## 1. Draft auto-save (new-entry page)
**Files:** `app/new-entry/page.tsx`
- On mount: read `localStorage['new_entry_draft']`, restore rawText, subject, entryType, direction, entryDateOnly, actionNeeded (NOT businessId/contactId — those come from query params or user selection)
- On change: debounced (1s) `useEffect` that writes those fields to localStorage
- On successful save: call `localStorage.removeItem('new_entry_draft')`
- Show a subtle "Draft saved" / "Draft restored" indicator near the textarea
- Only restore if draft key exists AND rawText is non-empty

---

## 2. Optimistic UI for quick actions
**Files:** `app/businesses/[id]/page.tsx`
- Replace the "fire server action → refetch all correspondence" pattern in quick action buttons with:
  1. Immediately update local `correspondence` state (find entry by id, set action_needed)
  2. Fire `setCorrespondenceAction()` in background
  3. On error: revert local state + show toast
- Removes the ~500ms stall after clicking Follow-up / Waiting on them / Mark done

---

## 3. Action count badge on nav
**Files:** `app/actions/correspondence.ts` (new lightweight count fn), `components/Navigation.tsx`
- Add `getOutstandingActionsCount()` — single `count` query: `action_needed != 'none'`, no joins needed
- In Navigation: fetch count on mount (client-side, after auth resolves)
- Render small red badge on "Actions" nav link when count > 0
- Re-fetch on path change so it updates after marking done

---

## 4. Recently viewed in Cmd+K
**Files:** `components/CommandSearch.tsx`
- On navigate: push `{ id, name }` to `localStorage['cmd_k_recent']` (max 5, deduplicated, most-recent first)
- On open: if query is empty, show "Recent" section above results using stored list
- Fall back gracefully if business was deleted (just skip it — don't validate against fetched list)

---

## 5. Toast notifications
**Files:** `components/Toast.tsx` (new), `app/layout.tsx`, `app/businesses/[id]/page.tsx`
- Simple self-contained toast: fixed bottom-right, auto-dismisses after 3s, supports success/error/info variants
- Expose via a module-level event emitter (`toast.success('Pinned')` etc.) — no context/provider needed
- Wire into business page: Pin/Unpin, Delete entry, quick actions (Follow-up set, Mark done)
- Toast.tsx pattern:
  - Singleton `<ToastContainer />` in layout.tsx
  - `toast(message, variant?)` function exported from `lib/toast.ts` that fires a CustomEvent
  - ToastContainer listens for the event and renders toasts

---

## 6. Mobile layout fixes
**Files:** `app/businesses/[id]/page.tsx`, `app/dashboard/page.tsx`
- Business page filter bar: wrap controls into two rows on small screens (currently overflows horizontally)
  - Row 1: sort + direction filter
  - Row 2: contact filter + date range
  - Search stays full-width above both rows
- Entry action buttons: increase tap target (py-2 instead of py-1 on mobile via responsive classes)
- Dashboard: the grid is already responsive; main gap is the filter button row — allow wrapping

---

## 7. Jump to today anchor
**Files:** `app/businesses/[id]/page.tsx`
- Add a `recentSectionRef = useRef<HTMLDivElement>(null)` on the Recent Section heading div
- Add a floating "↑ Today" button (fixed bottom-left, only visible when user has scrolled past the Recent section heading AND the section exists)
- Use IntersectionObserver to detect when Recent heading is out of view
- Click: `recentSectionRef.current?.scrollIntoView({ behavior: 'smooth' })`

---

## 8. New entries badge on dashboard cards
**Files:** `app/dashboard/page.tsx`
- On business card render: read `localStorage['last_visited_<id>']` timestamp
- Compare against `business.last_contacted_at` — if last_contacted_at is newer, show a small green dot on the card
- On click (navigating to business): write current timestamp to `localStorage['last_visited_<id>']`
- No server calls — purely client-side using existing `last_contacted_at` field

---

## Execution order
1. Toast (needed by #2, #3)
2. Optimistic quick actions (#2, depends on toast for error rollback)
3. Action badge on nav (#3)
4. Recently viewed Cmd+K (#4)
5. Draft auto-save (#1)
6. New entries badge (#8)
7. Jump to today (#7)
8. Mobile layout (#6) — last, as it's CSS-only and low-risk
