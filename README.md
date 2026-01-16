# Correspondence Clerk

Turn messy correspondence into clean, chronological letter files.

## Overview

The Correspondence Clerk is a web app that transforms messy real-world correspondence into organized, print-ready, chronological letter files per business. It replaces the manual workflow of copying and pasting emails and call notes into Word documents and folders.

**It is not a CRM.** It does not suggest, rewrite, or follow up. It files what happened.

## Tech Stack

- **Next.js 15** (React, App Router)
- **TypeScript**
- **Tailwind CSS** (v4)
- **shadcn/ui** (customized with no rounded corners, no shadows)
- **Supabase** (Auth + PostgreSQL)
- **Anthropic Claude API** (AI formatting - to be integrated)

## Setup Instructions

### Prerequisites

- Node.js 24.x or later
- npm 11.x or later
- A Supabase account ([sign up free](https://supabase.com))

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Update `.env.local` with your Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   Get your Supabase credentials from [your project settings](https://supabase.com/dashboard).

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open the app:**

   Navigate to [http://localhost:3000](http://localhost:3000)

### First Steps

1. Create an account at `/signup`
2. Check your email for the confirmation link
3. Log in at `/login`
4. You'll see the placeholder dashboard

**Note:** Database tables will be created in Step 2. For now, authentication works but business features are placeholders.

## Project Status

### Current Status

- ✅ **Step 1: Foundation and Auth** (COMPLETE)
  - Next.js 15 project initialized
  - Tailwind CSS configured (no rounded corners, no shadows)
  - shadcn/ui components installed
  - Supabase Auth working (signup, login, logout)
  - Protected routes implemented
  - Navigation shell created
  - TypeScript types defined

- ⏳ **Step 2:** Database migrations and RLS
- ⏳ **Step 3:** Dashboard and business pages
- ⏳ **Step 4:** New entry flow
- ⏳ **Step 5:** AI formatter
- ⏳ **Step 6:** Editing layer
- ⏳ **Step 7:** Full-text search
- ⏳ **Step 8:** Mastersheet import
- ⏳ **Step 9:** Export to Google Docs

## Design Rules

This project follows strict design guidelines:

- ✅ **NO rounded corners** (border-radius: 0 everywhere)
- ✅ **NO box shadows**
- ✅ **All buttons have text labels** (no icon-only)
- ✅ **Clear focus states** for accessibility
- ✅ **System font stack** for performance
- ✅ **14px base font size** with hierarchy

See `.cursorrules` for complete design guidelines.

## Project Structure

```
correspondence-clerk/
├── app/                    # Next.js App Router pages
│   ├── auth/              # Auth callback and error pages
│   ├── dashboard/         # Dashboard (placeholder)
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   ├── new-entry/         # New entry page (placeholder)
│   ├── search/            # Search page (placeholder)
│   ├── globals.css        # Global CSS with design overrides
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page (redirects)
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── Navigation.tsx    # Main navigation
├── lib/                   # Utilities and helpers
│   ├── supabase/         # Supabase clients
│   └── types/            # TypeScript types
├── middleware.ts          # Session management
├── ARCHITECTURE.md        # Technical architecture
├── CLAUDE.md             # Product requirements
├── USER_FLOW.md          # User flow documentation
├── GLOSSARY.md           # Terminology
└── .cursorrules          # Design rules

```

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Complete product requirements and hard rules
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical architecture and database schema
- **[USER_FLOW.md](./USER_FLOW.md)** - User flows and interaction patterns
- **[GLOSSARY.md](./GLOSSARY.md)** - Project terminology
- **[OUTLOOK_INTEGRATION.md](./OUTLOOK_INTEGRATION.md)** - Outlook Web integration guide

## Outlook Integration

Send emails directly from Outlook Web to Correspondence Clerk with a browser bookmarklet.

**Quick Start:**
1. Install the bookmarklet (see [OUTLOOK_INTEGRATION.md](./OUTLOOK_INTEGRATION.md))
2. Open an email in Outlook Web
3. Click the bookmarklet
4. Correspondence Clerk opens with the form pre-filled

**Features:**
- Extracts email subject, body, sender, date automatically
- Pre-fills form fields in Correspondence Clerk
- Auto-matches business/contact from email addresses
- Supports email threads and conversation views

For detailed setup instructions and troubleshooting, see [OUTLOOK_INTEGRATION.md](./OUTLOOK_INTEGRATION.md).

## Next Steps

After completing Step 1, the next step is:

**Step 2: Database migrations, constraints, and RLS**
- Create Supabase SQL migrations for businesses, contacts, correspondence tables
- Set up RLS policies
- Configure full-text search indexes

## Contact

Project maintained by Bridget Osborne
