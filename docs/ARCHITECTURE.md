# Correspondence Clerk - Architecture

## System Overview

The Correspondence Clerk is a full-stack web application built on:
- **Frontend:** Next.js 15 (React, App Router)
- **UI:** Tailwind CSS v4 + shadcn/ui (subtle 2-4px corners, soft shadows, warm palette via design tokens)
- **Backend:** Next.js Server Actions
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **AI:** Anthropic Claude (claude-sonnet-4-5) — formatting, action detection, thread splitting, Daily Briefing chat, inbound email processing
- **Export:** Google Docs via MCP
- **Email:** Postmark (inbound webhook + forwarding)
- **Deployment:** Vercel (auto-deploy from main)

## Database Schema

### Tables

#### `businesses`

```sql
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT UNIQUE NOT NULL,
  category TEXT,
  status TEXT,
  is_club_card BOOLEAN DEFAULT false,
  is_advertiser BOOLEAN DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  mastersheet_source_ids JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_businesses_normalized_name ON businesses(normalized_name);
CREATE INDEX idx_businesses_last_contacted ON businesses(last_contacted_at);
```

#### `contacts`

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  emails TEXT[] DEFAULT '{}',   -- array of email addresses
  phones TEXT[] DEFAULT '{}',   -- array of phone numbers
  role TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_business_id ON contacts(business_id);
CREATE INDEX idx_contacts_org_id ON contacts(org_id);
```

> **Note:** contacts.emails and phones are arrays, not single values. Always use JSON.parse with try/catch when reading legacy data, and array spread when adding new values.

#### `correspondence`

```sql
CREATE TYPE entry_type AS ENUM ('Email', 'Call', 'Meeting', 'Note');
CREATE TYPE action_status AS ENUM ('none', 'prospect', 'follow_up', 'waiting_on_them', 'invoice', 'renewal');
CREATE TYPE direction_type AS ENUM ('received', 'sent');
CREATE TYPE formatting_status AS ENUM ('formatted', 'unformatted', 'failed');

CREATE TABLE correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,  -- nullable: Notes have no contact
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,

  -- CC/BCC
  cc_contact_ids UUID[] DEFAULT '{}',
  bcc_contact_ids UUID[] DEFAULT '{}',

  -- Content versions
  raw_text_original TEXT NOT NULL,
  formatted_text_original TEXT,
  formatted_text_current TEXT,

  -- Metadata
  entry_date TIMESTAMPTZ,
  subject TEXT,
  type entry_type,
  direction direction_type,           -- only for emails
  formatting_status formatting_status DEFAULT 'unformatted',
  action_needed action_status DEFAULT 'none',
  due_at TIMESTAMPTZ,
  ai_metadata JSONB,
  content_hash TEXT,                  -- SHA256 for duplicate detection

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  edited_by UUID,

  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(formatted_text_current, raw_text_original)), 'A') ||
    setweight(to_tsvector('english', coalesce(subject, '')), 'B')
  ) STORED
);

-- Indexes
CREATE INDEX idx_correspondence_business_id ON correspondence(business_id);
CREATE INDEX idx_correspondence_contact_id ON correspondence(contact_id);
CREATE INDEX idx_correspondence_user_id ON correspondence(user_id);
CREATE INDEX idx_correspondence_entry_date ON correspondence(entry_date);
CREATE INDEX idx_correspondence_action_needed ON correspondence(action_needed) WHERE action_needed != 'none';
CREATE INDEX idx_correspondence_due_at ON correspondence(due_at) WHERE due_at IS NOT NULL;

-- Full-text search index
CREATE INDEX idx_correspondence_search_vector ON correspondence USING GIN(search_vector);
```

#### `organizations`

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_description TEXT,  -- used in Daily Briefing system prompt
  industry TEXT,               -- used in Daily Briefing system prompt
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `user_profiles`

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  display_name TEXT,
  role TEXT DEFAULT 'member',  -- member | admin
  google_access_token TEXT,
  google_refresh_token TEXT,
  microsoft_access_token TEXT,
  microsoft_refresh_token TEXT,
  inbound_email_token TEXT UNIQUE,   -- unique token for inbound forwarding address
  own_email_addresses TEXT[] DEFAULT '{}'  -- for BCC/sent detection
);
```

#### `inbound_queue`

```sql
CREATE TABLE inbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  from_email TEXT,
  to_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  direction TEXT,  -- 'received' | 'sent'
  status TEXT DEFAULT 'pending',  -- pending | filed | discarded
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `domain_mappings`

```sql
CREATE TABLE domain_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  domain TEXT NOT NULL,
  business_id UUID REFERENCES businesses(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, domain)
);
```

#### `duplicate_dismissals`

```sql
CREATE TABLE duplicate_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id),
  entry_id_1 UUID REFERENCES correspondence(id),
  entry_id_2 UUID REFERENCES correspondence(id),
  dismissed_by UUID,
  dismissed_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Row Level Security (RLS) Policies

