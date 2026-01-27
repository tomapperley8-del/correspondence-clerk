# Correspondence Clerk - Glossary

## Business Terms

### Mastersheet
**Definition:** The authoritative spreadsheet (Mastersheet.csv) maintained by Chiswick Calendar that contains the complete business directory.

**Contents:**
- Business names and categories
- Contact information (Primary Contact, Other Contacts)
- Membership status (Club Card, Advertiser, or both)
- Contract periods and renewal dates
- Business status (Active, Prospect, Inactive)
- Financial information (invoicing, payment tracking)
- Source tracking (which Mastersheet rows correspond to each business)

**Import Behavior:**
- Some businesses appear **twice** in the Mastersheet if they are both Club Card members AND Advertisers
- The import process must **merge these duplicate entries** into a single business record with both flags set:
  - `is_club_card = true`
  - `is_advertiser = true`
- The `mastersheet_source_ids` JSONB field stores which Mastersheet rows contributed to this business record

**Example:**
```
Mastersheet Row 42: "Joe's Coffee" (Club Card member)
Mastersheet Row 156: "Joe's Coffee" (Advertiser)

→ Merged into single business:
   name: "Joe's Coffee"
   is_club_card: true
   is_advertiser: true
   mastersheet_source_ids: [42, 156]
```

---

### Club Card
**Definition:** A membership program offered by Chiswick Calendar where businesses pay an annual fee to be listed in the Club Card directory and offer discounts to Chiswick Calendar subscribers.

**Business Model:**
- **Standard fee:** £250 per year
- **Alternative model:** Some businesses (e.g., Big Yellow Storage) pay per successful referral instead (e.g., £40 per customer)

**Benefits for Businesses:**
- Dedicated page on the Chiswick Calendar Club Card section
- Featured in weekly newsletter
- Ability to change offers throughout the year
- Increased visibility to local subscribers

**User Redemption:**
- Subscribers have physical or digital Club Card to show vendors
- Some businesses integrate digital discount codes instead

**In the Database:**
- Stored as `businesses.is_club_card = true`
- Indicates this business is currently or was previously a Club Card member
- Related correspondence might include:
  - Renewal reminders
  - Offer updates
  - Subscriber feedback

---

### Advertiser
**Definition:** A business that purchases advertising space on the Chiswick Calendar website or in related publications (e.g., sidebar ads, leaderboard ads).

**Ad Types:**
- **Leaderboard:** Banner ad at top of page
  - 12 months @ £120/month
  - 6 months @ £140/month
  - 3 months @ £160/month

- **Sidebar:** Square ad in sidebar
  - 12 months @ £160/month
  - 6 months @ £180/month
  - 3 months @ £200/month

- **Custom/Seasonal:** Special campaigns (e.g., Artists at Home annual studio tour)

**Contract Tracking:**
- Start date, end date, renewal status
- Some advertisers are also Club Card members (dual status)

**In the Database:**
- Stored as `businesses.is_advertiser = true`
- Related correspondence might include:
  - Contract negotiations
  - Ad creative submissions
  - Performance reports
  - Renewal discussions

---

## Technical Terms

### MCP (Model Context Protocol)
**Definition:** The method used to generate and format Google Docs exports in the Correspondence Clerk application.

**Purpose:**
- Allows the application to programmatically create, format, and update Google Docs
- Provides a bridge between the Correspondence Clerk database and Google Workspace

**Use Cases in Correspondence Clerk:**
1. **Export Correspondence to Google Docs:**
   - Generate print-ready letter file per business
   - Apply professional formatting (bold titles, page breaks, cover page)
   - One-click export from business detail page

2. **Future possibilities:**
   - Auto-sync summaries back to Google Sheets
   - Generate monthly reports
   - Create formatted invoices

**Technical Implementation:**
```typescript
// Example: Export business correspondence to Google Docs
import { createGoogleDoc, appendToDoc, formatText } from '@/lib/mcp-client';

async function exportBusinessToGoogleDocs(businessId: string) {
  const docId = await createGoogleDoc(`${businessName} - Correspondence`);

  // Add cover page
  await appendToDoc(docId, coverPageContent);

  // Add entries with formatting
  for (const entry of entries) {
    await appendToDoc(docId, entry.formatted_text_current);
    await insertPageBreak(docId);
  }

  return { docId, url: `https://docs.google.com/document/d/${docId}` };
}
```

**Fallback:**
If MCP is unavailable or fails, the application can fall back to:
- Direct Google Docs API integration (requires OAuth setup)
- PDF generation using server-side rendering
- Plain text export as last resort

**Benefits over direct API:**
- Simpler integration
- Better error handling
- Consistent formatting across exports
- Easier to maintain

---

## Correspondence Terms

### Entry Type
**Definition:** The medium through which correspondence occurred.

**Types:**
- **Email:** Electronic mail (imported, pasted, or manually typed)
- **Call:** Phone call notes (manually typed)
- **Meeting:** In-person or virtual meeting notes (manually typed)

**Usage:**
- Helps filter and sort correspondence
- Provides context for formatting (e.g., emails might have signatures, calls have bullet points)
- Displayed in meta line: `Date | Type | Contact Name`

---

### Action Needed
**Definition:** A tag indicating what follow-up or next step is required for this correspondence.

**Values:**
- **none:** No action required (informational only)
- **prospect:** New potential customer to follow up with
- **follow_up:** General follow-up needed (user decision on timing)
- **waiting_on_them:** Ball is in their court (waiting for response)
- **invoice:** Need to send invoice or payment reminder
- **renewal:** Contract/membership renewal coming up

**Dashboard Sorting:**
Businesses with `action_needed != 'none'` appear at the top of the dashboard, sorted by:
1. Overdue items first (if `due_at` is in the past)
2. Oldest `last_contacted_at` next

**Usage:**
- Optional field when creating entry
- Can be updated later if situation changes
- Helps prioritize work on dashboard

---

### Formatted Text Versions
**Definition:** The three versions of correspondence text stored in the database.

**Fields:**

1. **`raw_text_original`** (IMMUTABLE)
   - Exactly what the user pasted or typed
   - Never modified after initial save
   - Preserved forever as the "source of truth"
   - Used for re-formatting if needed

2. **`formatted_text_original`** (IMMUTABLE)
   - AI-formatted version at time of creation
   - Never modified after initial save
   - May be `null` if AI was unavailable during save
   - Allows comparing current version to original AI output

3. **`formatted_text_current`** (EDITABLE)
   - Current version displayed in letter file and exports
   - Initially equals `formatted_text_original`
   - Can be manually edited by users (corrections, clarity)
   - Edits tracked via `edited_at` and `edited_by`

**Editing Flow:**
```
User saves new entry
  ↓
