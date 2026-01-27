# Correspondence Clerk - User Flow Documentation

## Primary User Flow: New Entry with Forced Filing

### Overview

The New Entry flow is designed to ensure that every piece of correspondence is properly filed under a specific business and contact person. This "forced filing" approach prevents orphaned entries and ensures the database remains organized.

### Step-by-Step Flow

#### 1. Entry Point
User navigates to "New Entry" page from dashboard or navigation menu.

#### 2. Paste or Type Correspondence
- **Large input area** prominently displayed (full width, 60vh minimum height)
- User can:
  - Paste email content (entire email thread or single email)
  - Type call notes
  - Type meeting notes
- Input accepts plain text or formatted text
- Auto-save to local storage every 30 seconds (prevents data loss)
- **Unsaved changes warning:** Browser prompt before navigating away

#### 3. Thread Detection (If Applicable)
**Triggers when:**
- Input contains multiple "From:" headers
- Multiple date stamps detected
- Email signature patterns repeated
- High confidence heuristics suggest email chain

**User sees:**
- Toggle switch: "Split into individual emails"
- Default state: ON if confidence is high, OFF if uncertain
- Explanatory text: "We detected this looks like an email chain with X messages"

**If user enables split:**
- Preview showing how many entries will be created
- Each entry shows: detected date, subject line guess, first 100 chars
- User can toggle individual entries on/off before proceeding

#### 4. Select Business (FORCED)
**Cannot proceed without selecting a business.**

**Interface:**
- Large, prominent dropdown/combobox labeled "Business *" (asterisk indicates required)
- Autocomplete search as user types
- Shows:
  - Business name (bold)
  - Category badge (if exists)
  - Last contacted date (gray text)
  - Status indicator (Club Card, Advertiser badges)
- Sorted by: recent activity first, then alphabetical

**Smart prefill behavior:**
- If email contains domain matching known contact: prefill suggestion highlighted in yellow
- If pasted text contains business name: prefill suggestion
- **User must still click to confirm** - no auto-selection

