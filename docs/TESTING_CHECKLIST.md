# Correspondence Clerk Testing Checklist

This checklist provides systematic testing for all features. Check off items as you test them and record any issues found.

**Testing Instructions:**
- Test each item methodically
- Record "Pass" or "Fail" with notes
- For failures, create GitHub issues and reference them here
- Re-test after fixes
- Update this checklist when new features are added

---

## Authentication & Onboarding

### Login/Signup
- [ ] **Login with valid credentials** - User can log in successfully
- [ ] **Login with invalid credentials** - Shows appropriate error
- [ ] **Signup with new email** - Creates account and logs in
- [ ] **Signup with existing email** - Shows appropriate error
- [ ] **Password reset flow** - Email sent and reset works
- [ ] **Session persistence** - User stays logged in after page refresh
- [ ] **Logout** - User can log out and is redirected to login

### Organization Creation
- [ ] **Create new organization as first user** - Organization created successfully
- [ ] **Organization name validation** - Rejects invalid names
- [ ] **Redirect to dashboard after creation** - Navigates correctly

### Invitation Flow
- [ ] **Send invitation** - Email sent with valid link
- [ ] **Accept invitation** - User joins organization
- [ ] **Invitation link expires** - Old links show appropriate error
- [ ] **Revoke pending invitation** - Invitation removed from list
- [ ] **View pending invitations** - List shows all pending invites

**Notes:**


---

## Dashboard

### Basic Display
- [ ] **Load dashboard with no businesses** - Shows empty state message
- [ ] **Load dashboard with 1 business** - Displays correctly
- [ ] **Load dashboard with 10+ businesses** - All visible, no performance issues
- [ ] **Load dashboard with 100+ businesses** - Pagination or lazy loading works

### Filtering
- [ ] **Filter by Club Card only** - Shows only Club Card businesses
- [ ] **Filter by Advertiser only** - Shows only Advertiser businesses
- [ ] **Filter by both** - Shows businesses that are both
- [ ] **Filter by Action Needed** - Shows only businesses with action flags
- [ ] **Clear filters** - Returns to all businesses

### Sorting
- [ ] **Sort by most recent contact** - Correct order
- [ ] **Sort by least recent contact** - Correct order (oldest first)
- [ ] **Sort alphabetically** - A-Z order
- [ ] **Sort by overdue** - Overdue entries first

### Search
- [ ] **Search for business name (exact match)** - Found immediately
- [ ] **Search for business name (partial match)** - Results ranked correctly
- [ ] **Search with no results** - Shows "No results found"
- [ ] **Search clears when filter changes** - Input resets appropriately

### Business Cards
- [ ] **Display business name** - Correct
- [ ] **Display category** - Correct
- [ ] **Display status flags** - Club Card/Advertiser badges visible
- [ ] **Display last contacted date** - Formatted correctly
- [ ] **Display "Action needed" badge** - Visible when flagged
- [ ] **Display "Overdue" badge** - Visible when due_at is past
- [ ] **Click business card** - Opens letter file page

**Notes:**


---

## New Entry Page

### Basic Input
- [ ] **Paste plain text** - Saves correctly
- [ ] **Paste email with headers** - Headers parsed, email saved
- [ ] **Paste email thread** - Detects thread and offers split toggle
- [ ] **Type call notes** - Saves as "Call" type
- [ ] **Type meeting notes** - Saves as "Meeting" type
- [ ] **Paste very long text (10,000+ chars)** - Handles without error
- [ ] **Paste text with special characters** - Preserves characters correctly

### Business Selection
- [ ] **Search for existing business** - Dropdown shows matches
- [ ] **Select business with one contact** - Contact auto-selected
- [ ] **Select business with multiple contacts** - Dropdown shows all contacts
- [ ] **Add new business inline** - Modal opens, saves, selects new business
- [ ] **Cancel add new business** - Returns to selection
- [ ] **Business search with no results** - Shows "Add New Business" option

### Contact Selection
- [ ] **Select contact from dropdown** - Shows name, role, email
- [ ] **Contact with missing email** - Prompts to add inline
- [ ] **Contact with missing role** - Prompts to add inline
- [ ] **Add new contact inline** - Modal opens, saves, selects new contact
- [ ] **Cancel add new contact** - Returns to selection
- [ ] **Contact dropdown scoped to selected business** - Only shows relevant contacts