### Version 1: All Authenticated Users Can Access Everything

```sql
-- Enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE correspondence ENABLE ROW LEVEL SECURITY;

-- businesses: authenticated users can do everything
CREATE POLICY "Authenticated users can view all businesses"
  ON businesses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update businesses"
  ON businesses FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete businesses"
  ON businesses FOR DELETE
  TO authenticated
  USING (true);

-- contacts: authenticated users can do everything
CREATE POLICY "Authenticated users can view all contacts"
  ON contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert contacts"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update contacts"
  ON contacts FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete contacts"
  ON contacts FOR DELETE
  TO authenticated
  USING (true);

-- correspondence: authenticated users can do everything
CREATE POLICY "Authenticated users can view all correspondence"
  ON correspondence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert correspondence"
  ON correspondence FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update correspondence"
  ON correspondence FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete correspondence"
  ON correspondence FOR DELETE
  TO authenticated
  USING (true);
```

**Note:** These policies provide wide-open access to all authenticated users. Future versions may implement per-business permissions or team-based access control.

## Modules

### 1. AI Integration Module (`lib/ai/`)

**Purpose:** Handle all communication with Anthropic API

**Files:**
- `formatter.ts` — Main formatting function (single combined call: format + action detection)
- `thread-detection.ts` — Client-side heuristics to detect email chains (< 100ms, no API call)
- `types.ts` — TypeScript types for AI response contracts

**Key behaviour:**
- Single Anthropic API call returns: subject, type, date, formatted_text, action_needed, urgency_level
- Structured outputs (JSON schema enforcement — zero parse errors)
- Prompt caching on system prompt (`cache_control: { type: 'ephemeral' }`)
- `stripQuotedContent()` from `lib/inbound/utils.ts` applied before building prompt
- Retry once on failure, then fall back to unformatted (never blocks saving)
- `quotedContent` stored in `ai_metadata` when stripped
- `isThreadSplitResponse()` type guard distinguishes single vs split responses

**Error Handling:**
- Network error / invalid JSON → save as unformatted, show "Format later" button
- Timeout → retry once, then unformatted
- Never throw — always return a result

### 2. Export Module (`lib/export/`)

**Purpose:** Generate print-ready Google Docs

**Files:**
- `google-docs-export.ts` - Main export logic
- `format-cover.ts` - Cover page with business metadata
- `format-entry.ts` - Format single entry with page break
- `mcp-client.ts` - MCP integration (or Google API fallback)

**Key Functions:**

```typescript
interface ExportOptions {
  businessId: string;
  includeContactDetails: boolean;
  dateRange?: { start: Date; end: Date };
}

async function exportToGoogleDocs(options: ExportOptions): Promise<{ docId: string; url: string }>;
```

**Export Format:**
1. Cover page: Business name, category, status, contact list
2. Entries in chronological order (oldest first)
3. Page break after each entry
4. Entry format:
   - **Subject Line** (bold, 14pt)
   - _Meta:_ Date | Type | Contact Name, Role (italic, 12pt)
   - Body text (formatted_text_current, 12pt)

### 3. Server Actions (`app/actions/`)

**Purpose:** All data mutations and queries — Next.js Server Actions (no separate lib/db layer)

**Pattern:** Every action checks auth + org_id first, then calls `revalidatePath` after mutations.

**Supabase clients:**
- `createClient()` from `@/lib/supabase/server` — for server actions and route handlers
- `createServiceRoleClient()` from `@/lib/supabase/service-role` — for cron jobs and session-less contexts (e.g. inbound webhook)

**Key actions:**
```
businesses.ts           Business CRUD + delete
contacts.ts             Contact CRUD + delete + update (emails/phones as arrays)
correspondence.ts       Correspondence CRUD + manual edits + delete + duplicate detection
ai-formatter.ts         AI formatting pipeline (format + action detection, fallback)
search.ts               Full-text search (websearch type for robust query parsing)
organizations.ts        getNavData() single round-trip; org profile update
membership-types.ts     Per-org membership type CRUD
duplicate-dismissals.ts Dismiss duplicate pairs
export-google-docs.ts   Google Docs export via MCP
import-mastersheet.ts   CSV import (idempotent, duplicate merging)
```

## Full-Text Search

**Implementation:**
- Uses PostgreSQL `tsvector` with GIN index
- Searches across `formatted_text_current` and `raw_text_original`
- Weighted: formatted text (A weight), subject (B weight)
- Returns results with rank and highlighted snippets

**Query Example:**