**"Add New Business" option:**
- Always visible at top of dropdown
- Opens inline form (doesn't navigate away):
  - Business name * (required)
  - Category (optional dropdown)
  - Status (optional checkboxes: Club Card, Advertiser)
- Save creates business and auto-selects it
- Cancel returns to dropdown

**After business selected:**
- Business card appears below dropdown showing:
  - Name
  - Category and status
  - Last contacted date
  - Lock icon (click to change selection)

#### 5. Select Contact within Business (FORCED)
**Cannot proceed without selecting a named contact.**

**This step only appears after business is selected.**

**Interface:**
- Large dropdown/combobox labeled "Contact Person *"
- Scoped to selected business only
- Autocomplete search
- Shows:
  - Contact name (bold)
  - Role (if exists)
  - Email (if exists)
  - Phone (if exists)
- Sorted by: most recent correspondence first, then alphabetical

**Smart prefill behavior:**
- If email From/To fields match known contact: prefill suggestion (yellow highlight)
- If business has only ONE contact: prefill suggestion
- **User must still click to confirm** - no auto-selection

**"Add New Contact" option:**
- Always visible at top of dropdown
- Opens inline form:
  - Name * (required)
  - Role (optional)
  - Email (optional)
  - Phone (optional)
- Save creates contact and auto-selects it

**After contact selected:**
- Contact card appears showing:
  - Name (bold, 16pt)
  - Role, Email, Phone (visible, not hidden)
  - "Edit details" link
  - Lock icon (click to change selection)

**If contact missing role, email, or phone:**
- Gentle prompt: "Would you like to add [role/email/phone] for [Name]?"
- Inline quick-add fields appear (not blocking)
- User can skip or fill in

#### 6. Optional Metadata
**Now that filing is confirmed, show optional fields:**

- **Entry Type** (buttons: Email, Call, Meeting)
  - Pre-selected if AI guessed with high confidence
  - Gray out if thread split (all will be Email)

- **Entry Date**
  - Datepicker, defaults to today
  - If AI detected date with high confidence: prefill suggestion (user can change)

- **Action Needed** (dropdown: none, prospect, follow_up, waiting_on_them, invoice, renewal)
  - Default: "none"

- **Due Date** (optional, only if action_needed != none)
  - Datepicker, no default

#### 7. Preview (Auto-Generated)
**Shown in right sidebar or below form on mobile:**
- Subject line guess (can edit inline)
- Detected entry date
- Business name → Contact name
- Formatted preview of correspondence body
- "This is how it will appear in the letter file"

#### 8. Save
**Large, prominent "Save Entry" button**
- Only enabled when Business AND Contact selected
- Shows loading spinner while processing
- If AI formatting fails: saves anyway as raw text marked "unformatted"

**After successful save:**
1. Show success message: "✓ Entry saved for [Business Name]"
2. Auto-navigate to business letter file page
3. Auto-scroll to the newly created entry (highlighted in yellow for 3 seconds)

**If save fails:**
- Show error inline (don't navigate away)
- Preserve all form data
- Show "Retry" button
- Offer "Save as draft" option (saves locally)

---

## Thread Split Toggle Flow

### When Thread Split is Enabled

#### Detection Phase
After user pastes text, system runs quick heuristic checks (< 100ms):

1. **Count indicators:**
   - "From:" or "From: " patterns
   - "Sent:" or "Date:" patterns
   - Email signatures (regex: "--", "Kind regards", "Best")
   - Quote markers (">", "|")

2. **Confidence scoring:**
   - **High (≥80%):** 3+ clear email boundaries, consistent date formats, signature patterns
   - **Medium (50-79%):** 2 email boundaries or inconsistent patterns
   - **Low (<50%):** Ambiguous, could be single email with forwarded content

3. **Default toggle state:**
   - High confidence: toggle ON by default
   - Medium/Low confidence: toggle OFF by default

#### User Interface

**Toggle shown as:**
```
┌─────────────────────────────────────────────────────┐
│ ☑ Split into individual emails (3 detected)        │
│                                                     │
│ We found what looks like an email chain with       │
│ 3 separate messages. Would you like us to create  │
│ 3 separate entries?                                │
│                                                     │
│ [ View preview ]                                   │
└─────────────────────────────────────────────────────┘
```

**If user clicks "View preview":**
Expandable section shows:
```
Entry 1: [✓] Email from John Smith - Re: Q1 Planning
         Date: 2024-01-15
         "Hi team, following up on..."

Entry 2: [✓] Email from Sarah Jones - Re: Q1 Planning
         Date: 2024-01-16
         "Thanks John, I agree that..."

Entry 3: [✓] Email from John Smith - Re: Q1 Planning
         Date: 2024-01-17
         "Perfect, let's move forward..."
```

User can uncheck individual entries if AI made mistakes.

#### What Gets Sent to AI

**If toggle ON:**
```json
{
  "action": "split_thread",
  "raw_text": "...",
  "confidence": 85
}
```

**AI Returns:**
```json
{
  "entries": [
    {
      "subject_guess": "Re: Q1 Planning",
      "entry_type_guess": "Email",
      "entry_date_guess": "2024-01-15T10:30:00Z",
      "formatted_text": "...",
      "warnings": []
    },
    // ... more entries
  ],
  "warnings": ["Could not parse date for entry 2"]
}
```

**If toggle OFF:**
```json
{
  "action": "format_single",
  "raw_text": "...",
}
```

AI Returns single entry format.

#### Saving Split Entries

**Important: All entries share the same Business and Contact selection.**

When user clicks "Save Entry" with split enabled:

1. **For each entry in the split:**
   - Create correspondence record
   - Use same `business_id`
   - Use same `contact_id`
   - Use same `user_id`
   - Use individual `entry_date`, `subject`, `formatted_text`
   - Store `raw_text_original` only for the first entry (to avoid duplication)

2. **Transaction guarantees:**
   - All-or-nothing: if any entry fails, rollback all
   - Update `business.last_contacted_at` only once (to the latest entry_date)

3. **After save:**
   - Navigate to business letter file
   - Show success message: "✓ 3 entries saved for [Business Name]"
   - Highlight all 3 new entries (in chronological order)

#### Thread Split Failure Handling

**If AI cannot confidently split:**
- Return single entry with warning
- Display warning to user: "We couldn't split this into separate emails with confidence. Would you like to save as a single entry or try manual split?"
- Offer manual mode: user can use text selection to mark boundaries

**If AI returns invalid JSON:**
- Fall back to single entry mode
- Show "Format later" option
- Save raw text with `formatted_text_original` = null

---

## Edge Cases and Error States

### No Contact Found for Business
- "Add New Contact" is the primary action
- Cannot skip or use "Unknown"
- Inline add form with minimal friction

### Email Domain Doesn't Match Any Business
- Smart search still available
- "Add New Business" clearly visible
- No forced delay or confirmation dialogs

### Ambiguous Thread Split
- Default to single entry (toggle OFF)
- Let user manually enable if they want to try
- Preview before committing

### AI Outage During Save
- Save succeeds anyway with raw text
- Entry marked with `formatted_text_original = null`
- Show "Format later" button on entry
- User can trigger reformat manually later

### User Navigates Away Before Saving
- Browser warning: "You have unsaved changes"
- Local storage backup (can recover on return)
- Offer "Save as draft" option

---

## Design Principles

1. **Forced filing is non-negotiable** - but make it fast and smart
2. **Smart defaults reduce clicks** - but never auto-save without confirmation
3. **Contact details are always visible** - role, email, phone shown when contact selected
4. **Fail gracefully** - AI problems never block the user
5. **Preserve user intent** - never rewrite, only format
6. **Clear feedback** - confirm saves, highlight new entries, show errors inline
7. **Mobile-friendly** - works on small screens, large touch targets
8. **Keyboard shortcuts** - power users can fly through the flow

---

## Success Metrics

- **Time to save entry:** < 30 seconds (average)
- **Forced filing compliance:** 100% (by design)
- **Contact details completion:** > 80% of contacts have role within 1 month
- **Thread split accuracy:** > 90% user satisfaction
- **Zero data loss:** Local storage + unsaved warnings