### Smart Defaults
- [ ] **Paste email with recognizable domain** - Suggests business/contact
- [ ] **Business with single contact** - Auto-selects contact
- [ ] **Must explicitly confirm before saving** - No auto-save without user action
- [ ] **Entry type auto-detected** - Email vs Call vs Meeting guessed correctly

### Thread Splitting
- [ ] **Split toggle appears for detected threads** - Toggle visible
- [ ] **Split toggle defaults ON** - Only when confidence is high
- [ ] **Split toggle defaults OFF** - When uncertain
- [ ] **Preview shows number of entries** - Count is accurate
- [ ] **Split thread creates multiple entries** - All entries created in chronological order
- [ ] **Split preserves individual dates** - Each entry has correct date
- [ ] **Cancel split** - Saves as single entry
- [ ] **Split with malformed thread** - Handles gracefully, doesn't crash

### AI Formatting
- [ ] **AI formats plain text** - Improves spacing and layout
- [ ] **AI preserves wording** - No rewrites or summaries
- [ ] **AI formats bullet lists** - Lists render correctly
- [ ] **AI formats numbered lists** - Numbers preserved
- [ ] **AI fails gracefully** - Saves as unformatted, shows "Format later" button
- [ ] **Format later button works** - Retries formatting successfully

### Optional Fields
- [ ] **Set entry type manually** - Overrides auto-detection
- [ ] **Set action needed flag** - Saves correctly
- [ ] **Set due date** - Date picker works, saves correctly
- [ ] **Due date in past** - Accepts and flags as overdue
- [ ] **Due date validation** - Rejects invalid dates

### Save and Validation
- [ ] **Save with all fields complete** - Success, redirects to business page
- [ ] **Save with missing business** - Validation error shown
- [ ] **Save with missing contact** - Validation error shown
- [ ] **Save with empty text** - Validation error shown
- [ ] **Save duplicate entry** - Warns and offers options
- [ ] **"Entry saved" confirmation** - Message shown after save
- [ ] **Navigate to saved entry** - Jumps to entry in business letter file

### Unsaved Changes Warning
- [ ] **Navigate away with unsaved text** - Browser warning appears
- [ ] **Confirm navigate away** - Leaves page, text discarded
- [ ] **Cancel navigate away** - Stays on page, text preserved

**Notes:**


---

## Business Detail Page (Letter File)

### Display
- [ ] **Load business with no entries** - Shows empty state
- [ ] **Load business with 1 entry** - Entry displays correctly
- [ ] **Load business with 10+ entries** - All visible in chronological order
- [ ] **Load business with 100+ entries** - Lazy loading works

### Entry Display
- [ ] **Entry shows subject line** - Correct, max 90 chars
- [ ] **Entry shows meta line** - Date, type, contact name, role visible
- [ ] **Entry shows formatted text** - Body renders with correct formatting
- [ ] **Entry preserves original wording** - No rewrites
- [ ] **Entry with action needed flag** - Badge visible
- [ ] **Entry with due date** - Date shown
- [ ] **Entry with overdue date** - "Overdue" badge visible

### Lazy Loading
- [ ] **Scroll to bottom** - Loads older entries automatically
- [ ] **Load more button** - Manually trigger load more
- [ ] **No more entries** - Shows "No more entries" message

### Contacts Section
- [ ] **Display all contacts for business** - List shown with name, role, email, phone
- [ ] **Add new contact** - Button works, contact added
- [ ] **Edit contact inline** - Modal opens, changes save
- [ ] **Delete contact** - Confirmation required, deletion works
- [ ] **Contact with missing details** - Shows placeholders or "Not provided"

### Actions
- [ ] **Edit entry** - Opens edit modal, changes save
- [ ] **Delete entry** - Confirmation required, deletion works
- [ ] **Export to Google Docs** - Button visible and works
- [ ] **AI summary (if implemented)** - Generates correctly

### Search Within Business
- [ ] **Search within business entries** - Filters to matching entries
- [ ] **Clear search** - Shows all entries again

**Notes:**


---

## Search Page