raw_text_original = user input (locked)
formatted_text_original = AI output (locked)
formatted_text_current = AI output (editable)
  ↓
User makes manual correction
  ↓
formatted_text_current = edited version
edited_at = timestamp
edited_by = user_id
  ↓
(raw_text_original and formatted_text_original remain unchanged)
```

**Why three versions?**
- Preserve exact original in case of questions ("What did they actually say?")
- Track what AI did initially (for debugging, improving prompts)
- Allow corrections without losing history
- Support "revert to original" functionality

---

### Thread Splitting
**Definition:** The process of detecting and separating an email chain into individual correspondence entries.

**When it happens:**
- User pastes a forwarded email chain or long thread
- Application detects multiple "From:" headers, date stamps, signatures
- User is offered a toggle: "Split into individual emails"

**How it works:**
1. **Heuristic detection:** Quick pattern matching (< 100ms)
   - Count email headers
   - Detect quote markers (>, |)
   - Identify signature patterns

2. **AI processing (if enabled):**
   - Anthropic API receives full thread
   - Returns array of separate entries with:
     - Individual dates
     - Individual subject lines
     - Individual formatted text
     - Warnings if uncertain

3. **User confirmation:**
   - Preview shows how many entries will be created
   - User can toggle individual entries on/off
   - All entries use same Business and Contact selection

4. **Saving:**
   - Multiple entries created in single transaction
   - Chronologically ordered (oldest first)
   - All share same business_id and contact_id

**Edge cases:**
- If AI cannot confidently split: offer manual mode or save as single entry
- If AI returns invalid JSON: fall back to single entry
- User always has final say via toggle and preview

---

## Database Terms

### Normalized Name / Normalized Email
**Definition:** Lowercase, trimmed, standardized version of a name or email used for deduplication and matching.

**Purpose:**
- Prevent duplicate businesses: "Joe's Coffee" vs "joe's coffee" vs "Joe's Coffee "
- Prevent duplicate contacts: "john@example.com" vs "JOHN@example.com"

**Implementation:**
```typescript
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
```

**Unique Constraints:**
- `businesses.normalized_name` is unique across all businesses
- `contacts.(business_id, normalized_email)` is unique within each business

**Usage:**
- Search and autocomplete use normalized versions for matching
- Display always uses original capitalization/spacing

---

### Row Level Security (RLS)
**Definition:** PostgreSQL feature that restricts database row visibility and modification based on the current user.

**Version 1 Policy:**
In the MVP, all authenticated users can access all data:

```sql
CREATE POLICY "Authenticated users can view all businesses"
  ON businesses FOR SELECT
  TO authenticated
  USING (true);
```

**Future Versions:**
May implement per-business permissions:
- Team members assigned to specific businesses
- Read-only vs read-write access
- Admin users with full access

**Why start with wide-open access?**
- Faster MVP development
- Single-user or small team use case
- Can tighten later without application code changes
- RLS is enforced at database level (secure by default)

---

### Search Vector (tsvector)
**Definition:** PostgreSQL's full-text search index type that enables fast keyword searches across large text fields.

**Implementation:**
```sql
search_vector TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(formatted_text_current, raw_text_original)), 'A') ||
  setweight(to_tsvector('english', coalesce(subject, '')), 'B')
) STORED
```

**How it works:**
- Automatically computed from `formatted_text_current` and `subject`
- Weighted: formatted text (A = highest), subject (B = high)
- Indexed using GIN (Generalized Inverted Index) for fast lookups
- Supports ranking results by relevance

**Query example:**
```typescript
const results = await supabase
  .from('correspondence')
  .select('*')
  .textSearch('search_vector', query, { type: 'plain' })
  .order('rank', { ascending: false })
  .limit(50);
```

**Benefits:**
- Sub-second search across thousands of entries
- Relevance ranking built-in
- Handles word stemming ("running" matches "run")
- Ignores common stop words ("the", "a", "is")
