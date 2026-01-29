# Correspondence Clerk User Guide

A practical guide to using Correspondence Clerk for managing business correspondence.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Features Guide](#features-guide)
3. [How-To Guides](#how-to-guides)
4. [Troubleshooting](#troubleshooting)
5. [Glossary](#glossary)

---

## Quick Start

### What is Correspondence Clerk?

Correspondence Clerk is a digital filing system for business correspondence. It replaces manual Word document letter files with a searchable, organized system that files emails, calls, and meeting notes by business and contact.

**What it does:**
- Files emails, calls, and meeting notes in one place
- Organizes everything by business, in chronological order
- Makes past correspondence instantly searchable
- Generates print-ready documents when needed

**What it doesn't do:**
- It's not a CRM (no sales pipeline or deal tracking)
- It doesn't suggest next steps or auto-follow-ups
- It doesn't rewrite your words - it preserves them exactly

### How to Add Your First Entry

1. Click **New Entry** from the navigation
2. **Select a business** - type to search, or click "Add New Business"
3. **Select a contact** - the person you corresponded with (required)
4. **Paste or type** your email, call notes, or meeting notes
5. **Set the date** - required; time is optional
6. Click **Save Entry**

The system will:
- Format your text with AI (optional, can save without)
- File it under the business
- Update the "last contacted" date

### Finding Past Correspondence

**Search bar (top of page):**
- Type a business name or keyword
- Results prioritize business name matches
- Click any result to view the letter file

**Business page:**
- Click a business on the Dashboard
- See all correspondence in chronological order
- Recent entries appear first

---

## Features Guide

### Dashboard

The Dashboard shows all businesses sorted by what needs attention:

1. **Action needed** - businesses with pending follow-ups
2. **Overdue** - entries with past-due dates
3. **Least recently contacted** - businesses you haven't touched in a while

**Each business card shows:**
- Name and category
- Status flags (Club Card, Advertiser)
- Last contacted date
- Action badges if follow-up is needed

**Filtering:** Click the filter buttons to show only Club Card members, Advertisers, or entries needing action.

### Adding Entries

Navigate to **New Entry** to file correspondence.

**Required fields:**
- Business (must select or create one)
- Contact (must name a real person - no placeholders)
- Entry date
- Entry text

**Optional fields:**
- Entry time
- Subject line
- Entry type (Email, Call, Meeting)
- Direction (Received/Sent - required for emails)
- Action needed status
- Due date for follow-ups
- CC contacts (additional people to associate with the entry)

**CC Contacts:**
When filing an email that was sent to multiple people, you can select additional contacts to CC. The primary contact is required; CC contacts are optional.

### Email Import (Outlook and Gmail)

Install the bookmarklet to import emails with one click.

**Installing the bookmarklet:**
1. Go to Settings > Tools, or visit `/install-bookmarklet`
2. Select your email client (Outlook or Gmail)
3. Drag the bookmarklet button to your bookmarks bar

**Using the bookmarklet:**
1. Open an email in Outlook Web or Gmail
2. Click the bookmarklet in your bookmarks bar
3. Correspondence Clerk opens with the email pre-filled
4. Select business and contact, then save

**Supported email clients:**
- **Outlook**: outlook.com, outlook.office.com, outlook.live.com
- **Gmail**: mail.google.com

### Search

The search function finds correspondence across all businesses.

**How to search:**
- Use the search bar on the Dashboard or navigate to `/search`
- Type any keyword or business name
- Results show matching entries with context

**Search tips:**
- Business names rank higher than content matches
- Search is case-insensitive
- Results show which entry and business matched

### Contact Management

Every correspondence entry must link to a specific contact.

**Adding contacts:**
- When filing a new entry, click "Add New Contact"
- Enter their name (required)
- Optionally add role, email, phone, and notes

**Editing contacts:**
- Go to the business page
- Find the contact in the Contacts section
- Click "Edit" to update details

**Contact details are always visible:**
- Role and email shown on contact cards
- Notes display below contact info (truncated if long)
- Click Edit to see full notes

### Business Management

Businesses organize your correspondence by company.

**Adding businesses:**
- When filing a new entry, click "Add New Business"
- Enter the business name
- Optionally set category and flags

**Editing businesses:**
- Go to the business page
- Click "Edit Business" to update details

### Exporting to Google Docs

Create a print-ready document of all correspondence for a business.

**How to export:**
1. Open the business letter file
2. Click "Export to Google Docs"
3. Wait for the document to be created
4. Click the link to open in Google Docs

**What's included:**
- Cover page with business details
- Contact list with roles
- All correspondence in chronological order
- Page breaks between entries

---

## How-To Guides

### How to Import from Outlook Web

1. **Install the bookmarklet:**
   - Go to Settings > Tools
   - Make sure "Outlook" is selected
   - Drag the bookmarklet button to your bookmarks bar

2. **Import an email:**
   - Open the email in Outlook Web (not the desktop app)
   - Make sure the email is fully loaded
   - Click the bookmarklet in your bookmarks bar
   - Correspondence Clerk opens in a new tab

3. **Complete the entry:**
   - Verify the extracted subject, date, and content
   - Select the business (may auto-match if contact email is known)
   - Select or create the contact
   - Click Save Entry

### How to Import from Gmail

1. **Install the bookmarklet:**
   - Go to Settings > Tools
   - Select "Gmail" (not Outlook)
   - Drag the bookmarklet button to your bookmarks bar

2. **Import an email:**
   - Open the email in Gmail (mail.google.com)
   - Make sure you're viewing a single email, not just the thread summary
   - Click the bookmarklet in your bookmarks bar
   - Correspondence Clerk opens in a new tab

3. **Complete the entry:**
   - Verify the extracted content
   - Select business and contact
   - Save the entry

### How to Add Multiple Contacts (Primary + CC)

When filing correspondence that involves multiple people:

1. Start a new entry as normal
2. Select the primary contact (required)
3. Below the contact selector, you'll see "CC Contacts (optional)"
4. Check the boxes next to any additional people who were part of the correspondence
5. Save the entry

The entry will show both the primary contact and CC'd contacts when viewed.

### How to Edit Correspondence

1. Open the business page
2. Find the entry you want to edit
3. Click "Edit Entry"
4. Modify the formatted text, date, direction, or contact
5. Click "Save Changes"

**What you can edit:**
- Formatted text (for corrections)
- Entry date
- Direction (Received/Sent)
- Assigned contact

**What's preserved:**
- Original text (never changes)
- Original formatted text (kept as reference)
- Edit history (who edited and when)

### How to Delete Entries Safely

1. Open the business page
2. Find the entry to delete
3. Click "Delete Entry"
4. Confirm the deletion in the dialog

**Warning:** Deletion is permanent. Consider editing instead if you just need to correct something.

---

## Troubleshooting

### Bookmarklet Not Working

**"Please open while viewing an email..."**
- Make sure you're on the correct email service (Outlook Web or Gmail)
- The bookmarklet won't work on desktop apps, only web versions

**"Could not extract email body"**
- Make sure the email is fully loaded before clicking
- Try clicking on the email to open it fully (not just preview)
- Some emails with unusual formatting may not extract properly

**"Popup blocked"**
- Allow popups for your email service in your browser settings
- Look for a blocked popup icon in the address bar

**Fields are empty after clicking bookmarklet**
- Check that you're logged into Correspondence Clerk
- Try refreshing the email page and clicking again
- Check browser console for errors (F12)

### AI Formatting Failed

When AI formatting fails, you can still save your entry:

1. Your entry is saved as "unformatted"
2. A "Format later" option appears on the entry
3. Click to retry formatting when the service is available

**Why it happens:**
- Temporary API issues
- Very long or complex text
- Network connectivity problems

**Your data is safe:** The original text is always preserved.

### Contact Not Appearing

**Contact not in dropdown:**
- Make sure you've selected the correct business first
- Contacts are scoped to the selected business
- Click "Add New Contact" to create one

**Contact auto-match didn't work:**
- The email address may not be in the system
- Add the contact manually and include their email for future matching

### Cannot Save Entry

**"Business is required"**
- Select a business from the dropdown, or add a new one

**"Contact is required"**
- Select a contact from the dropdown, or add a new one
- You must name a real person (no placeholders allowed)

**"Entry text is required"**
- Enter or paste some text in the entry field

**"Direction is required for emails"**
- For email entries, select "Received" or "Sent"

---

## Glossary

### Action Needed
A flag indicating follow-up is required. Types: none, prospect, follow up, waiting on them, invoice, renewal.

### CC Contacts
Additional contacts associated with a correspondence entry beyond the primary contact. Optional.

### Club Card
A membership category for Chiswick Calendar members.

### Direction
Whether an email was received from or sent to the contact.

### Entry
A single piece of correspondence (email, call notes, or meeting notes).

### Formatted Text
AI-improved layout of your text with better spacing and structure. Your wording is never changed.

### Letter File
The chronological feed of correspondence for a business.

### Primary Contact
The main person associated with a correspondence entry. Required.

### Raw Text Original
The exact text you entered, preserved permanently.

### Thread Splitting
When an email chain is detected, you can split it into individual entries.

### Unformatted Entry
An entry saved when AI formatting was unavailable. Can be formatted later.

---

## Need More Help?

**Technical issues:** Check browser console (F12) for error messages.

**Questions about features:** Review this guide or ask your team administrator.

**Bug reports:** Report issues at https://github.com/anthropics/claude-code/issues

---

*Last updated: January 2026*