### Business Name Search
- [ ] **Search by exact business name** - Found immediately
- [ ] **Search by partial business name** - Results ranked by relevance
- [ ] **Search case-insensitive** - Finds regardless of case
- [ ] **Click business result** - Navigates to business letter file

### Keyword Search
- [ ] **Search for keyword in correspondence** - Finds matching entries
- [ ] **Search for phrase** - Exact phrase matching works
- [ ] **Search across all businesses** - Results from multiple businesses
- [ ] **Highlight search term in results** - Snippet shows highlighted match
- [ ] **Search result shows business and contact** - Context provided

### Results Display
- [ ] **Results prioritize business names** - Business name matches rank higher
- [ ] **Results show entry snippet** - Preview includes matched text
- [ ] **Results show entry date and type** - Metadata visible
- [ ] **Click result** - Navigates to specific entry in business letter file

### Performance
- [ ] **Search with 100+ results** - Loads quickly (< 2 seconds)
- [ ] **Search with no results** - Shows "No results found" message
- [ ] **Search with very long query** - Handles gracefully

**Notes:**


---

## Export to Google Docs

### Basic Export
- [ ] **Export business with 1 entry** - Google Doc created successfully
- [ ] **Export business with 10 entries** - All entries included
- [ ] **Export business with 50+ entries** - Handles large exports, no timeout
- [ ] **Export generates shareable link** - Link provided to user

### Export Format
- [ ] **Cover page includes business name** - Correct
- [ ] **Cover page includes category and status** - Correct
- [ ] **Cover page includes contact list** - All contacts with roles and details
- [ ] **Entries in chronological order** - Oldest first
- [ ] **Page break between entries** - Each entry starts on new page
- [ ] **Entry format correct** - Subject, meta line, body text
- [ ] **Formatted text used** - Uses formatted_text_current, not raw

### Google Drive Integration
- [ ] **Document created in correct location** - Root or specified folder
- [ ] **Document naming** - Uses business name + date
- [ ] **Document is editable** - User can edit in Google Docs

### Error Handling
- [ ] **Google API unavailable** - Shows appropriate error message
- [ ] **Export timeout** - Handles gracefully, offers retry
- [ ] **Network interruption** - Fails gracefully, can retry

**Notes:**


---

## Organization & Team Management

### Settings Page
- [ ] **View organization name** - Displayed correctly
- [ ] **Edit organization name** - Changes save
- [ ] **View team member list** - All members shown
- [ ] **View pending invitations** - All pending shown

### Invite Team Members
- [ ] **Invite with valid email** - Invitation sent
- [ ] **Invite with invalid email** - Validation error
- [ ] **Invite duplicate email** - Shows error or warning
- [ ] **Resend invitation** - Email sent again
- [ ] **Revoke invitation** - Removed from pending list

### Team Member Visibility
- [ ] **New member sees all businesses** - Full access immediately
- [ ] **New member sees all correspondence** - Shared visibility works
- [ ] **Attribution on entries** - Shows who created each entry

**Notes:**


---

## Admin Features

### Import Businesses from CSV
- [ ] **Upload valid Mastersheet CSV** - Businesses imported
- [ ] **Handle duplicate businesses** - Merges Club Card + Advertiser correctly
- [ ] **Import contacts** - Primary and other contacts created
- [ ] **Import report generated** - Shows counts and errors
- [ ] **Import idempotent** - Re-running doesn't duplicate
- [ ] **Import with malformed CSV** - Shows validation errors

### Import from Google Docs (if implemented)
- [ ] **Connect to Google Drive** - Authentication works
- [ ] **Select Google Doc** - File picker works
- [ ] **Parse Google Doc content** - Extracts text correctly
- [ ] **Create correspondence entries** - Imports as entries

### Run Migrations
- [ ] **Run database migration** - Executes successfully
- [ ] **Migration rollback** - Can undo if needed
- [ ] **Migration error handling** - Shows clear errors

**Notes:**


---

## Error Handling & Edge Cases

### AI Failures
- [ ] **Anthropic API unavailable** - Saves unformatted, shows "Format later"
- [ ] **AI timeout (> 30 seconds)** - Retries once, then saves unformatted
- [ ] **Invalid JSON from AI** - Handles gracefully, saves unformatted
- [ ] **Rate limit exceeded** - Shows appropriate message, queues for later