```typescript
async function searchCorrespondence(query: string): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('correspondence')
    .select(`
      id,
      subject,
      formatted_text_current,
      entry_date,
      businesses(name),
      contacts(name, role),
      ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
    `)
    .textSearch('search_vector', query, { type: 'plain' })
    .order('rank', { ascending: false })
    .limit(50);

  return data;
}
```

## Authentication Flow

1. User visits app → redirected to `/login` if not authenticated
2. Login with email/password via Supabase Auth
3. Session cookie stored (httpOnly)
4. All pages check `getSession()` in `middleware.ts`
5. Protected routes: `/dashboard`, `/businesses/:id`, `/new-entry`, `/search`
6. Public routes: `/login`, `/signup`

## Server Actions

All mutations use Next.js Server Actions for type safety and progressive enhancement:

**Examples:**

```typescript
// app/actions/correspondence.ts
'use server';

export async function createCorrespondenceEntry(
  data: CreateCorrespondenceInput
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized' };

  // Format with AI (with fallback)
  const formatted = await formatEntry(data.raw_text_original).catch(() => null);

  // Save to database
  const entry = await createCorrespondence({
    ...data,
    user_id: session.user.id,
    formatted_text_original: formatted?.formatted_text ?? null,
    formatted_text_current: formatted?.formatted_text ?? null,
  });

  // Update business last_contacted_at
  await updateBusiness(data.business_id, {
    last_contacted_at: entry.entry_date ?? new Date(),
  });

  return { success: true, data: entry };
}
```

## API Rate Limiting

**Anthropic API:**
- Tier 1: 50 requests/minute
- Implementation: exponential backoff + retry
- Fallback: allow saving unformatted if API unavailable

**Supabase:**
- Free tier: 500 MB database, 2 GB bandwidth
- Implementation: pagination for large result sets
- Monitor: database size, connection pool

## Performance Optimizations

1. **Lazy Loading:** Correspondence entries load 20 at a time
2. **Caching:** Business/contact lists cached in React Query
3. **Debouncing:** Search input debounced 300ms
4. **Indexes:** All foreign keys + search vectors indexed
5. **Pagination:** Cursor-based for correspondence feeds

## Error Handling Strategy

**AI Failures:**
- Network error → save as unformatted, show "Format later" button
- Invalid JSON → save as unformatted, log error
- Timeout → retry once, then save as unformatted

**Database Failures:**
- Duplicate email → show inline error, suggest existing contact
- Foreign key violation → show error, prevent form submission
- Connection lost → show offline banner, queue operations

**User Errors:**
- Missing required fields → inline validation
- Unsaved changes → browser warning before navigate
- Network timeout → show retry button, preserve form state

## Deployment Architecture

**Recommended Setup:**

```
[Browser]
  ↓
[Vercel Edge Network]
  ↓
[Next.js App (Vercel Functions)]
  ↓ ↓ ↓ ↓
  ↓ ↓ ↓ [Anthropic API]
  ↓ ↓ ↓
  ↓ ↓ [Google Docs API (MCP)]
  ↓ ↓
  ↓ [Postmark → /api/inbound-email]
  ↓
[Supabase]
  ├─ PostgreSQL
  ├─ Auth
  └─ Storage (future)
```

**Environment Variables:**

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=

# Email (production)
POSTMARK_SERVER_TOKEN=         # Inbound email webhook
SENDGRID_API_KEY=              # Outbound email sending
SENDGRID_FROM_EMAIL=

# Feature flags (all false by default)
FEATURE_BILLING_ENABLED=
FEATURE_PUBLIC_SIGNUP=
FEATURE_LANDING_PAGE=

# Stripe (when FEATURE_BILLING_ENABLED=true)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
# ... see CLAUDE.md for full Stripe env var list

# Cron
CRON_SECRET=
```

## Security Considerations

1. **SQL Injection:** Use parameterized queries (Supabase client handles this)
2. **XSS:** Sanitize user input before rendering (use DOMPurify for formatted text)
3. **CSRF:** Server Actions include built-in CSRF protection
4. **API Keys:** Never expose in client code, use server-side only
5. **RLS:** All database access protected by RLS policies
6. **Rate Limiting:** Implement on server actions for abuse prevention

## Monitoring & Observability

**Metrics to Track:**
- Correspondence entries created per day
- AI formatting success rate
- Search query latency
- Export generation time
- Active users per day

**Error Tracking:**
- Use Vercel Analytics or Sentry
- Log AI failures with context
- Monitor database connection errors

## Future Architecture Considerations

**v2 Enhancements:**
- Per-business permissions
- Audit trail for edits
- Offline support with sync
- Bulk import from email
- Mobile app (React Native)
- Advanced search filters
- Custom export templates
