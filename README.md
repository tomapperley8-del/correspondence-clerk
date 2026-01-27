# Correspondence Clerk

Turn messy correspondence into clean, chronological letter files.

## Overview

Web app that transforms real-world correspondence (emails, call notes, meeting notes) into organized, print-ready, chronological letter files per business. It replaces the manual workflow of copying and pasting into Word documents and folders.

**It is not a CRM.** It does not suggest, rewrite, or follow up. It files what happened.

**Production:** https://correspondence-clerk.vercel.app

## Tech Stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Supabase** (PostgreSQL + Auth + RLS)
- **Anthropic Claude API** (AI formatting with structured outputs)
- **Tailwind CSS v4** + shadcn/ui (no rounded corners, no shadows)
- **Vercel** (auto-deploys from `main`)

## Setup

```bash
npm install
cp .env.local.example .env.local   # Add your Supabase + Anthropic keys
npm run dev                         # http://localhost:3000
```

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # ESLint
npm start         # Production server
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guide and hard rules
- [docs/](./docs/) - Architecture, PRD, user flow, glossary, deployment guides

## Contact

Project maintained by Tom Apperley