### Database Errors
- [ ] **Duplicate contact email** - Validation prevents, suggests existing
- [ ] **Foreign key violation** - Error shown, form blocked from submitting
- [ ] **Connection lost** - Offline banner shown, operations queued
- [ ] **Supabase RLS blocks operation** - Clear error message shown

### User Input Errors
- [ ] **Invalid email format** - Validation error shown
- [ ] **Empty required fields** - Inline validation prevents save
- [ ] **SQL injection attempt** - Safely handled (parameterized queries)
- [ ] **XSS attempt in text** - Sanitized before rendering

### Network Issues
- [ ] **Slow network (simulated)** - Loading states shown
- [ ] **Network timeout** - Retry button appears
- [ ] **Offline mode** - Appropriate message shown

**Notes:**


---

## Performance & Scalability

### Load Times
- [ ] **Dashboard loads in < 2 seconds** - With 100 businesses
- [ ] **Business page loads in < 2 seconds** - With 50 entries
- [ ] **Search results in < 1 second** - With 1000+ entries in database
- [ ] **New entry save in < 3 seconds** - Including AI formatting

### Pagination & Lazy Loading
- [ ] **Lazy load works smoothly** - No janky scrolling
- [ ] **Pagination controls work** - Next/prev buttons functional
- [ ] **Cursor-based pagination** - Handles large datasets

### Database Queries
- [ ] **Indexes used correctly** - Check query plans (admin only)
- [ ] **No N+1 queries** - Single query for lists with relations
- [ ] **Full-text search fast** - GIN index effective

**Notes:**


---

## Mobile & Responsive Design

### Mobile Views
- [ ] **Dashboard on mobile** - Stacks correctly
- [ ] **New entry on mobile** - Input area usable
- [ ] **Business page on mobile** - Entries readable
- [ ] **Search on mobile** - Input and results work
- [ ] **Navigation on mobile** - Hamburger menu works

### Tablet Views
- [ ] **Dashboard on tablet** - Responsive layout
- [ ] **Forms on tablet** - Inputs correctly sized
- [ ] **Two-column layouts adapt** - No horizontal scroll

**Notes:**


---

## Accessibility

### Keyboard Navigation
- [ ] **Tab through forms** - All inputs reachable
- [ ] **Enter to submit** - Works on forms
- [ ] **Escape to close modals** - Works consistently
- [ ] **Skip to main content** - Link present

### Screen Reader
- [ ] **Labels on all inputs** - ARIA labels or visible labels
- [ ] **Headings hierarchy** - H1, H2, H3 used correctly
- [ ] **Alt text on images** - Present where applicable
- [ ] **Error announcements** - Screen reader announces errors

### Visual
- [ ] **High contrast mode** - Text readable
- [ ] **Focus indicators** - Visible on all interactive elements
- [ ] **Color not sole indicator** - Status shown with text/icons too

**Notes:**


---

## Security

### Authentication
- [ ] **Password requirements enforced** - Min length, complexity
- [ ] **Session timeout** - User logged out after inactivity
- [ ] **CSRF protection** - Server actions protected
- [ ] **XSS sanitization** - User input sanitized

### Authorization
- [ ] **RLS policies enforced** - Can't access other org's data
- [ ] **Unauthenticated requests blocked** - Redirected to login
- [ ] **API keys not exposed** - Client-side code safe

**Notes:**


---

## Test Results Summary

**Total Tests:** _Count when complete_
**Passed:** _Count_
**Failed:** _Count_
**Not Applicable:** _Count_

**Critical Issues Found:**
1.
2.
3.

**Minor Issues Found:**
1.
2.
3.

**Testing Completed By:** _Your Name_
**Date:** _Date_
**Version Tested:** _Version Number_

---

## Continuous Testing

**Re-test before each release:**
- [ ] All critical path features (login, new entry, search, export)
- [ ] Any features changed since last release
- [ ] All items that previously failed

**Regression testing:**
- [ ] Test old bugs to ensure they haven't resurfaced
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile device testing (iOS Safari, Android Chrome)

---

**Last Updated:** [Date]
**Next Review:** [Date]
