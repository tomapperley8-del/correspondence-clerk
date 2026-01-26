# 🚀 Session Start Guide - Correspondence Clerk

**Read this first when starting a new session with Claude Code**

---

## ⚡ Quick Context

**Project:** Correspondence Clerk - Web app that turns messy correspondence into clean, chronological letter files
**Status:** ✅ Fully functional and deployed to production
**Last Major Update:** January 26, 2026 - Bookmarklet race condition fix (href now set before drag allowed)

---

## 🌐 Live Deployment

**Production URL:** https://correspondence-clerk.vercel.app

**Deployment Method:** Vercel (auto-deploys from GitHub main branch)

**How to Deploy:**
```bash
# Option 1: Push to GitHub (triggers auto-deploy)
git push origin main

# Option 2: Manual deploy with Vercel CLI
vercel --prod --yes
```

**Vercel Project:**
- Organization: tom-apperleys-projects
- Project: correspondence-clerk
- Project ID: prj_TLkqSYexjPOdnZNKJGGcq3AGpSO9

---

## 📸 Screenshot Workflow

**User can share screenshots with you:**

1. User takes screenshot (Fn + Shift + PrtSc)
2. User double-clicks **"Save Screenshot for Claude.bat"** on Desktop
3. User pastes file path here with Ctrl+V
4. You read the image automatically

**Location:** Desktop shortcut already created
**Saves to:** `C:\Users\Bridg\AppData\Local\Temp\claude-screenshots\`

---

## 📁 Project Structure

```
C:\Users\Bridg\Projects\correspondence-clerk\

Key Files:
├── CLAUDE.md                    # 📖 Full PRD + Hard Rules (READ THIS FIRST)
├── CURRENT_STATE.md             # Current implementation status
├── DEPLOYMENT_REPORT.md         # Latest deployment (AI fix, Jan 22)
├── ARCHITECTURE.md              # Database schema, RLS, technical details
├── README.md                    # Setup and overview
├── SCREENSHOT_WORKFLOW.md       # How screenshots work

Code:
├── app/                         # Next.js 15 App Router
│   ├── actions/                # Server actions (businesses, contacts, correspondence, AI)
│   ├── dashboard/              # Main dashboard
│   ├── businesses/[id]/        # Business detail (letter file view)
│   ├── new-entry/              # Correspondence entry form
│   └── search/                 # Full-text search
├── lib/ai/                      # AI formatting (Anthropic integration)
├── components/                  # React components
└── supabase/migrations/         # Database migrations

Environment:
├── .env.local                   # Environment variables (NOT in git)
└── .vercel/                     # Vercel deployment config
```

---

## 🎯 Current State (All 10 Steps Complete)

### ✅ Step 1: Foundation and Auth
- Next.js 15 + Supabase Auth working

### ✅ Step 2: Database Migrations
- All tables created: businesses, contacts, correspondence
- Full-text search indexes
- RLS policies (all authenticated users can read/write)

### ✅ Step 3: Dashboard and Business Pages
- Dashboard with search, filters, sorting
- Business detail page (letter file view)
- Two-section archive (Recent + Archive)

### ✅ Step 4: New Entry Flow
- Forced filing (must select business + contact)
- Entry date required, time optional
- Direction field (for emails only)
- Smart prefill from query params

### ✅ Step 5: AI Formatter **[LATEST: Jan 22, 2026]**
- **Anthropic structured outputs** (guaranteed valid JSON)
- **Model:** claude-sonnet-4-5 (latest)
- **Token budget:** 16,384 (handles 13KB+ threads)
- **Temperature:** 0 (deterministic)
- Thread detection and splitting
- **Zero JSON parsing errors** (verified with test suite)
- Graceful fallback (saves unformatted if AI fails)

### ✅ Step 6: Manual Editing
- Edit button on each entry
- Only edits formatted_text_current
- Preserves originals (raw + formatted)

### ✅ Step 7: Full-Text Search
- Search across businesses and correspondence
- Business name prioritization

### ✅ Step 8: Mastersheet Import
- CSV import with duplicate merging
- Dashboard filters and sorting

### ✅ Step 9: Export to Google Docs
- Export button on business detail page
- Uses MCP Google Workspace integration
- Print-ready formatting

### ✅ Step 10: Outlook Web Integration **[LATEST: Jan 26, 2026]**
- Bookmarklet for one-click email import from Outlook Web
- Install pages: `/install-bookmarklet` and `/bookmarklet`
- **Settings > Tools** section links to bookmarklet (for returning users)
- Extracts subject, body, from, to, date from Outlook Web
- Pre-fills new entry form via postMessage API
- **Fixed:** Race condition where href wasn't set before drag
- **Fixed:** API now always uses production URL (not preview deployment)
- Works on outlook.com, outlook.office.com, outlook.live.com

---

## 🔑 Environment Variables

**Location:** `.env.local` (NOT in git, already configured)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Anthropic (for AI formatting)
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🚨 Hard Rules (Always Enforce)

From CLAUDE.md - these override everything:

1. ✅ **PRESERVE USER WORDING EXACTLY** - No rewriting
2. ✅ **NEVER INVENT CONTENT** - No suggestions
3. ✅ **ENFORCE FORCED FILING** - Must select business AND contact
4. ✅ **SHOW CONTACT DETAILS** - Role, email, phone visible
5. ✅ **FAIL GRACEFULLY** - AI outage never blocks saving
6. ✅ **NO PLACEHOLDERS** - Must name real person every time
7. ✅ **STRICT JSON ONLY** - AI returns validated JSON
8. ✅ **MANUAL EDITS ONLY** - Edits are human corrections
9. ✅ **CLEAR LABELS** - No icon-only buttons
10. ✅ **PRESERVE ORIGINALS** - Keep raw_text_original and formatted_text_original

---

## 🛠️ Common Commands

```bash
# Development
npm run dev                      # Start dev server (localhost:3000)
npm run build                    # Build for production
npm run lint                     # Run linter

# Testing
npx tsx scripts/test-ai-formatting.ts    # Test AI formatting

# Deployment
git push origin main             # Push to GitHub (auto-deploys)
vercel --prod --yes              # Manual Vercel deploy

# Screenshots
# (User double-clicks Desktop file instead of running npm command)

# Database
npx supabase migration list      # List migrations
npx supabase db reset            # Reset local DB
npx supabase db push             # Push migrations to remote
```

---

## 📊 Tech Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email/password)
- **AI:** Anthropic Claude (claude-sonnet-4-5)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Deployment:** Vercel
- **Language:** TypeScript

**Design Rules:**
- NO rounded corners (border-radius: 0)
- NO shadows
- British date format (DD/MM/YYYY)
- All buttons have text labels

---

## 🐛 Known Issues

**None currently!** All features working as expected.

**Latest Fixes (Jan 26, 2026):**
- Fixed bookmarklet race condition - href now confirmed set before allowing drag
- Added `isReady` state to prevent dragging empty/invalid bookmarks
- **Fixed bookmarklet API to always use production URL** (not preview deployment URL)
- API now returns self-contained postMessage bookmarklet (no external script loading)
- Added **Settings > Tools** section so users can find bookmarklet after dismissing banner
- Updated USER_GUIDE.md with bookmarklet instructions and troubleshooting

**Previous Fix (Jan 22, 2026):**
- Eliminated JSON parsing errors with Anthropic structured outputs
- 100% success rate on test suite (3/3 tests passed)
- Handles long email threads (13KB+) without errors

---

## 📝 Key Implementation Details

### Date Handling
- Entry date: REQUIRED (type="date")
- Entry time: OPTIONAL (type="time", defaults to 12:00 PM)
- Format: British DD/MM/YYYY

### Direction (Emails Only)
- Required for emails only
- Radio buttons: "Received from them" / "Sent to them"
- Stored as: 'received' | 'sent' | null

### AI Formatting
- Uses Anthropic structured outputs (no JSON errors)
- Thread detection with split toggle
- Graceful fallback (saves unformatted if AI fails)
- "Format Later" button for unformatted entries

### Two-Section Archive
- Recent: Last 12 months (oldest→newest, chronological)
- Archive: Older entries (newest→oldest, collapsed)

---

## 🔗 Quick Links

**Production:** https://correspondence-clerk.vercel.app
**GitHub:** https://github.com/tomapperley8-del/correspondence-clerk
**Vercel Dashboard:** https://vercel.com/tom-apperleys-projects/correspondence-clerk
**Supabase Dashboard:** https://supabase.com/dashboard/project/...

---

## 🎬 What to Do First

1. **Read CLAUDE.md** - Understand the product requirements and hard rules
2. **Check git status** - See what's uncommitted
3. **Ask user what they need** - Let them guide the session
4. **Reference this file** - For deployment, commands, context

---

## 💬 Common User Requests

### "Deploy to Vercel"
```bash
vercel --prod --yes
```

### "Run the tests"
```bash
npx tsx scripts/test-ai-formatting.ts
```

### "I'm seeing an error" (with screenshot)
- User will paste screenshot path
- You read it automatically with Read tool
- Analyze and help debug

### "Add a new feature"
1. Read CLAUDE.md for hard rules
2. Check CURRENT_STATE.md for existing code
3. Implement following design rules
4. Test locally
5. Deploy to Vercel

---

## ⚠️ Important Notes

- **Mastersheet.csv:** Contains sensitive data, already in .gitignore
- **ANTHROPIC_API_KEY:** Already configured in .env.local
- **Database migrations:** All run, up to date
- **Screenshot workflow:** Desktop shortcut already created for user
- **Deployment:** Auto-deploys on push to main branch

---

## 🚀 Ready to Start!

You now have all the context needed. Ask the user what they want to work on today!

**Key Files to Reference:**
- **CLAUDE.md** - Product requirements and hard rules
- **CURRENT_STATE.md** - Detailed implementation status
- **DEPLOYMENT_REPORT.md** - Latest changes (AI fix)
- **This file** - Quick reference and commands

---

**Last Updated:** January 26, 2026
**Version:** v1.1 - All 10 steps complete, bookmarklet fix deployed, production ready
